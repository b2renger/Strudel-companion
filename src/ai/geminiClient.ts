/**
 * Direct browser-to-Google Gemini client.
 *
 * Replaces the five `fetch('/api/...')` calls that pointed at the Express
 * server. On a static host those returned the 404 page, `res.json()` threw,
 * and the error was swallowed into rule-based output while the UI still said
 * "Gemini connected".
 *
 * Implementation notes, each load-bearing:
 *
 *  - Plain `fetch`, not `@google/genai`. The SDK sends an `Api-Revision`
 *    header that is not in this endpoint's `Access-Control-Allow-Headers`
 *    allowlist, so the CORS preflight fails (googleapis/js-genai#1723). A
 *    request carrying only `content-type` and `x-goog-api-key` preflights
 *    cleanly. It is also far smaller in the bundle.
 *  - The key travels in the `x-goog-api-key` HEADER, never `?key=`, so it
 *    stays out of browser history, `Referer` and proxy logs.
 *  - `responseSchema` gives real constrained decoding, which is strictly
 *    better than asking for JSON in the prompt text.
 *  - Errors are classified and surfaced. Nothing here falls back silently.
 */

/**
 * Tried in order. Verified against ai.google.dev.
 *
 * `gemini-2.0-flash` and `gemini-flash-latest` were in the old server chain
 * and are gone: the first is shut down, the second is not a documented
 * endpoint.
 */
import { log, event, error as logError, timer, group, preview, estimateTokens } from './diagnostics';

export const GEMINI_MODEL_CHAIN = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
] as const;

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Per-attempt timeout, by position in the chain.
 *
 * A flat 30 seconds meant a single unresponsive model cost half a minute
 * before the chain moved on: the session trace has two calls that took 31.8s
 * end to end for a successful leg that itself took 1.8s. The first models are
 * given less patience because there is a fallback right behind them; the last
 * one gets the full budget because there is nothing after it.
 */
const ATTEMPT_TIMEOUTS_MS = [12_000, 18_000, 30_000];

export class GeminiError extends Error {
  readonly kind: 'no-key' | 'auth' | 'rate-limit' | 'bad-request' | 'network' | 'empty';
  readonly retryAfterSeconds?: number;
  constructor(
    kind: GeminiError['kind'],
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'GeminiError';
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Minimal OpenAPI-subset schema, as `generationConfig.responseSchema` wants. */
export type GeminiSchema = Record<string, unknown>;

export interface GeminiCallOptions {
  apiKey: string;
  systemInstruction: string;
  userPrompt: string;
  schema?: GeminiSchema;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  /** Called as the client walks the model chain. */
  onAttempt?: (model: string, index: number, total: number) => void;
}

/**
 * Calls Gemini and returns the raw text part.
 *
 * Walks `GEMINI_MODEL_CHAIN` on rate limits and server errors. Authentication
 * and malformed-request failures are NOT retried — a different model will not
 * fix a rejected key.
 */
export async function callGemini(options: GeminiCallOptions): Promise<string> {
  const {
    apiKey,
    systemInstruction,
    userPrompt,
    schema,
    temperature = 0.8,
    maxOutputTokens = 3000,
    signal,
    onAttempt,
  } = options;

  if (!apiKey) {
    throw new GeminiError('no-key', 'No Gemini API key has been set.');
  }

  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(schema
        ? { responseMimeType: 'application/json', responseSchema: schema }
        : {}),
    },
  });

  let lastError: GeminiError | null = null;

  for (let i = 0; i < GEMINI_MODEL_CHAIN.length; i++) {
    const model = GEMINI_MODEL_CHAIN[i];
    onAttempt?.(model, i, GEMINI_MODEL_CHAIN.length);
    const t = timer('gemini', `${model} (attempt ${i + 1}/${GEMINI_MODEL_CHAIN.length})`);
    if (i === 0) {
      group('gemini', `request (~${estimateTokens(userPrompt + systemInstruction)} est. tokens)`, () => {
        log('gemini', preview(userPrompt, 3500));
      });
    }

    // Own timeout, linked to any caller-supplied cancellation.
    const timeoutMs = ATTEMPT_TIMEOUTS_MS[i] ?? 30_000;
    const timeoutCtl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtl.abort(), timeoutMs);
    const onCallerAbort = () => timeoutCtl.abort();
    signal?.addEventListener('abort', onCallerAbort);

    try {
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body,
        signal: timeoutCtl.signal,
      });

      log('gemini', `HTTP ${res.status} from ${model}`);
      if (res.ok) {
        const data = await res.json();
        const usage = data?.usageMetadata;
        if (usage) {
          log('gemini', `tokens in=${usage.promptTokenCount} out=${usage.candidatesTokenCount} total=${usage.totalTokenCount}`);
        }
        const text: string =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p?.text ?? '')
            .join('') ?? '';

        if (!text.trim()) {
          const blockReason = data?.promptFeedback?.blockReason;
          throw new GeminiError(
            'empty',
            blockReason
              ? `Gemini returned nothing (${blockReason}).`
              : 'Gemini returned an empty response.',
          );
        }
        t.end(`${model} OK`);
        group('gemini', 'raw response', () => log('gemini', preview(text, 3500)));
        return text;
      }

      // Non-2xx: read Google's own message where possible.
      let apiMessage = '';
      try {
        const errBody = await res.json();
        apiMessage = errBody?.error?.message || '';
      } catch {
        /* body was not JSON */
      }

      if (res.status === 400) {
        throw new GeminiError('bad-request', apiMessage || 'Gemini rejected the request.');
      }
      if (res.status === 401 || res.status === 403) {
        logError('gemini', `${model} rejected the API key (HTTP ${res.status}). Check the key and its referrer restriction.`);
        throw new GeminiError(
          'auth',
          apiMessage ||
            'Gemini rejected your API key. Check that it is a Generative Language API key, ' +
              'and that any HTTP-referrer restriction on it includes this site.',
        );
      }
      event('gemini', `${model} refused the request — HTTP ${res.status}${apiMessage ? `: ${apiMessage}` : ''}`);

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
        logError('gemini', `${model} rate-limited (429)${retryAfter ? `, retry after ${retryAfter}s` : ''} — trying the next model`);
        lastError = new GeminiError(
          'rate-limit',
          apiMessage ||
            'Free-tier rate limit reached. Gemini allows only a handful of requests per minute.',
          retryAfter,
        );
        continue; // try the next model in the chain
      }
      // 5xx and anything else: try the next model.
      lastError = new GeminiError('network', apiMessage || `Gemini returned HTTP ${res.status}.`);
      if (i < GEMINI_MODEL_CHAIN.length - 1) {
        event('gemini', `falling through to ${GEMINI_MODEL_CHAIN[i + 1]}`);
      }
      continue;
    } catch (err: any) {
      if (err instanceof GeminiError) {
        // auth / bad-request / empty are terminal.
        if (err.kind === 'auth' || err.kind === 'bad-request') throw err;
        event('gemini', `${model} failed (${err.kind}) — ${err.message}`);
        lastError = err;
        continue;
      }
      if (signal?.aborted) {
        throw new GeminiError('network', 'Request cancelled.');
      }
      if (err?.name === 'AbortError') {
        // Previously invisible: nothing recorded WHY attempt 1 was abandoned,
        // so a trace showed "attempt 1/3" followed by "attempt 2/3" with a
        // 30-second hole between them and no explanation.
        event('gemini', `${model} TIMED OUT after ${timeoutMs / 1000}s — trying the next model`);
        lastError = new GeminiError(
          'network',
          `${model} timed out after ${timeoutMs / 1000} seconds.`,
        );
        continue;
      }
      // A bare TypeError here is the classic CORS / offline signature.
      event('gemini', `${model} could not be reached — ${err?.message ?? err}`);
      lastError = new GeminiError(
        'network',
        'Could not reach Gemini. Check your connection, or switch to a local engine.',
      );
      continue;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  event('gemini', `ALL ${GEMINI_MODEL_CHAIN.length} models failed — ${lastError?.message ?? 'no reason recorded'}`);
  throw lastError ?? new GeminiError('network', 'Every Gemini model in the chain failed.');
}

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const GENERATE_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    code: { type: 'STRING' },
    title: { type: 'STRING' },
    bpm: { type: 'NUMBER' },
    genre: { type: 'STRING' },
    explanation: { type: 'STRING' },
    notationBreakdown: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { symbolOrMethod: { type: 'STRING' }, meaning: { type: 'STRING' } },
        required: ['symbolOrMethod', 'meaning'],
      },
    },
  },
  required: ['code', 'title', 'bpm', 'genre', 'explanation'],
};

export const TWEAK_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    code: { type: 'STRING' },
    summary: { type: 'STRING' },
    diffHighlights: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['code', 'summary'],
};

export const EXPLAIN_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    lineByLine: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          line: { type: 'STRING' },
          role: {
            type: 'STRING',
            enum: ['Drums', 'Bass', 'Harmony', 'Melody', 'FX', 'Structure'],
          },
          explanation: { type: 'STRING' },
        },
        required: ['line', 'role', 'explanation'],
      },
    },
    miniNotationGuide: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          symbol: { type: 'STRING' },
          title: { type: 'STRING' },
          explanation: { type: 'STRING' },
          example: { type: 'STRING' },
        },
        required: ['symbol', 'title', 'explanation', 'example'],
      },
    },
    musicTheoryTip: { type: 'STRING' },
  },
  required: ['summary', 'lineByLine', 'musicTheoryTip'],
};

export const VARIATION_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    code: { type: 'STRING' },
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
  },
  required: ['code', 'title', 'summary'],
};

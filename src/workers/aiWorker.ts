/**
 * Dedicated Web Worker for in-browser WebGPU inference via @mlc-ai/web-llm.
 *
 * Runs the model off the main thread so that neither model loading nor token
 * generation can stall the Web Audio scheduler or the render loop.
 *
 * NOTHING OUTSIDE THIS FILE MAY IMPORT IT. The model catalogue lives in
 * `src/ai/models.ts` precisely so the UI can list models without pulling
 * web-llm into the main bundle (and without evaluating the `self.onmessage`
 * assignment below in window scope, where it would clobber
 * `window.onmessage`).
 */

import { CreateMLCEngine, MLCEngine, InitProgressReport, hasModelInCache } from '@mlc-ai/web-llm';
import {
  buildGeneratePrompt,
  buildTweakPrompt,
  buildExplainPrompt,
  buildVariationPrompt,
  buildFixPrompt,
  STRUDEL_SYSTEM_PROMPT,
  STRUDEL_SYNTAX_CARD,
  buildCompactGeneratePrompt,
  buildCompactTweakPrompt,
  buildCompactVariationPrompt,
  buildRetryPrompt,
  withSystemPrompt,
} from '../ai/prompts';
import {
  parseGeneratedTrack,
  parseTweakResult,
  parseExplanationResult,
  parseVariationResult,
} from '../ai/outputParser';
import { getModelSpec, DEFAULT_MODEL_ID } from '../ai/models';
import { AIParseError } from '../ai/outputParser';
import { AIWorkerRequest, AIWorkerResponse } from '../types';
import { log, event, error as logError, timer, group, preview, estimateTokens, fmtMs } from '../ai/diagnostics';
import { setForwarder } from '../ai/sessionLog';
import { completionIsDone } from '../ai/streamStop';

// The worker owns a separate module instance, so anything it records here
// would be invisible to a trace exported on the main thread. Forward instead.
setForwarder((entry) => self.postMessage({ id: 'log', type: 'log', data: entry }));

let engine: MLCEngine | null = null;
let loadedModelId: string | null = null;
/**
 * In-flight load. Concurrent requests await THIS rather than returning
 * silently — the previous `if (isInitializing) return;` sent no reply at all,
 * so the caller's promise never settled and its entry leaked from the pending
 * map forever.
 */
let initPromise: Promise<void> | null = null;

/**
 * Output budgets, in tokens.
 *
 * These were all 1,400. A complete answer — a five-layer stack plus the four
 * label lines — is about 260 tokens, so 1,400 was not a safety margin, it was
 * an invitation to keep writing. In a live session three of five tweaks ran
 * the full 1,400 tokens over 37 seconds and were then thrown away wholesale
 * for `finish_reason === 'length'`.
 *
 * Two changes make a smaller budget strictly better rather than riskier:
 * generation now stops as soon as the answer is structurally complete (see
 * `completionIsDone`), and a truncated reply is parsed anyway and only fails
 * if the salvage also fails. So a good answer finishes sooner and a rambling
 * one is cut off three times earlier.
 */
const BUDGET = {
  generate: 700,
  tweak: 800,
  explain: 700,
  variation: 700,
  fix: 700,
  retry: 500,
} as const;

function send(response: AIWorkerResponse) {
  self.postMessage(response);
}

/**
 * Load `modelId`, reusing the engine when it is already the one loaded.
 *
 * `reqId` identifies the request being served. Progress and readiness
 * messages emitted here are tagged `phase: 'init'` so the main thread knows
 * they are a step toward the answer and must not resolve the request with
 * them. Previously init replied `{ id: <the generate request's id>, type:
 * 'ready' }`, the manager resolved that request with `data === undefined`,
 * the UI reported a failure, and the model's real output — after a full
 * download and a full inference — was discarded because its pending entry had
 * already been deleted.
 */
async function ensureEngine(modelId: string, reqId: string): Promise<void> {
  if (engine && loadedModelId === modelId) return;

  if (initPromise) {
    await initPromise;
    if (engine && loadedModelId === modelId) return;
  }

  let cached = false;
  try {
    cached = await hasModelInCache(modelId);
  } catch {
    cached = false;
  }
  event(
    'worker',
    cached
      ? `${modelId} is ALREADY IN CACHE — loading from disk, no download`
      : `${modelId} is NOT cached — this will download the weights`,
  );

  initPromise = (async () => {
    // Switching models: free the previous weights first. Reassigning over a
    // live engine leaks its GPU buffers (up to ~1.9 GB), which JS garbage
    // collection does not reliably reclaim.
    if (engine) {
      log('worker', `unloading ${loadedModelId} to free GPU memory`);
      try {
        await engine.unload();
      } catch {
        /* unloading is best-effort */
      }
      engine = null;
      loadedModelId = null;
    }

    send({
      id: reqId,
      type: 'progress',
      phase: 'init',
      progress: {
        status: 'downloading',
        text: `Preparing ${modelId}…`,
        progress: 0.02,
      },
    });

    const loadTimer = timer('worker', `download + compile ${modelId}`);
    let lastPct = -1;

    const initProgressCallback = (report: InitProgressReport) => {
      // web-llm's text carries the phase (fetching shards / loading GPU ...).
      const pct = Math.round(report.progress * 100);
      if (pct !== lastPct && pct % 5 === 0) {
        lastPct = pct;
        loadTimer.mark(`${pct}% — ${report.text}`);
      }
      send({
        id: reqId,
        type: 'progress',
        phase: 'init',
        progress: {
          status: 'downloading',
          text: report.text,
          progress: report.progress,
          timeElapsed: report.timeElapsed,
        },
      });
    };

    engine = await CreateMLCEngine(modelId, { initProgressCallback, logLevel: 'WARN' });
    loadedModelId = modelId;
    loadTimer.end(`${modelId} resident in GPU memory`);
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

/**
 * Run one completion.
 *
 * Streams so the UI can show live progress instead of freezing for the 35–70
 * seconds a 1,000-token reply takes on integrated graphics, and rejects on a
 * length cut-off rather than handing a truncated pattern to the parser.
 */
interface Completion {
  text: string;
  /** The reply hit the token cap. It may still contain a usable pattern. */
  truncated: boolean;
}

async function complete(
  reqId: string,
  userPrompt: string,
  maxTokens: number,
  expectsCode = true,
): Promise<Completion> {
  if (!engine) throw new Error('The local model is not loaded.');

  const spec = getModelSpec(loadedModelId || '');

  // Gemma 2's chat template has no system turn, so its system text must be
  // folded into the user message. Models that ARE system-tuned lose quality
  // if we do the same to them, so this is decided per model.
  // Small models get the compact syntax card as their system message; the
  // full rulebook crowds out the actual request and degrades their output.
  const tier: 'full' | 'compact' = spec?.promptStyle === 'compact' ? 'compact' : 'full';
  const systemText = tier === 'compact' ? STRUDEL_SYNTAX_CARD : STRUDEL_SYSTEM_PROMPT;

  // `userPrompt` is now the TASK ONLY. It previously arrived with the system
  // text already embedded by the prompt builder AND was sent again as the
  // system message, so every local generation shipped the syntax card twice.
  const messages = spec?.supportsSystemRole
    ? ([
        { role: 'system', content: systemText },
        { role: 'user', content: userPrompt },
      ] as any)
    : ([{ role: 'user', content: withSystemPrompt(userPrompt, tier) }] as any);

  group('worker', `prompt (${estimateTokens(userPrompt)} est. tokens, ${userPrompt.length} chars)`, () => {
    log('worker', preview(userPrompt, 3500));
  });
  if (estimateTokens(userPrompt) + maxTokens > (spec?.contextWindow ?? 4096)) {
    logError(
      'worker',
      `Prompt (~${estimateTokens(userPrompt)} tokens) plus max_tokens (${maxTokens}) exceeds ` +
        `this model's ${spec?.contextWindow ?? 4096}-token context window. Output will be truncated.`,
    );
  }

  const genTimer = timer('worker', 'generating');
  let tokenCount = 0;

  const stream = await engine.chat.completions.create({
    messages,
    // Low, because every task here is a strict-format task. 0.4 produced
    // format drift that the parser then had to guess at.
    temperature: 0.15,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  } as any);

  let text = '';
  let finishReason: string | null = null;
  let lastEmit = 0;
  let stoppedEarly: string | null = null;

  for await (const chunk of stream as any) {
    const choice = chunk?.choices?.[0];
    const delta = choice?.delta?.content;
    if (delta) text += delta;
    if (choice?.finish_reason) finishReason = choice.finish_reason;

    // Throttled, so token streaming does not flood the main thread.
    if (delta) tokenCount++;

    // Stop as soon as the answer is structurally complete. Small models do not
    // reliably emit an end-of-turn token after a strict-format answer; they
    // carry on with a second pattern or an unasked-for explanation until the
    // cap, which is where the 37-second dead ends in the session trace came
    // from.
    // `explain` produces no code block, and its LINE rows quote patterns; the
    // early stop has nothing to anchor on there and could only cut the answer
    // short, so it is off for that task.
    if (delta && expectsCode) {
      const done = completionIsDone(text);
      if (done) {
        stoppedEarly = done;
        try {
          await engine.interruptGenerate();
        } catch {
          /* breaking the loop below is enough on its own */
        }
        break;
      }
    }

    const now = Date.now();
    if (now - lastEmit > 120) {
      lastEmit = now;
      send({
        id: reqId,
        type: 'progress',
        progress: {
          status: 'ready',
          text: 'Generating…',
          progress: Math.min(0.99, text.length / (maxTokens * 3)),
        },
      });
    }
  }

  const ms = genTimer.end(
    `generated ${tokenCount} chunks / ${text.length} chars` +
      (stoppedEarly ? ' (stopped early)' : finishReason ? ` (finish_reason=${finishReason})` : ''),
  );
  log('worker', `throughput ≈ ${(tokenCount / (ms / 1000)).toFixed(1)} chunks/s over ${fmtMs(ms)}`);
  if (stoppedEarly) event('worker', `STOPPED EARLY — ${stoppedEarly}`);
  group('worker', 'raw completion', () => log('worker', preview(text, 3500)));

  if (!text.trim()) {
    throw new Error('The model returned an empty response.');
  }

  // A cut-off reply is NOT thrown away here.
  //
  // It used to be: `finish_reason === 'length'` threw immediately, so a tweak
  // that generated 2,454 characters over 37 seconds was discarded whole even
  // though the first few hundred characters held a complete, balanced pattern.
  // The caller parses first and only reports the truncation if the salvage
  // also fails.
  const truncated = finishReason === 'length';
  if (truncated) {
    logError('worker', `Output hit the ${maxTokens}-token cap — attempting to salvage a pattern from it.`);
  }

  return { text, truncated };
}

/**
 * Completes and parses, reporting a truncation only when the reply could not
 * be salvaged.
 */
async function completeAndParse<T>(
  reqId: string,
  prompt: string,
  maxTokens: number,
  parse: (raw: string) => T,
  expectsCode = true,
): Promise<T> {
  const { text, truncated } = await complete(reqId, prompt, maxTokens, expectsCode);
  try {
    const parsed = parse(text);
    if (truncated) event('worker', 'SALVAGED a complete pattern from the truncated reply');
    return parsed;
  } catch (err) {
    if (truncated && err instanceof AIParseError) {
      throw new Error(
        'The model ran past its output limit without finishing a pattern. Try a shorter ' +
          'request, or a larger model.',
      );
    }
    throw err;
  }
}

self.onmessage = async (e: MessageEvent<AIWorkerRequest>) => {
  const { id, type, modelId, payload } = e.data;
  const targetModel = modelId || loadedModelId || DEFAULT_MODEL_ID;
  log('worker', `← ${type}`, { id, targetModel, loaded: loadedModelId ?? 'none' });

  try {
    switch (type) {
      case 'init': {
        await ensureEngine(targetModel, id);
        send({
          id,
          type: 'ready',
          phase: 'init',
          progress: {
            status: 'ready',
            text: `${targetModel} is loaded and ready.`,
            progress: 1,
          },
        });
        break;
      }

      case 'generate': {
        await ensureEngine(targetModel, id);
        const { prompt, style, complexity, tempo } = payload;
        const compact = getModelSpec(loadedModelId || '')?.promptStyle === 'compact';
        const build = compact ? buildCompactGeneratePrompt : buildGeneratePrompt;

        const parseTrack = (raw: string) => parseGeneratedTrack(raw, prompt, style, tempo);
        let parsed;
        try {
          parsed = await completeAndParse(
            id,
            build(prompt, style, complexity, tempo),
            BUDGET.generate,
            parseTrack,
          );
        } catch (err: any) {
          // One retry with every secondary instruction removed. A model that
          // fumbled the multi-part format will usually manage "just the code",
          // and a second attempt is far cheaper than failing to the fallback.
          // Truncation is retried too — the code-only prompt is much shorter.
          const recoverable =
            err instanceof AIParseError || /output limit/i.test(String(err?.message ?? ''));
          if (!recoverable) throw err;
          event('worker', `RETRY — ${err?.message ?? err}`);
          parsed = await completeAndParse(
            id,
            buildRetryPrompt(prompt, tempo),
            BUDGET.retry,
            parseTrack,
          );
        }
        send({ id, type: 'result', data: parsed });
        break;
      }

      case 'tweak': {
        await ensureEngine(targetModel, id);
        const { currentCode, instruction } = payload;
        const compact = getModelSpec(loadedModelId || '')?.promptStyle === 'compact';
        const data = await completeAndParse(
          id,
          compact
            ? buildCompactTweakPrompt(currentCode, instruction)
            : buildTweakPrompt(currentCode, instruction),
          BUDGET.tweak,
          parseTweakResult,
        );
        send({ id, type: 'result', data });
        break;
      }

      case 'explain': {
        await ensureEngine(targetModel, id);
        const data = await completeAndParse(
          id,
          buildExplainPrompt(payload.code),
          BUDGET.explain,
          parseExplanationResult,
          false,
        );
        send({ id, type: 'result', data });
        break;
      }

      // One variation per request. Three complete patterns in a single reply
      // needs ~2,100 output tokens, which overran the budget every time and
      // truncated mid-pattern; the manager now issues these sequentially.
      case 'suggest_variations': {
        await ensureEngine(targetModel, id);
        const { currentCode, mood, recipe } = payload;
        const compact = getModelSpec(loadedModelId || '')?.promptStyle === 'compact';
        const data = await completeAndParse(
          id,
          compact
            ? buildCompactVariationPrompt(currentCode, recipe.type, recipe.description)
            : buildVariationPrompt(currentCode, mood, recipe.type, recipe.description),
          BUDGET.variation,
          (raw) => parseVariationResult(raw, recipe),
        );
        send({ id, type: 'result', data });
        break;
      }

      case 'fix': {
        await ensureEngine(targetModel, id);
        const { code, errorMessage } = payload;
        const data = await completeAndParse(
          id,
          buildFixPrompt(code, errorMessage),
          BUDGET.fix,
          parseTweakResult,
        );
        // The fix prompt now asks for the same shape as a tweak, so the two
        // share a parser. They previously disagreed — the prompt asked for
        // `fixedCode` while the parser required `code` — which meant the fix
        // path ALWAYS fell through to a catch-all that returned the raw model
        // output, JSON braces and all, straight into the user's editor.
        send({ id, type: 'result', data });
        break;
      }

      case 'unload': {
        if (engine) {
          try {
            await engine.unload();
          } catch {
            /* best effort */
          }
          engine = null;
          loadedModelId = null;
        }
        send({ id, type: 'result', data: { unloaded: true } });
        break;
      }

      default:
        send({ id, type: 'error', error: `Unknown worker action: ${type}` });
    }
  } catch (err: any) {
    logError('worker', `${type} failed: ${err?.message ?? err}`, err);
    send({ id, type: 'error', error: err?.message || 'The local model failed to respond.' });
  }
};

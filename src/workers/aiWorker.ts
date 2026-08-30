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
async function complete(reqId: string, userPrompt: string, maxTokens: number): Promise<string> {
  if (!engine) throw new Error('The local model is not loaded.');

  const spec = getModelSpec(loadedModelId || '');

  // Gemma 2's chat template has no system turn, so its system text must be
  // folded into the user message. Models that ARE system-tuned lose quality
  // if we do the same to them, so this is decided per model.
  // Small models get the compact syntax card as their system message; the
  // full rulebook crowds out the actual request and degrades their output.
  const systemText = spec?.promptStyle === 'compact' ? STRUDEL_SYNTAX_CARD : STRUDEL_SYSTEM_PROMPT;

  const messages = spec?.supportsSystemRole
    ? ([
        { role: 'system', content: systemText },
        { role: 'user', content: userPrompt },
      ] as any)
    : ([{ role: 'user', content: userPrompt }] as any);

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

  for await (const chunk of stream as any) {
    const choice = chunk?.choices?.[0];
    const delta = choice?.delta?.content;
    if (delta) text += delta;
    if (choice?.finish_reason) finishReason = choice.finish_reason;

    // Throttled, so token streaming does not flood the main thread.
    if (delta) tokenCount++;

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
      (finishReason ? ` (finish_reason=${finishReason})` : ''),
  );
  log('worker', `throughput ≈ ${(tokenCount / (ms / 1000)).toFixed(1)} chunks/s over ${fmtMs(ms)}`);
  group('worker', 'raw completion', () => log('worker', preview(text, 3500)));

  if (finishReason === 'length') {
    logError('worker', `Output hit the ${maxTokens}-token cap and was cut off mid-answer.`);
    throw new Error(
      'The model hit its output limit before finishing the pattern. Try a shorter pattern, ' +
        'a simpler request, or a larger model.',
    );
  }

  if (!text.trim()) {
    throw new Error('The model returned an empty response.');
  }

  return text;
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

        let raw = await complete(id, build(prompt, style, complexity, tempo), 1400);
        let parsed;
        try {
          parsed = parseGeneratedTrack(raw, prompt, style, tempo);
        } catch (err) {
          if (!(err instanceof AIParseError)) throw err;
          // One retry with every secondary instruction removed. A model that
          // fumbled the multi-part format will usually manage "just the code",
          // and a second attempt is far cheaper than failing to the fallback.
          log('worker', 'first reply was unparseable — retrying with a code-only prompt');
          raw = await complete(id, buildRetryPrompt(prompt, tempo), 1200);
          parsed = parseGeneratedTrack(raw, prompt, style, tempo);
        }
        send({ id, type: 'result', data: parsed });
        break;
      }

      case 'tweak': {
        await ensureEngine(targetModel, id);
        const { currentCode, instruction } = payload;
        const compact = getModelSpec(loadedModelId || '')?.promptStyle === 'compact';
        const raw = await complete(
          id,
          compact
            ? buildCompactTweakPrompt(currentCode, instruction)
            : buildTweakPrompt(currentCode, instruction),
          1400,
        );
        send({ id, type: 'result', data: parseTweakResult(raw) });
        break;
      }

      case 'explain': {
        await ensureEngine(targetModel, id);
        const raw = await complete(id, buildExplainPrompt(payload.code), 900);
        send({ id, type: 'result', data: parseExplanationResult(raw) });
        break;
      }

      // One variation per request. Three complete patterns in a single reply
      // needs ~2,100 output tokens, which overran the budget every time and
      // truncated mid-pattern; the manager now issues these sequentially.
      case 'suggest_variations': {
        await ensureEngine(targetModel, id);
        const { currentCode, mood, recipe } = payload;
        const compact = getModelSpec(loadedModelId || '')?.promptStyle === 'compact';
        const raw = await complete(
          id,
          compact
            ? buildCompactVariationPrompt(currentCode, recipe.type, recipe.description)
            : buildVariationPrompt(currentCode, mood, recipe.type, recipe.description),
          1400,
        );
        send({ id, type: 'result', data: parseVariationResult(raw, recipe) });
        break;
      }

      case 'fix': {
        await ensureEngine(targetModel, id);
        const { code, errorMessage } = payload;
        const raw = await complete(id, buildFixPrompt(code, errorMessage), 1400);
        // The fix prompt now asks for the same shape as a tweak, so the two
        // share a parser. They previously disagreed — the prompt asked for
        // `fixedCode` while the parser required `code` — which meant the fix
        // path ALWAYS fell through to a catch-all that returned the raw model
        // output, JSON braces and all, straight into the user's editor.
        send({ id, type: 'result', data: parseTweakResult(raw) });
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

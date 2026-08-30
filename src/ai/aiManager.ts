/**
 * Orchestrator for every AI engine.
 *
 * The governing rule of this file is that THE UI IS NEVER LIED TO.
 *
 * The previous version wrapped all fifteen call sites in
 * `try { ... } catch { return heuristic }` without ever emitting progress, so
 * a user could not distinguish a working model from a broken one — a 404 from
 * a missing server, a null worker after a page reload, and a genuine model
 * answer all looked identical on screen. That made "are the engines working?"
 * unanswerable by construction, which is why every engine had been broken for
 * a long time without anyone noticing.
 *
 * Now: every method returns `AIEngineResult<T>` carrying `producedBy`, and
 * every fallback both sets `degraded` and emits an error progress event.
 */

import {
  AIEngineType,
  AIEngineProgress,
  AIEngineResult,
  AIGeneratedTrack,
  AITweakResult,
  AIExplanationResult,
  AIVariation,
  AIWorkerRequest,
  AIWorkerResponse,
  DeviceProfile,
  AI_ENGINE_LABELS,
} from '../types';
import { chromeBuiltInAi } from './chromeBuiltInAi';
import { probeDevice } from './deviceProbe';
import { DEFAULT_MODEL_ID, getModelSpec } from './models';
import { getApiKey, hasApiKey } from './apiKeyStore';
import {
  callGemini,
  GENERATE_SCHEMA,
  TWEAK_SCHEMA,
  EXPLAIN_SCHEMA,
  VARIATION_SCHEMA,
} from './geminiClient';
import {
  STRUDEL_SYSTEM_PROMPT,
  buildGeneratePrompt,
  buildTweakPrompt,
  buildExplainPrompt,
  buildVariationPrompt,
  buildFixPrompt,
  VARIATION_RECIPES,
} from './prompts';
import {
  parseGeneratedTrack,
  parseTweakResult,
  parseExplanationResult,
  parseVariationResult,
} from './outputParser';
import { log, event, error as logError, timer, group, preview } from './diagnostics';
import { ingest } from './sessionLog';
import {
  generateHeuristicTrack,
  tweakHeuristicCode,
  suggestHeuristicVariations,
  fixHeuristicCode,
} from './ruleBasedGenerator';

export type AIProgressListener = (progress: AIEngineProgress) => void;
export type AIEngineChangeListener = (engine: AIEngineType) => void;
export type AICapabilityListener = (caps: EngineCapabilities) => void;

export interface EngineCapabilities {
  device: DeviceProfile | null;
  /** A real adapter was obtained, so local models can at least be attempted. */
  webgpu: boolean;
  chromeBuiltIn: boolean;
  chromeBuiltInReason?: string;
  hasGeminiKey: boolean;
}

const ENGINE_STORAGE_KEY = 'strudel_ai_engine';
const MODEL_STORAGE_KEY = 'strudel_ai_model';

/** Inference can be slow on a weak GPU, but it must not hang forever. */
const INFERENCE_TIMEOUT_MS = 180_000;
/** A cold model download over a slow link legitimately takes a long time. */
const LOAD_TIMEOUT_MS = 30 * 60_000;

class AIManager {
  /**
   * Defaults to the one engine guaranteed to work with no key, no download
   * and no network. The previous default was `cloud-gemini`, which on a
   * static host cannot work at all.
   */
  private activeEngine: AIEngineType = 'instant-heuristic';
  private selectedModelId: string = DEFAULT_MODEL_ID;

  private worker: Worker | null = null;
  private pending = new Map<
    string,
    { resolve: (v: any) => void; reject: (e: any) => void; timer: number }
  >();

  private progressListeners = new Set<AIProgressListener>();
  private engineChangeListeners = new Set<AIEngineChangeListener>();
  private capabilityListeners = new Set<AICapabilityListener>();

  private capabilities: EngineCapabilities = {
    device: null,
    webgpu: false,
    chromeBuiltIn: false,
    hasGeminiKey: false,
  };

  private currentProgress: AIEngineProgress = {
    status: 'ready',
    text: 'Built-in pattern rules ready — no download, works offline.',
    progress: 1,
  };

  /** Cancels the in-flight cloud request, when there is one. */
  private cloudAbort: AbortController | null = null;

  constructor() {
    this.restorePreferences();
    void this.refreshCapabilities();

    // Surface Gemini Nano's download progress on the same channel as every
    // other engine, so the UI has one place to read from.
    chromeBuiltInAi.setProgressSink((text, fraction) => {
      this.emitProgress({
        status: typeof fraction === 'number' ? 'downloading' : 'ready',
        text,
        progress: typeof fraction === 'number' ? fraction : 0.5,
      });
    });

    if (typeof window !== 'undefined') {
      // Free GPU memory when the tab goes away. `pagehide` fires on mobile
      // Safari where `beforeunload` does not.
      window.addEventListener('pagehide', () => this.releaseWorker());
    }
  }

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  /**
   * Probes the real hardware. Listeners are notified when it completes,
   * because the results arrive asynchronously — the engine picker used to
   * read capabilities once at mount, before the Chrome AI probe had resolved,
   * and so reported "unavailable" permanently even where it worked.
   */
  async refreshCapabilities(): Promise<EngineCapabilities> {
    const device = await probeDevice();
    const nano = await chromeBuiltInAi.isAvailable();

    this.capabilities = {
      device,
      webgpu: device.tier !== 'no-webgpu' && device.tier !== 'no-adapter',
      chromeBuiltIn: nano.available,
      chromeBuiltInReason: nano.reason,
      hasGeminiKey: hasApiKey(),
    };
    group('device', 'capabilities probed', () => {
      log('device', `tier=${device.tier} f16=${device.hasF16} gpu=${device.gpuVendor || 'n/a'}`);
      log('device', `webgpu=${this.capabilities.webgpu} nano=${this.capabilities.chromeBuiltIn}` +
        `${nano.reason ? ` (${nano.reason})` : ''} geminiKey=${this.capabilities.hasGeminiKey}`);
    });
    this.capabilityListeners.forEach((fn) => fn(this.capabilities));
    return this.capabilities;
  }

  getCapabilities(): EngineCapabilities {
    return this.capabilities;
  }

  onCapabilities(listener: AICapabilityListener): () => void {
    this.capabilityListeners.add(listener);
    listener(this.capabilities);
    return () => this.capabilityListeners.delete(listener);
  }

  // -------------------------------------------------------------------------
  // Preferences & listeners
  // -------------------------------------------------------------------------

  private restorePreferences() {
    if (typeof window === 'undefined') return;
    try {
      const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
      if (savedModel && getModelSpec(savedModel)) this.selectedModelId = savedModel;

      const saved = localStorage.getItem(ENGINE_STORAGE_KEY) as AIEngineType | null;
      if (saved && saved in AI_ENGINE_LABELS) {
        // Restore the CHOICE without eagerly loading a model. The worker is
        // created lazily on first use instead; previously the restore path
        // skipped worker creation entirely and left the engine "active" with
        // a null worker, so every request after a reload silently produced
        // rule-based output forever.
        this.activeEngine = saved;
        this.currentProgress = this.idleProgressFor(saved);
      }
    } catch {
      /* storage unavailable — defaults are fine */
    }
  }

  private idleProgressFor(engine: AIEngineType): AIEngineProgress {
    switch (engine) {
      case 'instant-heuristic':
        return {
          status: 'ready',
          text: 'Built-in pattern rules ready — no download, works offline.',
          progress: 1,
        };
      case 'webgpu-gemma': {
        const spec = getModelSpec(this.selectedModelId);
        return {
          status: 'idle',
          text: `${spec?.name ?? this.selectedModelId} will load on your first request.`,
          progress: 0,
        };
      }
      case 'chrome-builtin':
        return { status: 'idle', text: 'Chrome built-in AI selected.', progress: 0 };
      case 'cloud-gemini':
        return hasApiKey()
          ? { status: 'ready', text: 'Gemini ready, using your API key.', progress: 1 }
          : {
              status: 'idle',
              text: 'Add your Gemini API key to use this engine.',
              progress: 0,
            };
    }
  }

  getActiveEngine(): AIEngineType {
    return this.activeEngine;
  }

  getSelectedModelId(): string {
    return this.selectedModelId;
  }

  getProgress(): AIEngineProgress {
    return this.currentProgress;
  }

  onProgress(listener: AIProgressListener): () => void {
    this.progressListeners.add(listener);
    listener(this.currentProgress);
    return () => this.progressListeners.delete(listener);
  }

  onEngineChange(listener: AIEngineChangeListener): () => void {
    this.engineChangeListeners.add(listener);
    listener(this.activeEngine);
    return () => this.engineChangeListeners.delete(listener);
  }

  private emitProgress(progress: AIEngineProgress) {
    this.currentProgress = progress;
    this.progressListeners.forEach((fn) => fn(progress));
  }

  // -------------------------------------------------------------------------
  // Engine & model selection
  // -------------------------------------------------------------------------

  /**
   * Selects an engine. Deliberately does NOT start a download — choosing
   * "local model" in a picker is not consent to transfer a gigabyte. Call
   * `preloadModel()` from an explicit button for that.
   */
  async setEngine(engine: AIEngineType) {
    if (engine === this.activeEngine) return;

    // Release GPU memory when moving away from the local engine.
    if (this.activeEngine === 'webgpu-gemma' && engine !== 'webgpu-gemma') {
      this.releaseWorker();
    }

    this.activeEngine = engine;
    try {
      localStorage.setItem(ENGINE_STORAGE_KEY, engine);
    } catch {
      /* storage unavailable */
    }
    log('ai', `engine → ${AI_ENGINE_LABELS[engine]}`);
    this.engineChangeListeners.forEach((fn) => fn(engine));
    this.emitProgress(this.idleProgressFor(engine));
    await this.refreshCapabilities();
  }

  async setModel(modelId: string) {
    if (modelId === this.selectedModelId) return;
    this.selectedModelId = modelId;
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, modelId);
    } catch {
      /* storage unavailable */
    }
    log('ai', `model → ${modelId} (previous model unloaded)`);
    // Drop the loaded model so the next request loads the new one.
    this.releaseWorker();
    this.emitProgress(this.idleProgressFor(this.activeEngine));
  }

  /**
   * Explicitly downloads and loads the selected local model.
   *
   * Asks for persistent storage first: Cache Storage is best-effort by
   * default, and a gigabyte of weights is exactly what a browser evicts first
   * under pressure — so "download once, works forever" is not true unless we
   * ask. The outcome is reported rather than assumed.
   */
  async preloadModel(): Promise<{ ok: boolean; persisted: boolean; error?: string }> {
    let persisted = false;
    try {
      if (navigator.storage?.persist) persisted = await navigator.storage.persist();
    } catch {
      /* not supported everywhere */
    }

    const spec0 = getModelSpec(this.selectedModelId);
    const t = timer('worker', `load ${spec0?.name ?? this.selectedModelId}`);
    log(
      'worker',
      `persistent storage ${persisted ? 'GRANTED' : 'NOT granted'} — ` +
        `${persisted ? 'weights should survive eviction' : 'the browser may delete weights later'}`,
    );

    try {
      await this.sendWorkerRequest('init', undefined, LOAD_TIMEOUT_MS);
      t.end(`model ready (${spec0?.name ?? this.selectedModelId})`);
      const spec = getModelSpec(this.selectedModelId);
      this.emitProgress({
        status: 'ready',
        text: `${spec?.name ?? this.selectedModelId} is loaded and ready.`,
        progress: 1,
        warnings: persisted
          ? []
          : ['Your browser did not grant persistent storage, so it may delete these weights later.'],
      });
      return { ok: true, persisted };
    } catch (err: any) {
      const message = err?.message || 'The model failed to load.';
      t.end('model load FAILED');
      logError('worker', message, err);
      this.emitProgress({ status: 'error', text: message, progress: 0, errorMessage: message });
      return { ok: false, persisted, error: message };
    }
  }

  /** Aborts any in-flight generation or download, on whichever engine is running. */
  cancel() {
    this.cloudAbort?.abort();
    this.cloudAbort = null;
    log('ai', 'cancel requested — aborting in-flight work');
    chromeBuiltInAi.cancel();
    this.releaseWorker();
    this.emitProgress({ status: 'idle', text: 'Cancelled.', progress: 0 });
  }

  // -------------------------------------------------------------------------
  // Worker plumbing
  // -------------------------------------------------------------------------

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    log('worker', 'spawning AI worker');
    const worker = new Worker(new URL('../workers/aiWorker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e: MessageEvent<AIWorkerResponse>) => {
      const { id, type, progress, data, error, phase } = e.data;

      // Trace entries forwarded from the worker's own module instance.
      if (type === 'log') {
        ingest(data);
        return;
      }

      if (progress) this.emitProgress(progress);

      // Loading the model is a step toward the answer, not the answer. Without
      // this guard the manager resolved the caller's promise with `undefined`
      // the moment the model finished loading, reported a failure, and then
      // discarded the model's real output when it arrived.
      if (phase === 'init' && type !== 'error') return;

      const entry = this.pending.get(id);
      if (!entry) return;

      if (type === 'result' || type === 'ready') {
        clearTimeout(entry.timer);
        this.pending.delete(id);
        entry.resolve(data);
      } else if (type === 'error') {
        clearTimeout(entry.timer);
        this.pending.delete(id);
        entry.reject(new Error(error || 'The local model failed.'));
      }
    };

    // A worker crash must reject everything in flight, or those promises hang
    // forever and the UI spins indefinitely.
    worker.onerror = (err) => {
      const message = err.message || 'The local model worker crashed.';
      this.rejectAllPending(new Error(message));
      this.emitProgress({ status: 'error', text: message, progress: 0, errorMessage: message });
    };

    this.worker = worker;
    return worker;
  }

  private rejectAllPending(error: Error) {
    this.pending.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.reject(error);
    });
    this.pending.clear();
  }

  private releaseWorker() {
    if (!this.worker) return;
    try {
      this.worker.postMessage({ id: 'unload-' + Date.now(), type: 'unload' } as AIWorkerRequest);
      this.worker.terminate();
    } catch {
      /* already gone */
    }
    this.worker = null;
    this.rejectAllPending(new Error('The local model was unloaded.'));
  }

  private sendWorkerRequest<T>(
    type: AIWorkerRequest['type'],
    payload?: any,
    timeoutMs: number = INFERENCE_TIMEOUT_MS,
  ): Promise<T> {
    const worker = this.ensureWorker();
    const id = `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The local model did not respond in time.'));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      log('worker', `→ ${type}`, { id, model: this.selectedModelId });
      worker.postMessage({ id, type, modelId: this.selectedModelId, payload } as AIWorkerRequest);
    });
  }

  // -------------------------------------------------------------------------
  // The honesty wrapper
  // -------------------------------------------------------------------------

  /**
   * Runs `primary` on the selected engine and, if it fails, falls back to the
   * rule-based generator — but names what actually ran, both in the returned
   * value and on the progress channel.
   *
   * The rule-based generator is a legitimate offline engine. It simply must
   * never wear another engine's name.
   */
  private async withFallback<T>(
    label: string,
    primary: () => Promise<T>,
    fallback: () => T | Promise<T>,
  ): Promise<AIEngineResult<T>> {
    const requested = this.activeEngine;

    if (requested === 'instant-heuristic') {
      event('ai', `METHOD: built-in pattern rules (no model, offline)`);
      const t = timer('ai', `${label} — built-in pattern rules`);
      const data = await fallback();
      t.end(`${label} — built-in pattern rules`);
      return { data, producedBy: 'instant-heuristic' };
    }

    const t = timer('ai', `${label} — ${AI_ENGINE_LABELS[requested]}`);
    event('ai', `METHOD: ${AI_ENGINE_LABELS[requested]} (${requested})`);
    if (requested === 'webgpu-gemma') {
      const spec = getModelSpec(this.selectedModelId);
      event(
        'ai',
        `MODEL: ${spec?.name ?? this.selectedModelId} — ${spec?.vramMB ?? '?'} MB, ` +
          `f16=${spec?.needsF16}, ctx=${spec?.contextWindow}, prompt=${spec?.promptStyle}`,
      );
      event('ai', `worker ${this.worker ? 'already running' : 'not yet spawned'}`);
    }
    if (requested === 'cloud-gemini') {
      event('ai', `key present: ${hasApiKey()}`);
    }
    this.emitProgress({ status: 'ready', text: `${label}…`, progress: 0.05 });

    try {
      const data = await primary();
      t.end(`${label} — ${AI_ENGINE_LABELS[requested]} OK`);
      event('ai', `RESULT accepted from ${AI_ENGINE_LABELS[requested]}`);
      group('ai', `result from ${AI_ENGINE_LABELS[requested]}`, () => {
        const code = (data as any)?.code ?? (data as any)?.fixedCode;
        if (typeof code === 'string') log('ai', 'code:\n' + preview(code));
        else log('ai', 'payload', data);
      });
      this.emitProgress({
        status: 'ready',
        text: `${AI_ENGINE_LABELS[requested]} finished.`,
        progress: 1,
      });
      return { data, producedBy: requested };
    } catch (err: any) {
      const reason = err?.message || 'Unknown error.';
      t.end(`${label} — ${AI_ENGINE_LABELS[requested]} FAILED`);
      logError(
        'ai',
        `${AI_ENGINE_LABELS[requested]} failed during "${label}" — falling back to the ` +
          `built-in pattern rules. Reason: ${reason}`,
        err,
      );
      if ((err as any)?.raw) {
        group('parse', 'raw model output that could not be parsed', () => {
          log('parse', preview((err as any).raw, 1200));
        });
      }
      this.emitProgress({
        status: 'error',
        text: `${AI_ENGINE_LABELS[requested]} failed — used the built-in pattern rules instead.`,
        progress: 0,
        errorMessage: reason,
      });
      event('ai', `FALLBACK to built-in pattern rules — ${reason}`);
      const fallbackData = await fallback();
      event('ai', 'fallback produced a pattern');
      return {
        data: fallbackData,
        producedBy: 'instant-heuristic',
        requestedEngine: requested,
        degraded: reason,
      };
    }
  }

  /** Shared guard for the cloud path so a missing key fails clearly. */
  private requireApiKey(): string {
    const key = getApiKey();
    if (!key) {
      throw new Error('No Gemini API key set. Add one in the AI engine settings.');
    }
    return key;
  }

  private newCloudSignal(): AbortSignal {
    this.cloudAbort?.abort();
    this.cloudAbort = new AbortController();
    return this.cloudAbort.signal;
  }

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  async generateTrack(
    prompt: string,
    style: string,
    complexity: 'Beginner' | 'Intermediate' | 'Advanced',
    tempo: number,
  ): Promise<AIEngineResult<AIGeneratedTrack>> {
    return this.withFallback<AIGeneratedTrack>(
      'Composing',
      async () => {
        switch (this.activeEngine) {
          case 'chrome-builtin':
            return chromeBuiltInAi.generate(prompt, style, complexity, tempo);
          case 'webgpu-gemma':
            return this.sendWorkerRequest<AIGeneratedTrack>('generate', {
              prompt,
              style,
              complexity,
              tempo,
            });
          default: {
            const raw = await callGemini({
              apiKey: this.requireApiKey(),
              systemInstruction: STRUDEL_SYSTEM_PROMPT,
              userPrompt: buildGeneratePrompt(prompt, style, complexity, tempo),
              schema: GENERATE_SCHEMA,
              signal: this.newCloudSignal(),
            });
            return parseGeneratedTrack(raw, prompt, style, tempo);
          }
        }
      },
      () => generateHeuristicTrack(prompt, style, complexity, tempo),
    );
  }

  async tweakPattern(
    currentCode: string,
    instruction: string,
  ): Promise<AIEngineResult<AITweakResult>> {
    return this.withFallback<AITweakResult>(
      'Applying your change',
      async () => {
        switch (this.activeEngine) {
          case 'chrome-builtin':
            return chromeBuiltInAi.tweak(currentCode, instruction);
          case 'webgpu-gemma':
            return this.sendWorkerRequest<AITweakResult>('tweak', { currentCode, instruction });
          default: {
            const raw = await callGemini({
              apiKey: this.requireApiKey(),
              systemInstruction: STRUDEL_SYSTEM_PROMPT,
              userPrompt: buildTweakPrompt(currentCode, instruction),
              schema: TWEAK_SCHEMA,
              signal: this.newCloudSignal(),
            });
            return parseTweakResult(raw);
          }
        }
      },
      () => tweakHeuristicCode(currentCode, instruction),
    );
  }

  async explainCode(code: string): Promise<AIEngineResult<AIExplanationResult>> {
    return this.withFallback<AIExplanationResult>(
      'Analysing the pattern',
      async () => {
        switch (this.activeEngine) {
          case 'chrome-builtin':
            return chromeBuiltInAi.explain(code);
          case 'webgpu-gemma':
            return this.sendWorkerRequest<AIExplanationResult>('explain', { code });
          default: {
            const raw = await callGemini({
              apiKey: this.requireApiKey(),
              systemInstruction: STRUDEL_SYSTEM_PROMPT,
              userPrompt: buildExplainPrompt(code),
              schema: EXPLAIN_SCHEMA,
              signal: this.newCloudSignal(),
            });
            return parseExplanationResult(raw);
          }
        }
      },
      () => this.heuristicExplanation(),
    );
  }

  private heuristicExplanation(): AIExplanationResult {
    return {
      summary: 'A layered Strudel pattern combining rhythm, bass and harmony.',
      lineByLine: [
        {
          line: 'stack(...)',
          role: 'Structure',
          explanation: 'Plays every layer inside it at the same time.',
        },
      ],
      miniNotationGuide: [
        { symbol: '*', title: 'Subdivision', explanation: 'Repeats N times per cycle', example: 'bd*4' },
        { symbol: '~', title: 'Rest', explanation: 'A silent step', example: '~ cp ~ cp' },
      ],
      musicTheoryTip:
        'Try moving the filter cutoff with .lpf() across a section — it is the quickest way to build tension.',
    };
  }

  /**
   * Generates variations ONE AT A TIME.
   *
   * Asking for three complete patterns in a single reply needs roughly 2,100
   * output tokens, which overran every local model's budget and truncated
   * mid-pattern on every attempt. Sequential calls also mean a later failure
   * still leaves the earlier variations usable.
   */
  async suggestVariations(
    currentCode: string,
    mood: string,
  ): Promise<AIEngineResult<{ variations: AIVariation[] }>> {
    return this.withFallback<{ variations: AIVariation[] }>(
      'Creating variations',
      async () => {
        const variations: AIVariation[] = [];
        let lastError: unknown = null;

        for (const recipe of VARIATION_RECIPES) {
          try {
            let variation: AIVariation;
            switch (this.activeEngine) {
              case 'chrome-builtin':
                variation = await chromeBuiltInAi.variation(currentCode, mood, recipe);
                break;
              case 'webgpu-gemma':
                variation = await this.sendWorkerRequest<AIVariation>('suggest_variations', {
                  currentCode,
                  mood,
                  recipe,
                });
                break;
              default: {
                const raw = await callGemini({
                  apiKey: this.requireApiKey(),
                  systemInstruction: STRUDEL_SYSTEM_PROMPT,
                  userPrompt: buildVariationPrompt(currentCode, mood, recipe.type, recipe.description),
                  schema: VARIATION_SCHEMA,
                  signal: this.newCloudSignal(),
                });
                variation = parseVariationResult(raw, recipe);
              }
            }
            variations.push(variation);
            this.emitProgress({
              status: 'ready',
              text: `Created ${variations.length} of ${VARIATION_RECIPES.length} variations…`,
              progress: variations.length / VARIATION_RECIPES.length,
            });
          } catch (err: any) {
            // Recorded, not swallowed. This was the one engine path in the
            // file that failed silently: two of three variations could fail
            // and the user would get a single result with nothing anywhere
            // saying why the other two were missing.
            logError(
              'ai',
              `variation "${recipe.type}" failed — ${err?.message ?? err}`,
              err,
            );
            lastError = err;
          }
        }

        if (variations.length === 0) {
          throw lastError instanceof Error
            ? lastError
            : new Error('No variation could be generated.');
        }
        if (variations.length < VARIATION_RECIPES.length) {
          event(
            'ai',
            `PARTIAL — ${variations.length} of ${VARIATION_RECIPES.length} variations succeeded; ` +
              `last failure: ${lastError instanceof Error ? lastError.message : 'unknown'}`,
          );
        }
        return { variations };
      },
      () => suggestHeuristicVariations(currentCode, mood),
    );
  }

  async fixCode(
    code: string,
    errorMessage: string,
  ): Promise<AIEngineResult<{ fixedCode: string; fixExplanation: string; reason: string }>> {
    return this.withFallback(
      'Fixing the pattern',
      async () => {
        let tweak: AITweakResult;
        switch (this.activeEngine) {
          case 'chrome-builtin':
            tweak = await chromeBuiltInAi.fix(code, errorMessage);
            break;
          case 'webgpu-gemma':
            tweak = await this.sendWorkerRequest<AITweakResult>('fix', { code, errorMessage });
            break;
          default: {
            const raw = await callGemini({
              apiKey: this.requireApiKey(),
              systemInstruction: STRUDEL_SYSTEM_PROMPT,
              userPrompt: buildFixPrompt(code, errorMessage),
              schema: TWEAK_SCHEMA,
              signal: this.newCloudSignal(),
            });
            tweak = parseTweakResult(raw);
          }
        }
        return {
          fixedCode: tweak.code,
          fixExplanation: tweak.summary,
          reason: errorMessage,
        };
      },
      () => fixHeuristicCode(code, errorMessage),
    );
  }
}

export const aiManager = new AIManager();

/**
 * Central Client-Side & Cloud AI Engine Orchestrator.
 * Manages model loading state, Web Worker communication, Chrome Built-in AI,
 * rule-based instant heuristics, and seamless fallbacks.
 */

import {
  AIEngineType,
  AIEngineProgress,
  AIGeneratedTrack,
  AITweakResult,
  AIExplanationResult,
  AIVariation,
  AIWorkerRequest,
  AIWorkerResponse,
} from '../types';
import { chromeBuiltInAi } from './chromeBuiltInAi';
import {
  generateHeuristicTrack,
  tweakHeuristicCode,
  suggestHeuristicVariations,
  fixHeuristicCode,
} from './ruleBasedGenerator';

export type AIProgressListener = (progress: AIEngineProgress) => void;
export type AIEngineChangeListener = (engine: AIEngineType) => void;

class AIManager {
  private activeEngine: AIEngineType = 'cloud-gemini';
  private selectedModelId: string = 'gemma-2-2b-it-q4f16_1-MLC';
  private worker: Worker | null = null;
  private pendingRequests: Map<string, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();
  private progressListeners: Set<AIProgressListener> = new Set();
  private engineChangeListeners: Set<AIEngineChangeListener> = new Set();

  private currentProgress: AIEngineProgress = {
    status: 'ready',
    text: 'Cloud Gemini 3.7 Flash Connected',
    progress: 1.0,
  };

  private isWebGPUSupported: boolean = false;
  private isChromeBuiltInSupported: boolean = false;

  constructor() {
    this.checkHardwareCapabilities();
    this.loadSavedEnginePreference();
  }

  /**
   * Check WebGPU and Chrome Built-in AI support in current browser.
   */
  async checkHardwareCapabilities() {
    if (typeof window !== 'undefined') {
      // Check WebGPU
      this.isWebGPUSupported = 'gpu' in navigator;

      // Check Chrome Built-in AI
      const nanoCheck = await chromeBuiltInAi.isAvailable();
      this.isChromeBuiltInSupported = nanoCheck.available;
    }
  }

  getCapabilities() {
    return {
      webgpu: this.isWebGPUSupported,
      chromeBuiltIn: this.isChromeBuiltInSupported,
    };
  }

  private loadSavedEnginePreference() {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('strudel_ai_engine') as AIEngineType;
      if (saved) {
        this.setEngine(saved, false);
      } else {
        this.setEngine('cloud-gemini', false);
      }
    } catch (e) {
      // Ignore
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

  private emitEngineChange(engine: AIEngineType) {
    this.activeEngine = engine;
    try {
      localStorage.setItem('strudel_ai_engine', engine);
    } catch (e) {
      // Ignore
    }
    this.engineChangeListeners.forEach((fn) => fn(engine));
  }

  private createChromeAiProgressCallback() {
    return (text: string, loaded?: number, total?: number) => {
      let progress = 1;
      let status: any = 'generating';
      if (typeof loaded === 'number' && typeof total === 'number' && total > 0) {
        progress = loaded / total;
        status = 'downloading';
      }
      this.emitProgress({ status, text, progress });
    };
  }

  /**
   * Set active engine and start initialization if required.
   */
  async setEngine(engine: AIEngineType, triggerInit: boolean = true) {
    this.emitEngineChange(engine);

    if (engine === 'webgpu-gemma' && triggerInit) {
      await this.initWebGPUWorker(this.selectedModelId);
    } else if (engine === 'instant-heuristic') {
      this.emitProgress({
        status: 'ready',
        text: 'Instant Heuristic Engine Active (0 ms latency, 0 MB)',
        progress: 1.0,
      });
    } else if (engine === 'chrome-builtin') {
      const avail = await chromeBuiltInAi.isAvailable();
      if (avail.available) {
        this.emitProgress({
          status: 'ready',
          text: 'Chrome Built-in AI (Gemini Nano) Active',
          progress: 1.0,
        });
      } else {
        this.emitProgress({
          status: 'unsupported',
          text: avail.reason || 'Chrome Built-in AI not available.',
          progress: 0,
          errorMessage: avail.reason,
        });
      }
    } else if (engine === 'cloud-gemini') {
      this.emitProgress({
        status: 'ready',
        text: 'Cloud Gemini 2.5 Flash Connected',
        progress: 1.0,
      });
    }
  }

  /**
   * Initialize WebLLM Worker
   */
  async initWebGPUWorker(modelId: string = this.selectedModelId): Promise<boolean> {
    this.selectedModelId = modelId;

    if (!('gpu' in navigator)) {
      this.emitProgress({
        status: 'unsupported',
        text: 'WebGPU is not supported in this browser. Please use Chrome 113+ or Edge.',
        progress: 0,
        errorMessage: 'WebGPU unsupported',
      });
      return false;
    }

    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/aiWorker.ts', import.meta.url), {
        type: 'module',
      });

      this.worker.onmessage = (e: MessageEvent<AIWorkerResponse>) => {
        const { id, type, progress, data, error } = e.data;

        if (type === 'progress' && progress) {
          this.emitProgress(progress);
        }

        if (this.pendingRequests.has(id)) {
          const { resolve, reject } = this.pendingRequests.get(id)!;
          if (type === 'result' || type === 'ready') {
            this.pendingRequests.delete(id);
            resolve(data);
          } else if (type === 'error') {
            this.pendingRequests.delete(id);
            reject(new Error(error || 'Worker execution error'));
          }
        }
      };

      this.worker.onerror = (err) => {
        this.emitProgress({
          status: 'error',
          text: 'AI Worker crash or initialization failure.',
          progress: 0,
          errorMessage: err.message,
        });
      };
    }

    return new Promise<boolean>((resolve) => {
      const reqId = 'init-' + Date.now();
      this.pendingRequests.set(reqId, {
        resolve: () => {
          this.emitProgress({
            status: 'ready',
            text: `WebGPU Model (${modelId}) ready in memory.`,
            progress: 1.0,
          });
          resolve(true);
        },
        reject: (err) => {
          this.emitProgress({
            status: 'error',
            text: err.message || 'Failed to load WebGPU model.',
            progress: 0,
            errorMessage: err.message,
          });
          resolve(false);
        },
      });

      this.worker?.postMessage({
        id: reqId,
        type: 'init',
        modelId,
      } as AIWorkerRequest);
    });
  }

  private sendWorkerRequest<T>(type: AIWorkerRequest['type'], payload?: any): Promise<T> {
    if (!this.worker) {
      throw new Error('WebGPU Worker is not initialized.');
    }

    return new Promise((resolve, reject) => {
      const id = 'req-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
      this.pendingRequests.set(id, { resolve, reject });
      this.worker?.postMessage({
        id,
        type,
        modelId: this.selectedModelId,
        payload,
      } as AIWorkerRequest);
    });
  }

  /**
   * 1. Generate Pattern
   */
  async generateTrack(
    prompt: string,
    style: string,
    complexity: 'Beginner' | 'Intermediate' | 'Advanced',
    tempo: number
  ): Promise<AIGeneratedTrack> {
    // Mode 1: Instant Heuristics
    if (this.activeEngine === 'instant-heuristic') {
      return generateHeuristicTrack(prompt, style, complexity, tempo);
    }

    // Mode 2: Chrome Built-in AI
    if (this.activeEngine === 'chrome-builtin') {
      try {
        return await chromeBuiltInAi.generate(prompt, style, complexity, tempo, this.createChromeAiProgressCallback());
      } catch (e) {
        console.warn('Chrome Built-in AI failed, falling back to heuristic:', e);
        return generateHeuristicTrack(prompt, style, complexity, tempo);
      }
    }

    // Mode 3: WebGPU Gemma Worker
    if (this.activeEngine === 'webgpu-gemma') {
      try {
        return await this.sendWorkerRequest<AIGeneratedTrack>('generate', {
          prompt,
          style,
          complexity,
          tempo,
        });
      } catch (e) {
        console.warn('WebGPU Gemma failed, falling back to heuristic:', e);
        return generateHeuristicTrack(prompt, style, complexity, tempo);
      }
    }

    // Mode 4: Cloud Gemini Server API
    try {
      const res = await fetch('/api/generate-strudel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style, complexity, tempo }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        return data.data;
      }
      throw new Error(data.error || 'Server generation failed');
    } catch (e) {
      console.warn('Cloud API failed, falling back to heuristic:', e);
      return generateHeuristicTrack(prompt, style, complexity, tempo);
    }
  }

  /**
   * 2. Tweak Pattern
   */
  async tweakPattern(currentCode: string, instruction: string): Promise<AITweakResult> {
    if (this.activeEngine === 'instant-heuristic') {
      return tweakHeuristicCode(currentCode, instruction);
    }

    if (this.activeEngine === 'chrome-builtin') {
      try {
        return await chromeBuiltInAi.tweak(currentCode, instruction, this.createChromeAiProgressCallback());
      } catch (e) {
        return tweakHeuristicCode(currentCode, instruction);
      }
    }

    if (this.activeEngine === 'webgpu-gemma') {
      try {
        return await this.sendWorkerRequest<AITweakResult>('tweak', {
          currentCode,
          instruction,
        });
      } catch (e) {
        return tweakHeuristicCode(currentCode, instruction);
      }
    }

    // Cloud Fallback
    try {
      const res = await fetch('/api/tweak-pattern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentCode, instruction }),
      });
      const data = await res.json();
      if (data.success && data.data) return data.data;
      throw new Error(data.error);
    } catch (e) {
      return tweakHeuristicCode(currentCode, instruction);
    }
  }

  /**
   * 3. Line-By-Line Breakdown & Music Theory
   */
  async explainCode(code: string): Promise<AIExplanationResult> {
    if (this.activeEngine === 'instant-heuristic') {
      return {
        summary: 'Algorithmic Strudel composition utilizing multi-voice mini-notation patterns.',
        lineByLine: [
          { line: 'stack(...)', role: 'Structure', explanation: 'Combines multiple voices and instruments concurrently in synchronization' },
          { line: 's("bd*4")', role: 'Drums', explanation: 'Solid 4-on-the-floor kick drum rhythm anchoring the groove' },
          { line: 'note("<...>")', role: 'Bass', explanation: 'Melodic sequence stepping through harmony across cycles' },
        ],
        miniNotationGuide: [
          { symbol: '*', title: 'Subdivision Speed', explanation: 'Repeats event N times per cycle', example: 'bd*4' },
          { symbol: '~', title: 'Musical Rest', explanation: 'Silent pause', example: '~ cp ~ cp' },
        ],
        musicTheoryTip: 'Adjusting filter cutoff (.lpf) and stereo room reverb creates harmonic depth and spaciousness.',
      };
    }

    if (this.activeEngine === 'chrome-builtin') {
      try {
        return await chromeBuiltInAi.explain(code, this.createChromeAiProgressCallback());
      } catch (e) {
        return this.explainCodeFallback(code);
      }
    }

    if (this.activeEngine === 'webgpu-gemma') {
      try {
        return await this.sendWorkerRequest<AIExplanationResult>('explain', { code });
      } catch (e) {
        return this.explainCodeFallback(code);
      }
    }

    try {
      const res = await fetch('/api/explain-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.success && data.data) return data.data;
      throw new Error(data.error);
    } catch (e) {
      return this.explainCodeFallback(code);
    }
  }

  private explainCodeFallback(code: string): AIExplanationResult {
    return {
      summary: 'Strudel algorithmic live-coding structure.',
      lineByLine: [
        { line: 'stack(...)', role: 'Structure', explanation: 'Runs nested layers together' },
      ],
      miniNotationGuide: [
        { symbol: '*', title: 'Subdivision', explanation: 'Repeat step', example: 'bd*4' },
      ],
      musicTheoryTip: 'Combine rhythmic syncopation with lowpass filter modulation for maximum dynamic range.',
    };
  }

  /**
   * 4. Suggest DJ Variations
   */
  async suggestVariations(currentCode: string, mood: string): Promise<{ variations: AIVariation[] }> {
    if (this.activeEngine === 'instant-heuristic') {
      return suggestHeuristicVariations(currentCode, mood);
    }

    if (this.activeEngine === 'chrome-builtin') {
      try {
        return await chromeBuiltInAi.suggestVariations(currentCode, mood, this.createChromeAiProgressCallback());
      } catch (e) {
        return suggestHeuristicVariations(currentCode, mood);
      }
    }

    if (this.activeEngine === 'webgpu-gemma') {
      try {
        return await this.sendWorkerRequest<{ variations: AIVariation[] }>('suggest_variations', {
          currentCode,
          mood,
        });
      } catch (e) {
        return suggestHeuristicVariations(currentCode, mood);
      }
    }

    try {
      const res = await fetch('/api/suggest-variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentCode, mood }),
      });
      const data = await res.json();
      if (data.success && data.data) return data.data;
      throw new Error(data.error);
    } catch (e) {
      return suggestHeuristicVariations(currentCode, mood);
    }
  }

  /**
   * 5. Fix Broken Code
   */
  async fixCode(code: string, errorMessage: string): Promise<{ fixedCode: string; fixExplanation: string; reason: string }> {
    if (this.activeEngine === 'instant-heuristic') {
      return fixHeuristicCode(code, errorMessage);
    }

    if (this.activeEngine === 'chrome-builtin') {
      try {
        return await chromeBuiltInAi.fix(code, errorMessage, this.createChromeAiProgressCallback());
      } catch (e) {
        return fixHeuristicCode(code, errorMessage);
      }
    }

    if (this.activeEngine === 'webgpu-gemma') {
      try {
        return await this.sendWorkerRequest<{ fixedCode: string; fixExplanation: string; reason: string }>('fix', {
          code,
          errorMessage,
        });
      } catch (e) {
        return fixHeuristicCode(code, errorMessage);
      }
    }

    try {
      const res = await fetch('/api/fix-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, errorMessage }),
      });
      const data = await res.json();
      if (data.success && data.data) return data.data;
      throw new Error(data.error);
    } catch (e) {
      return fixHeuristicCode(code, errorMessage);
    }
  }
}

export const aiManager = new AIManager();

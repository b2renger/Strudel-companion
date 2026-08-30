/**
 * Chrome Built-in AI (Gemini Nano) Client Adapter.
 * Uses window.ai / ai.languageModel if available for zero-download on-device inference.
 */

import {
  buildGeneratePrompt,
  buildTweakPrompt,
  buildExplainPrompt,
  buildVariationsPrompt,
  buildFixPrompt,
} from './prompts';
import {
  parseGeneratedTrack,
  parseTweakResult,
  parseExplanationResult,
  parseVariationsResult,
} from './outputParser';
import { AIGeneratedTrack, AITweakResult, AIExplanationResult, AIVariation } from '../types';

export class ChromeBuiltInAiService {
  private session: any = null;

  /**
   * Check if Chrome Built-in AI (Prompt API) is available in current browser environment.
   */
  async isAvailable(): Promise<{ available: boolean; reason?: string }> {
    try {
      // @ts-ignore
      const aiGlobal = window.ai || (window as any).modelPrompt;
      if (!aiGlobal && !('ai' in window)) {
        return { available: false, reason: 'Chrome Built-in AI API not detected in window object.' };
      }

      // @ts-ignore
      const lm = window.ai?.languageModel || (window as any).ai?.assistant;
      if (!lm) {
        return { available: false, reason: 'LanguageModel API not enabled in chrome://flags' };
      }

      const capabilities = await lm.capabilities?.();
      if (capabilities && capabilities.available === 'no') {
        return { available: false, reason: 'Gemini Nano model not downloaded or supported on this device.' };
      }
      
      // If 'after-download', we can still return true, it will download on first create()
      return { available: true };
    } catch (e: any) {
      return { available: false, reason: e.message || 'Error checking Chrome Built-in AI' };
    }
  }

  /**
   * Create a fresh session. We DO NOT reuse sessions because each prompt is a 
   * discrete stateless task and Gemini Nano's context window fills up quickly.
   */
  private async createSession(onProgress?: (msg: string, loaded?: number, total?: number) => void): Promise<any> {
    // @ts-ignore
    const lm = window.ai?.languageModel || (window as any).ai?.assistant;
    if (!lm) throw new Error('Chrome Built-in AI not available');
    
    // Create a new session with strict instructions for JSON
    const session = await lm.create({
      systemPrompt: 'You are Strudel AI, an expert music live-coding generator. You MUST respond in valid JSON format only, with no markdown formatting outside of what is requested.',
      temperature: 0.7, // Add a bit of creativity but keep it structured
      topK: 40,
      monitor: onProgress ? (m: any) => {
        m.addEventListener('downloadprogress', (e: any) => {
          onProgress('Downloading AI Model...', e.loaded, e.total);
        });
      } : undefined
    });
    return session;
  }

  async generate(
    prompt: string,
    style: string,
    complexity: 'Beginner' | 'Intermediate' | 'Advanced',
    tempo: number,
    onProgress?: (msg: string, loaded?: number, total?: number) => void
  ): Promise<AIGeneratedTrack> {
    const session = await this.createSession(onProgress);
    try {
      if (onProgress) onProgress('Synthesizing Code...');
      const formattedPrompt = buildGeneratePrompt(prompt, style, complexity, tempo);
      const rawResult = await session.prompt(formattedPrompt);
      return parseGeneratedTrack(rawResult, prompt, style);
    } finally {
      if (typeof session.destroy === 'function') session.destroy();
    }
  }

  async tweak(currentCode: string, instruction: string, onProgress?: (msg: string) => void): Promise<AITweakResult> {
    const session = await this.createSession(onProgress);
    try {
      if (onProgress) onProgress('Tweaking Code...');
      const formattedPrompt = buildTweakPrompt(currentCode, instruction);
      const rawResult = await session.prompt(formattedPrompt);
      return parseTweakResult(rawResult, currentCode);
    } finally {
      if (typeof session.destroy === 'function') session.destroy();
    }
  }

  async explain(code: string, onProgress?: (msg: string) => void): Promise<AIExplanationResult> {
    const session = await this.createSession(onProgress);
    try {
      if (onProgress) onProgress('Analyzing Code...');
      const formattedPrompt = buildExplainPrompt(code);
      const rawResult = await session.prompt(formattedPrompt);
      return parseExplanationResult(rawResult);
    } finally {
      if (typeof session.destroy === 'function') session.destroy();
    }
  }

  async suggestVariations(currentCode: string, mood: string, onProgress?: (msg: string) => void): Promise<{ variations: AIVariation[] }> {
    const session = await this.createSession(onProgress);
    try {
      if (onProgress) onProgress('Generating Variations...');
      const formattedPrompt = buildVariationsPrompt(currentCode, mood);
      const rawResult = await session.prompt(formattedPrompt);
      return parseVariationsResult(rawResult, currentCode);
    } finally {
      if (typeof session.destroy === 'function') session.destroy();
    }
  }

  async fix(code: string, errorMessage: string, onProgress?: (msg: string) => void): Promise<{ fixedCode: string; fixExplanation: string; reason: string }> {
    const session = await this.createSession(onProgress);
    try {
      if (onProgress) onProgress('Fixing Errors...');
      const formattedPrompt = buildFixPrompt(code, errorMessage);
      const rawResult = await session.prompt(formattedPrompt);
      const parsed = parseTweakResult(rawResult, code);
      return {
        fixedCode: parsed.code,
        fixExplanation: parsed.summary,
        reason: errorMessage,
      };
    } finally {
      if (typeof session.destroy === 'function') session.destroy();
    }
  }

  destroy() {
    // No-op since we create fresh sessions
  }
}

export const chromeBuiltInAi = new ChromeBuiltInAiService();

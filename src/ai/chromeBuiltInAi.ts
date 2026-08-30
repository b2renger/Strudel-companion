/**
 * Chrome built-in AI (Gemini Nano) adapter.
 *
 * Rewritten for the API Chrome actually ships. The previous implementation
 * targeted the 2024 origin-trial shape — `window.ai.languageModel`,
 * `lm.capabilities()`, `create({ systemPrompt, temperature, topK })` — none of
 * which exists any more. `window.ai` is undefined on every current Chrome, so
 * the availability check returned false on 100% of browsers INCLUDING the ones
 * where the feature works, and the whole file was unreachable.
 *
 * What shipped instead (Chrome 138 stable, no flag, web pages):
 *   - a flat `LanguageModel` global on `self`
 *   - `LanguageModel.availability()` → 'unavailable' | 'downloadable'
 *     | 'downloading' | 'available'
 *   - `LanguageModel.create({ initialPrompts, monitor, signal })`
 *   - `temperature` / `topK` are extension-only; passing them from a web page
 *     is rejected
 *   - the `downloadprogress` event carries `loaded` (0→1) and no `total`
 *
 * Platform reality: desktop only — Windows 10/11, macOS 13+, Linux, and
 * Chromebook Plus. It does NOT exist on Android or iOS, and it needs roughly
 * 4 GB of VRAM and 22 GB of free disk. This adapter reports itself
 * unavailable on mobile rather than offering an engine that cannot run.
 */

import {
  buildGeneratePrompt,
  buildTweakPrompt,
  buildExplainPrompt,
  buildVariationPrompt,
  buildFixPrompt,
  STRUDEL_SYSTEM_PROMPT,
} from './prompts';
import {
  parseGeneratedTrack,
  parseTweakResult,
  parseExplanationResult,
  parseVariationResult,
} from './outputParser';
import { AIGeneratedTrack, AITweakResult, AIExplanationResult, AIVariation } from '../types';

type ProgressSink = (text: string, fraction?: number) => void;

interface VariationRecipe {
  type: string;
  title: string;
  description: string;
}

function getLanguageModel(): any | null {
  const globalObj = self as any;
  return typeof globalObj.LanguageModel !== 'undefined' ? globalObj.LanguageModel : null;
}

export class ChromeBuiltInAiService {
  private progressSink: ProgressSink | null = null;
  private abort: AbortController | null = null;

  /** Lets the manager surface download progress without threading callbacks. */
  setProgressSink(sink: ProgressSink | null) {
    this.progressSink = sink;
  }

  async isAvailable(): Promise<{ available: boolean; reason?: string }> {
    try {
      const ua = navigator.userAgent || '';
      const isMobile =
        /Android/.test(ua) ||
        /iP(hone|od|ad)/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      if (isMobile) {
        return {
          available: false,
          reason: 'Chrome built-in AI is desktop-only — it does not exist on Android or iOS.',
        };
      }

      const LM = getLanguageModel();
      if (!LM) {
        return {
          available: false,
          reason: 'Needs Chrome 138 or newer on desktop.',
        };
      }

      const status = await LM.availability();
      switch (status) {
        case 'available':
          return { available: true };
        case 'downloadable':
          return { available: true, reason: 'Gemini Nano will download on first use.' };
        case 'downloading':
          return { available: true, reason: 'Gemini Nano is downloading.' };
        default:
          return {
            available: false,
            reason:
              'Gemini Nano is not supported on this device. It needs roughly 4 GB of video ' +
              'memory and 22 GB of free disk space.',
          };
      }
    } catch (e: any) {
      return { available: false, reason: e?.message || 'Could not check Chrome built-in AI.' };
    }
  }

  /**
   * A fresh session per call: each task here is stateless, and Nano's context
   * window is small enough that reuse would fill it quickly.
   */
  private async createSession(): Promise<any> {
    const LM = getLanguageModel();
    if (!LM) throw new Error('Chrome built-in AI is not available in this browser.');

    this.abort = new AbortController();

    return LM.create({
      // `systemPrompt` was replaced by a system-role entry in `initialPrompts`.
      initialPrompts: [{ role: 'system', content: STRUDEL_SYSTEM_PROMPT }],
      signal: this.abort.signal,
      monitor: (m: any) => {
        m.addEventListener('downloadprogress', (e: any) => {
          // `loaded` is already a 0→1 fraction; there is no `total`.
          this.progressSink?.('Downloading Gemini Nano…', e.loaded);
        });
      },
    });
  }

  private async run(prompt: string, label: string): Promise<string> {
    const session = await this.createSession();
    try {
      this.progressSink?.(label);
      const result = await session.prompt(prompt);
      if (!result || !String(result).trim()) {
        throw new Error('Chrome built-in AI returned an empty response.');
      }
      return String(result);
    } finally {
      if (typeof session?.destroy === 'function') session.destroy();
      this.abort = null;
    }
  }

  /** Aborts the in-flight request, including a model download. */
  cancel() {
    this.abort?.abort();
    this.abort = null;
  }

  async generate(
    prompt: string,
    style: string,
    complexity: 'Beginner' | 'Intermediate' | 'Advanced',
    tempo: number,
  ): Promise<AIGeneratedTrack> {
    const raw = await this.run(
      buildGeneratePrompt(prompt, style, complexity, tempo),
      'Composing…',
    );
    return parseGeneratedTrack(raw, prompt, style, tempo);
  }

  async tweak(currentCode: string, instruction: string): Promise<AITweakResult> {
    const raw = await this.run(buildTweakPrompt(currentCode, instruction), 'Applying your change…');
    return parseTweakResult(raw);
  }

  async explain(code: string): Promise<AIExplanationResult> {
    const raw = await this.run(buildExplainPrompt(code), 'Analysing the pattern…');
    return parseExplanationResult(raw);
  }

  async variation(
    currentCode: string,
    mood: string,
    recipe: VariationRecipe,
  ): Promise<AIVariation> {
    const raw = await this.run(
      buildVariationPrompt(currentCode, mood, recipe.type, recipe.description),
      `Creating "${recipe.title}"…`,
    );
    return parseVariationResult(raw, recipe);
  }

  async fix(code: string, errorMessage: string): Promise<AITweakResult> {
    const raw = await this.run(buildFixPrompt(code, errorMessage), 'Fixing the pattern…');
    // Shares the tweak parser because the fix prompt now asks for the same
    // shape. The two used to disagree, which broke the fix path entirely.
    return parseTweakResult(raw);
  }
}

export const chromeBuiltInAi = new ChromeBuiltInAiService();

/**
 * Catalogue of local WebGPU models.
 *
 * This lives in its own module, NOT in `src/workers/aiWorker.ts`, because the
 * engine-picker UI needs the list. When the list lived in the worker file, the
 * modal's `import { SUPPORTED_WEBGPU_MODELS } from '../workers/aiWorker'`
 * pulled the whole of `@mlc-ai/web-llm` into the main bundle on every page
 * load — megabytes of JS parsed on the main thread before first paint, even
 * for visitors who never touch a local model — and evaluated the worker's
 * `self.onmessage = ...` in window scope, clobbering `window.onmessage`.
 *
 * Nothing outside the worker may import the worker module.
 *
 * `vramMB` values are the `vram_required_MB` figures from web-llm's own
 * `prebuiltAppConfig`. The download is a comparable size, and the weights are
 * cached afterwards.
 */

export interface WebGPUModelSpec {
  id: string;
  name: string;
  /** GPU memory required at runtime, from web-llm's prebuiltAppConfig. */
  vramMB: number;
  /**
   * Whether the model needs the WebGPU `shader-f16` feature.
   *
   * Every `q4f16_1` build does. web-llm only DECLARES `required_features` for
   * gemma-2-2b, so its own clean "requires shader-f16" error never fires for
   * the q4f16_1 Llama/Qwen/SmolLM2 builds — those surface as a raw WGSL
   * compile error from inside the WASM, after the full download has completed.
   * We therefore gate on this flag ourselves rather than trusting web-llm.
   */
  needsF16: boolean;
  contextWindow: number;
  /**
   * Gemma 2's chat template has no system turn, so its system text must be
   * merged into the user message. Llama/Qwen/SmolLM2 are system-tuned and
   * lose quality if we do the same to them.
   */
  supportsSystemRole: boolean;
  /** Shown on the model card. */
  description: string;
}

export const WEBGPU_MODELS: WebGPUModelSpec[] = [
  {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 360M',
    vramMB: 376,
    needsF16: true,
    contextWindow: 4096,
    supportsSystemRole: true,
    description: 'Smallest and fastest. Best choice on a phone. Patterns are simple.',
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B',
    vramMB: 879,
    needsF16: true,
    contextWindow: 4096,
    supportsSystemRole: true,
    description: 'Good balance of size and musical coherence. A solid default.',
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 0.5B',
    vramMB: 945,
    needsF16: true,
    contextWindow: 4096,
    supportsSystemRole: true,
    description: 'Very fast, follows output formats reliably for its size.',
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    name: 'Llama 3.2 1B (f32)',
    vramMB: 1129,
    needsF16: false,
    contextWindow: 4096,
    supportsSystemRole: true,
    description:
      'The only option for GPUs without 16-bit shader support — notably every Qualcomm chip, so most Android phones. Larger and slower than the f16 build, but it runs where that one cannot.',
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC-1k',
    name: 'Gemma 2 2B (1k context)',
    vramMB: 1583,
    needsF16: true,
    contextWindow: 1024,
    supportsSystemRole: false,
    description:
      'Gemma 2 with a smaller context window, so it needs less memory. Long patterns may not fit.',
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 1.7B',
    vramMB: 1774,
    needsF16: true,
    contextWindow: 4096,
    supportsSystemRole: true,
    description: 'Stronger reasoning than the 360M build at roughly five times the memory.',
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    name: 'Gemma 2 2B',
    vramMB: 1895,
    needsF16: true,
    contextWindow: 4096,
    supportsSystemRole: false,
    description: 'The most musically capable local option. Desktop with a dedicated GPU only.',
  },
];

export const DEFAULT_MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

export function getModelSpec(id: string): WebGPUModelSpec | undefined {
  return WEBGPU_MODELS.find((m) => m.id === id);
}

export function formatSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

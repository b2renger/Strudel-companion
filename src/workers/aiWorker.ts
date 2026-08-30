/**
 * Dedicated Web Worker for In-Browser WebGPU LLM Inference using @mlc-ai/web-llm.
 * Runs Gemma 2B in an isolated thread to guarantee zero jitter on Web Audio synthesis clock.
 */

import { CreateMLCEngine, MLCEngine, InitProgressReport } from '@mlc-ai/web-llm';
import {
  buildGeneratePrompt,
  buildTweakPrompt,
  buildExplainPrompt,
  buildVariationsPrompt,
  buildFixPrompt,
} from '../ai/prompts';
import {
  parseGeneratedTrack,
  parseTweakResult,
  parseExplanationResult,
  parseVariationsResult,
} from '../ai/outputParser';
import { AIWorkerRequest, AIWorkerResponse } from '../types';

let engine: MLCEngine | null = null;
let currentModelId = 'gemma-2-2b-it-q4f16_1-MLC';
let isInitializing = false;

// Supported WebGPU models ranked by performance and footprint
export const SUPPORTED_WEBGPU_MODELS = [
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    name: 'Gemma 2 2B Instruct',
    size: '~1.4 GB',
    vram: '2.0 GB VRAM',
    description: 'Google Gemma 2 2B optimized for WebGPU reasoning and code synthesis.',
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 1.7B Instruct',
    size: '~1.0 GB',
    vram: '1.5 GB VRAM',
    description: 'Ultra-fast lightweight model with minimal download time.',
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B Instruct',
    size: '~0.8 GB',
    vram: '1.2 GB VRAM',
    description: 'Extremely compact model suitable for mobile and low-VRAM devices.',
  },
];

function sendResponse(response: AIWorkerResponse) {
  self.postMessage(response);
}

/**
 * Initialize WebLLM engine with WebGPU
 */
async function initEngine(modelId: string = currentModelId, reqId: string = 'init') {
  if (engine && currentModelId === modelId) {
    sendResponse({ id: reqId, type: 'ready' });
    return;
  }

  if (isInitializing) return;
  isInitializing = true;
  currentModelId = modelId;

  try {
    sendResponse({
      id: reqId,
      type: 'progress',
      progress: {
        status: 'downloading',
        text: `Initializing WebGPU shader pipelines for ${modelId}...`,
        progress: 0.05,
      },
    });

    const initProgressCallback = (report: InitProgressReport) => {
      sendResponse({
        id: reqId,
        type: 'progress',
        progress: {
          status: 'downloading',
          text: report.text,
          progress: report.progress,
          timeElapsed: report.timeElapsed,
        },
      });
    };

    engine = await CreateMLCEngine(modelId, {
      initProgressCallback,
      logLevel: 'WARN',
    });

    isInitializing = false;
    sendResponse({
      id: reqId,
      type: 'ready',
      progress: {
        status: 'ready',
        text: `Model ${modelId} loaded and ready in WebGPU memory.`,
        progress: 1.0,
      },
    });
  } catch (err: any) {
    isInitializing = false;
    sendResponse({
      id: reqId,
      type: 'error',
      error: err.message || 'Failed to initialize WebGPU WebLLM Engine.',
      progress: {
        status: 'error',
        text: err.message || 'WebGPU initialization failed',
        progress: 0,
        errorMessage: err.message,
      },
    });
  }
}

/**
 * Execute chat completion via engine
 */
async function executePrompt(promptText: string): Promise<string> {
  if (!engine) {
    throw new Error('WebLLM Engine is not initialized. Please load the model first.');
  }

  const completion = await engine.chat.completions.create({
    messages: [
      { role: 'user', content: promptText },
    ],
    temperature: 0.4,
    max_tokens: 1024,
  });

  return completion.choices[0]?.message?.content || '';
}

// Handle incoming messages from the main UI thread
self.onmessage = async (e: MessageEvent<AIWorkerRequest>) => {
  const { id, type, modelId, payload } = e.data;

  try {
    switch (type) {
      case 'init':
        await initEngine(modelId || currentModelId, id);
        break;

      case 'generate': {
        if (!engine) await initEngine(modelId || currentModelId, id);
        const { prompt, style, complexity, tempo } = payload;
        const promptString = buildGeneratePrompt(prompt, style, complexity, tempo);
        const rawOutput = await executePrompt(promptString);
        const parsed = parseGeneratedTrack(rawOutput, prompt, style);
        sendResponse({ id, type: 'result', data: parsed });
        break;
      }

      case 'tweak': {
        if (!engine) await initEngine(modelId || currentModelId, id);
        const { currentCode, instruction } = payload;
        const promptString = buildTweakPrompt(currentCode, instruction);
        const rawOutput = await executePrompt(promptString);
        const parsed = parseTweakResult(rawOutput, currentCode);
        sendResponse({ id, type: 'result', data: parsed });
        break;
      }

      case 'explain': {
        if (!engine) await initEngine(modelId || currentModelId, id);
        const { code } = payload;
        const promptString = buildExplainPrompt(code);
        const rawOutput = await executePrompt(promptString);
        const parsed = parseExplanationResult(rawOutput);
        sendResponse({ id, type: 'result', data: parsed });
        break;
      }

      case 'suggest_variations': {
        if (!engine) await initEngine(modelId || currentModelId, id);
        const { currentCode, mood } = payload;
        const promptString = buildVariationsPrompt(currentCode, mood);
        const rawOutput = await executePrompt(promptString);
        const parsed = parseVariationsResult(rawOutput, currentCode);
        sendResponse({ id, type: 'result', data: parsed });
        break;
      }

      case 'fix': {
        if (!engine) await initEngine(modelId || currentModelId, id);
        const { code, errorMessage } = payload;
        const promptString = buildFixPrompt(code, errorMessage);
        const rawOutput = await executePrompt(promptString);
        const parsed = parseTweakResult(rawOutput, code);
        sendResponse({
          id,
          type: 'result',
          data: {
            fixedCode: parsed.code,
            fixExplanation: parsed.summary,
            reason: errorMessage,
          },
        });
        break;
      }

      case 'unload': {
        if (engine) {
          await engine.unload();
          engine = null;
        }
        sendResponse({ id, type: 'result', data: { unloaded: true } });
        break;
      }

      default:
        sendResponse({ id, type: 'error', error: `Unknown worker action: ${type}` });
    }
  } catch (err: any) {
    sendResponse({ id, type: 'error', error: err.message || 'Error processing AI worker request' });
  }
};

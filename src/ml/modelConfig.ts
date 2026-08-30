/**
 * The architecture for a Strudel-only model.
 *
 * Two constraints shaped every number here.
 *
 * It must be a LLAMA. Not because Llama is special, but because MLC-LLM — the
 * compiler that produces the WebGPU artifacts web-llm loads — already supports
 * that architecture. A bespoke transformer would mean adding an architecture to
 * MLC before anything could run in a browser at all. A Llama config with tiny
 * dimensions compiles unchanged.
 *
 * It must be small enough to precache with the app. The whole argument for
 * doing this rather than shipping a general 0.5B model is that the download
 * stops being a download. At ~9 MB it is smaller than the JS bundle: no
 * progress bar, no `Cache.add()` to fail on mobile, no storage gate, no
 * 30-minute timeout — the failures that fill the session traces stop being
 * possible rather than becoming rarer.
 *
 * Nothing here has been trained. This file is the specification the training
 * script and the size arithmetic both read, so the numbers quoted in the docs
 * are computed rather than asserted.
 */

import { VOCAB_SIZE } from './tokenizer';

export interface LlamaConfig {
  vocabSize: number;
  hiddenSize: number;
  numLayers: number;
  numAttentionHeads: number;
  /** Grouped-query attention. Equal to `numAttentionHeads` means plain MHA. */
  numKeyValueHeads: number;
  intermediateSize: number;
  maxPositionEmbeddings: number;
  ropeTheta: number;
  rmsNormEps: number;
  /** Llama ties the output projection to the embedding. Saves vocab x hidden. */
  tieWordEmbeddings: boolean;
}

/**
 * `intermediateSize` is 704 rather than a round number because SwiGLU wants
 * roughly 2.7x the hidden size and MLC prefers a multiple of 64 for its
 * kernels. 256 * 2.75 = 704.
 *
 * `maxPositionEmbeddings` is 512: the longest pattern the composer produces is
 * well under 200 tokens, and a context this short keeps the KV cache to a few
 * hundred kilobytes.
 */
export const STRUDEL_MODEL_CONFIG: LlamaConfig = {
  vocabSize: VOCAB_SIZE,
  hiddenSize: 256,
  numLayers: 6,
  numAttentionHeads: 4,
  numKeyValueHeads: 4,
  intermediateSize: 704,
  maxPositionEmbeddings: 512,
  ropeTheta: 10000,
  rmsNormEps: 1e-5,
  tieWordEmbeddings: true,
};

export interface ParameterBreakdown {
  embedding: number;
  attentionPerLayer: number;
  mlpPerLayer: number;
  normsPerLayer: number;
  perLayer: number;
  allLayers: number;
  finalNorm: number;
  lmHead: number;
  total: number;
}

/** The exact Llama parameter count. No estimation. */
export function parameterBreakdown(config: LlamaConfig = STRUDEL_MODEL_CONFIG): ParameterBreakdown {
  const { vocabSize, hiddenSize, numLayers, numAttentionHeads, numKeyValueHeads } = config;
  const headDim = hiddenSize / numAttentionHeads;

  const embedding = vocabSize * hiddenSize;

  const q = hiddenSize * (numAttentionHeads * headDim);
  const k = hiddenSize * (numKeyValueHeads * headDim);
  const v = hiddenSize * (numKeyValueHeads * headDim);
  const o = numAttentionHeads * headDim * hiddenSize;
  const attentionPerLayer = q + k + v + o;

  // SwiGLU: gate and up project into the intermediate size, down projects back.
  const mlpPerLayer = 3 * hiddenSize * config.intermediateSize;

  // RMSNorm before attention and before the MLP, one scale vector each.
  const normsPerLayer = 2 * hiddenSize;

  const perLayer = attentionPerLayer + mlpPerLayer + normsPerLayer;
  const allLayers = perLayer * numLayers;
  const finalNorm = hiddenSize;
  const lmHead = config.tieWordEmbeddings ? 0 : vocabSize * hiddenSize;

  return {
    embedding,
    attentionPerLayer,
    mlpPerLayer,
    normsPerLayer,
    perLayer,
    allLayers,
    finalNorm,
    lmHead,
    total: embedding + allLayers + finalNorm + lmHead,
  };
}

export function parameterCount(config: LlamaConfig = STRUDEL_MODEL_CONFIG): number {
  return parameterBreakdown(config).total;
}

/**
 * On-disk size.
 *
 * `q4f16_1` is 4-bit weights plus a group scale, which works out near 4.5 bits
 * per weight in practice rather than 4 — the figure quoted in the docs uses
 * this, not a naive divide by two.
 */
export function estimateBytes(
  params: number,
  quantisation: 'fp32' | 'fp16' | 'q4f16_1',
): number {
  const bitsPerWeight = { fp32: 32, fp16: 16, q4f16_1: 4.5 }[quantisation];
  return Math.round((params * bitsPerWeight) / 8);
}

export function formatBytes(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return mib >= 1 ? `${mib.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** The `config.json` MLC-LLM and transformers both expect. */
export function toHuggingFaceConfig(config: LlamaConfig = STRUDEL_MODEL_CONFIG) {
  return {
    architectures: ['LlamaForCausalLM'],
    model_type: 'llama',
    vocab_size: config.vocabSize,
    hidden_size: config.hiddenSize,
    intermediate_size: config.intermediateSize,
    num_hidden_layers: config.numLayers,
    num_attention_heads: config.numAttentionHeads,
    num_key_value_heads: config.numKeyValueHeads,
    max_position_embeddings: config.maxPositionEmbeddings,
    rope_theta: config.ropeTheta,
    rms_norm_eps: config.rmsNormEps,
    tie_word_embeddings: config.tieWordEmbeddings,
    hidden_act: 'silu',
    torch_dtype: 'float32',
    bos_token_id: 1,
    eos_token_id: 2,
    pad_token_id: 0,
  };
}

/**
 * Builds a training corpus for the Strudel-only model.
 *
 * Every sample comes from code already in the app — `proceduralComposer` for
 * whole tracks and `variationEngine` for edits of them — so the corpus needs no
 * scraping, no licensing and no cleanup. It is also, by construction, entirely
 * made of patterns this engine can play.
 *
 * The honest limitation, stated here because it governs what the model can
 * ever be: a model trained only on this learns the composer's distribution and
 * nothing beyond it. That is still worth doing — it buys a 9 MB model that
 * emits valid Strudel on a phone with no download — but the capability that
 * would be genuinely NEW, mapping free prose onto musical intent, needs paired
 * data from real use. The session trace already records the raw material for
 * that (prompt, accepted pattern, kept or undone); wiring it up is deliberately
 * a later step.
 *
 * Nothing is admitted without passing the same gates the app applies to model
 * output: it must validate, it must survive the sanitiser unchanged, and every
 * character of it must be covered by the tokenizer.
 *
 *   npm run corpus            # default 400 seeds per genre
 *   npm run corpus -- 1200    # more
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { composeTrack, PROCEDURAL_GENRES } from '../src/ai/proceduralComposer.ts';
import { buildHeuristicVariations, splitPattern } from '../src/ai/variationEngine.ts';
import { validateStructure } from '../src/audio/validate.ts';
import { sanitizeGeneratedCode } from '../src/ai/sanitizeCode.ts';
import {
  encodeSample,
  isFullyCovered,
  VOCABULARY,
  VOCAB_SIZE,
  type Conditioning,
} from '../src/ml/tokenizer.ts';
import {
  STRUDEL_MODEL_CONFIG,
  parameterCount,
  estimateBytes,
  formatBytes,
  toHuggingFaceConfig,
} from '../src/ml/modelConfig.ts';

const SEEDS_PER_GENRE = Number(process.argv[2]) || 400;
const OUT_DIR = 'data';
const OUT_FILE = `${OUT_DIR}/corpus.jsonl`;

interface Sample {
  genre: string;
  bpm: number;
  complexity: Conditioning['complexity'];
  code: string;
  tokens: number[];
}

/** Derived from the pattern itself, so the label always matches the music. */
function complexityOf(code: string): Conditioning['complexity'] {
  const layers = splitPattern(code)?.layers.length ?? 0;
  if (layers <= 3) return 'beginner';
  if (layers <= 4) return 'intermediate';
  return 'advanced';
}

const samples: Sample[] = [];
const seenCode = new Set<string>();
const rejected = { invalid: 0, unfixable: 0, unstable: 0, uncovered: 0, duplicate: 0, tooLong: 0 };

function admit(code: string, genre: string, bpm: number) {
  if (!validateStructure(code.trim()).ok) {
    rejected.invalid++;
    return;
  }

  // The corpus holds the CANONICAL form, not the source form.
  //
  // The procedural composer writes "// TWEAK TIP:" comments, which are useful
  // to a human reading the editor and forbidden in model output — the prompts
  // say so and the sanitiser strips them. Training on the source form would
  // teach the model to emit exactly what the rest of the app removes, so the
  // sample is what the sanitiser produces.
  const clean = sanitizeGeneratedCode(code.trim(), 'corpus');
  if (clean.problems.length > 0) {
    rejected.unfixable++;
    return;
  }
  const canonical = clean.code.trim();

  // ...and it has to be a fixed point. If sanitising the canonical form changes
  // it again, the sanitiser and this corpus disagree about what valid output
  // looks like, and the model would be taught the losing side.
  if (sanitizeGeneratedCode(canonical, 'corpus').code.trim() !== canonical) {
    rejected.unstable++;
    return;
  }

  if (seenCode.has(canonical)) {
    rejected.duplicate++;
    return;
  }
  if (!isFullyCovered(canonical)) {
    rejected.uncovered++;
    return;
  }

  const conditioning: Conditioning = { genre, bpm, complexity: complexityOf(canonical) };
  const tokens = encodeSample(conditioning, canonical);
  if (tokens.length > STRUDEL_MODEL_CONFIG.maxPositionEmbeddings) {
    rejected.tooLong++;
    return;
  }

  seenCode.add(canonical);
  samples.push({ ...conditioning, code: canonical, tokens });
}

/**
 * A shorter arrangement of the same track.
 *
 * The composer almost always writes five or six layers, so a corpus of its raw
 * output is 99% "advanced" and the `<complexity:*>` token conditions nothing —
 * the model would have no way to learn what a sparse pattern is. Truncating to
 * the first `k` layers gives genuine beginner and intermediate examples out of
 * the same material, and it is musically sound because the composer emits
 * drums first, then bass, then harmony: the first three layers are a groove,
 * not an arbitrary subset.
 */
function reduceToLayers(code: string, k: number): string | null {
  const parsed = splitPattern(code);
  if (!parsed || parsed.layers.length <= k) return null;
  const kept = parsed.layers.slice(0, k).map((l) => l.trim());
  return `${parsed.head}\n  ${kept.join(',\n  ')}\n${parsed.tail}`;
}

for (const genre of PROCEDURAL_GENRES) {
  for (let seed = 0; seed < SEEDS_PER_GENRE; seed++) {
    const track = composeTrack(genre, undefined, seed);
    admit(track.code, genre, track.bpm);

    // Sparser arrangements, so every complexity level is represented.
    for (const k of [2, 3, 4]) {
      const reduced = reduceToLayers(track.code, k);
      if (reduced) admit(reduced, genre, track.bpm);
    }

    // Variations, for the small-edit distribution. Every second seed, to keep
    // whole tracks the majority of the corpus.
    if (seed % 2 === 0) {
      for (const v of buildHeuristicVariations(track.code, '', 4, seed)) {
        admit(v.code, genre, track.bpm);
      }
    }
  }
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, samples.map((s) => JSON.stringify(s)).join('\n') + '\n');

// The training scripts are Python and must not restate any of this. TypeScript
// is the source of truth for the vocabulary and the architecture; these two
// files are how Python reads it, so the two halves cannot drift.
writeFileSync(
  `${OUT_DIR}/tokenizer_vocab.json`,
  JSON.stringify({ vocabSize: VOCAB_SIZE, tokens: VOCABULARY }, null, 2),
);
writeFileSync(
  `${OUT_DIR}/model_config.json`,
  JSON.stringify(toHuggingFaceConfig(), null, 2),
);

const lengths = samples.map((s) => s.tokens.length).sort((a, b) => a - b);
const pct = (p: number) => lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * p))];
const totalTokens = lengths.reduce((a, b) => a + b, 0);
const byComplexity = samples.reduce<Record<string, number>>((acc, s) => {
  acc[s.complexity] = (acc[s.complexity] ?? 0) + 1;
  return acc;
}, {});

console.log(`wrote ${OUT_FILE}`);
console.log(`  samples          ${samples.length.toLocaleString()}`);
console.log(`  genres           ${PROCEDURAL_GENRES.length} x ${SEEDS_PER_GENRE} seeds`);
console.log(`  tokens total     ${totalTokens.toLocaleString()}`);
console.log(`  tokens / sample  min ${lengths[0]}  median ${pct(0.5)}  p95 ${pct(0.95)}  max ${lengths[lengths.length - 1]}`);
console.log(`  complexity mix   ${Object.entries(byComplexity).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`  rejected         ${Object.entries(rejected).map(([k, v]) => `${k} ${v}`).join(', ')}`);

const params = parameterCount();
console.log(`\nmodel it is for`);
console.log(`  parameters       ${params.toLocaleString()}`);
console.log(`  fp16 / q4f16     ${formatBytes(estimateBytes(params, 'fp16'))} / ${formatBytes(estimateBytes(params, 'q4f16_1'))}`);
console.log(`  tokens : params  ${(totalTokens / params).toFixed(1)} : 1  (Chinchilla-optimal is about 20 : 1)`);
console.log(`\nalso wrote ${OUT_DIR}/tokenizer_vocab.json and ${OUT_DIR}/model_config.json`);

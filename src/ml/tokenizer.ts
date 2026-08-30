/**
 * A tokenizer that knows only Strudel.
 *
 * This is the load-bearing idea behind a tiny local model, so it is worth
 * stating plainly why it exists.
 *
 * At small scale the vocabulary dominates the parameter count. Qwen2.5-0.5B is
 * 945 MB — larger on disk than the 1B Llama — because its 151,936-token
 * vocabulary times 896 dimensions is roughly 28% of its parameters. Those
 * tokens are there to spell Finnish, Python, emoji and chemistry. A model whose
 * only job is to emit Strudel patterns needs none of that.
 *
 * The vocabulary here is a few hundred entries, and it is DECLARED rather than
 * learned from a corpus: it is generated from `src/audio/vocabulary.ts`, the
 * same single source of truth the audio engine and the prompts read. A token
 * that the engine cannot play cannot enter the vocabulary, so the model has no
 * way to spell `s("rhodes")` or `s("303")` — the failures that fill the session
 * traces are not merely discouraged, they are unrepresentable.
 *
 * Two properties are tested against every pattern the composer can produce:
 *
 *   COMPLETE   nothing valid encodes to <unk>
 *   INVERTIBLE decode(encode(x)) === x, exactly, byte for byte
 *
 * Without the second, a model trained on this data would be learning to
 * generate something that cannot be turned back into code.
 */

import {
  DRUM_VOICES,
  GENERIC_PERCUSSION,
  DRUM_ALIASES,
  SYNTH_VOICES,
} from '../audio/vocabulary';

/** Reserved ids. `<pad>` must be 0 so an unset tensor entry is padding. */
export const SPECIAL_TOKENS = ['<pad>', '<bos>', '<eos>', '<unk>'] as const;

/**
 * Conditioning tokens.
 *
 * The model is asked for "a techno pattern at 130 BPM, intermediate", not for a
 * sentence. Encoding that as a handful of control tokens rather than English
 * keeps both the vocabulary and the sequence short, and it is exactly what the
 * procedural composer already takes as input — so a training pair is free to
 * produce.
 *
 * Mapping free prose onto these control tokens is a separate, much smaller
 * problem than generating code, and deliberately not this model's job.
 */
/**
 * Written out rather than imported from `PROCEDURAL_GENRES`.
 *
 * Token ids are baked into a trained checkpoint: if this list were derived from
 * the composer's recipe object, adding a genre there would silently shift every
 * id after it and quietly invalidate the weights. Declaring it means a change
 * here is a deliberate act. A test asserts the two lists still agree, so they
 * cannot drift apart without something failing.
 */
export const GENRE_TOKENS = [
  'cyberpunk', 'acid', 'lofi', 'ambient', 'jungle', 'ukgarage',
  'amapiano', 'chiptune', 'koto', 'bossa', 'mathrock', 'footwork',
] as const;

/** 60–200 BPM in steps of 5. A finer grid would not survive quantisation. */
export const BPM_BUCKETS = Array.from({ length: 29 }, (_, i) => 60 + i * 5);

export const COMPLEXITY_TOKENS = ['beginner', 'intermediate', 'advanced'] as const;

/**
 * Pitch classes, kept separate from the octave digit.
 *
 * Spelling every note as one token would be 7 letters x 3 accidentals x 9
 * octaves = 189 entries, more than the rest of the vocabulary put together.
 * Splitting `eb3` into `eb` + `3` costs one extra position in the sequence and
 * saves 168 embedding rows.
 */
const PITCH_CLASSES: string[] = [];
for (const letter of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
  for (const accidental of ['', '#', 'b']) PITCH_CLASSES.push(letter + accidental);
}

/** Call and effect openers, kept whole so the model cannot half-write one. */
const CALLS = [
  'stack(',
  'sound("', 'note("', 's("', 'n("',
  '.sound("', '.s("',
  '.gain(', '.lpf(', '.hpf(', '.cutoff(', '.room(', '.delay(',
  '.decay(', '.pan(', '.fast(', '.slow(',
  '")', '"',
] as const;

/** Mini-notation and structure. */
const SYMBOLS = [
  '\n', '  ', ' ',
  ')', ',', '*', '~', '<', '>', '[', ']', '(', '?', '@', '!', '.', '_', '-', '/',
] as const;

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

const SOUND_NAMES = [
  ...DRUM_VOICES,
  ...GENERIC_PERCUSSION,
  ...Object.keys(DRUM_ALIASES),
] as const;

/**
 * Padded to a power of two, with the spare ids reserved.
 *
 * The embedding table is `VOCAB_SIZE x d_model`; leaving room means adding a
 * chord name or an effect later does not change the tensor shape, which would
 * otherwise invalidate every trained checkpoint.
 */
export const VOCAB_SIZE = 256;

function buildVocabulary(): string[] {
  const tokens: string[] = [
    ...SPECIAL_TOKENS,
    ...GENRE_TOKENS.map((g) => `<genre:${g}>`),
    ...BPM_BUCKETS.map((b) => `<bpm:${b}>`),
    ...COMPLEXITY_TOKENS.map((c) => `<complexity:${c}>`),
    ...CALLS,
    ...SYMBOLS,
    ...DIGITS,
    ...SOUND_NAMES,
    ...SYNTH_VOICES,
    ...PITCH_CLASSES,
  ];

  const seen = new Set<string>();
  const unique = tokens.filter((t) => (seen.has(t) ? false : (seen.add(t), true)));

  if (unique.length > VOCAB_SIZE) {
    throw new Error(
      `The Strudel vocabulary needs ${unique.length} tokens but VOCAB_SIZE is ${VOCAB_SIZE}. ` +
        'Raising it changes the embedding tensor shape and invalidates any trained checkpoint.',
    );
  }
  while (unique.length < VOCAB_SIZE) unique.push(`<reserved:${unique.length}>`);
  return unique;
}

export const VOCABULARY: readonly string[] = buildVocabulary();

const TOKEN_TO_ID = new Map(VOCABULARY.map((t, i) => [t, i]));

/**
 * Structural tokens carry no text: the specials, the control tokens and the
 * reserved slots.
 *
 * This has to be a precise test rather than "starts with <". `<` is itself a
 * mini-notation token — it opens a per-cycle alternation — and excluding it
 * meant `note("<c2 eb2>")` encoded its opening bracket as `<unk>` and decoded
 * back without it.
 */
function isStructuralToken(token: string): boolean {
  return /^<(?:pad|bos|eos|unk|genre:|bpm:|complexity:|reserved:)/.test(token);
}

/**
 * Matchable tokens, longest first.
 *
 * Order is the whole algorithm: `.s("` has to be tried before `.`, and
 * `shaker` before `sd`, or the encoder splits a token it had a name for.
 */
const MATCHABLE = VOCABULARY.filter((t) => !isStructuralToken(t)).sort(
  (a, b) => b.length - a.length || a.localeCompare(b),
);

export const UNK_ID = TOKEN_TO_ID.get('<unk>')!;
export const PAD_ID = TOKEN_TO_ID.get('<pad>')!;
export const BOS_ID = TOKEN_TO_ID.get('<bos>')!;
export const EOS_ID = TOKEN_TO_ID.get('<eos>')!;

export function tokenId(token: string): number | undefined {
  return TOKEN_TO_ID.get(token);
}

/** Greedy longest-match. Anything unmatched becomes a single `<unk>`. */
export function encode(text: string): number[] {
  const ids: number[] = [];
  let i = 0;

  outer: while (i < text.length) {
    for (const token of MATCHABLE) {
      if (token.length <= text.length - i && text.startsWith(token, i)) {
        ids.push(TOKEN_TO_ID.get(token)!);
        i += token.length;
        continue outer;
      }
    }
    ids.push(UNK_ID);
    i += 1;
  }
  return ids;
}

export function decode(ids: readonly number[]): string {
  let out = '';
  for (const id of ids) {
    const token = VOCABULARY[id];
    if (token === undefined) continue;
    if (isStructuralToken(token)) continue;
    out += token;
  }
  return out;
}

/** The nearest BPM bucket, so a tempo always maps to a token that exists. */
export function bpmToken(bpm: number): string {
  const clamped = Math.min(BPM_BUCKETS[BPM_BUCKETS.length - 1], Math.max(BPM_BUCKETS[0], bpm));
  const nearest = BPM_BUCKETS.reduce((a, b) =>
    Math.abs(b - clamped) < Math.abs(a - clamped) ? b : a,
  );
  return `<bpm:${nearest}>`;
}

export interface Conditioning {
  genre: string;
  bpm: number;
  complexity: 'beginner' | 'intermediate' | 'advanced';
}

/** `<bos> <genre> <bpm> <complexity> …pattern… <eos>` — one training sample. */
export function encodeSample(conditioning: Conditioning, pattern: string): number[] {
  const control = [
    `<genre:${conditioning.genre}>`,
    bpmToken(conditioning.bpm),
    `<complexity:${conditioning.complexity}>`,
  ].map((t) => {
    const id = TOKEN_TO_ID.get(t);
    if (id === undefined) throw new Error(`No control token for "${t}"`);
    return id;
  });

  return [BOS_ID, ...control, ...encode(pattern), EOS_ID];
}

/** True when every character of `text` is covered by the vocabulary. */
export function isFullyCovered(text: string): boolean {
  return !encode(text).includes(UNK_ID);
}

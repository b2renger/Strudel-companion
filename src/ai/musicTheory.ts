/**
 * Procedural music generation primitives for the offline engine.
 *
 * The rule-based generator previously held 27 hardcoded patterns — two or
 * three per genre — so it repeated itself within a few clicks and every user
 * heard the same handful of tracks. This module supplies the raw material for
 * generating fresh rhythm and harmony each time, seeded per call.
 *
 * Everything here emits only names listed in `src/audio/vocabulary.ts`.
 */

import { DRUM_VOICES } from '../audio/vocabulary';

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/** Small, fast PRNG so a seed reproduces a track exactly (mulberry32). */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

export function pickSome<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// ---------------------------------------------------------------------------
// Harmony
// ---------------------------------------------------------------------------

/** Semitone offsets from the root. */
export const SCALES = {
  minor:          { name: 'natural minor',   steps: [0, 2, 3, 5, 7, 8, 10] },
  dorian:         { name: 'Dorian',          steps: [0, 2, 3, 5, 7, 9, 10] },
  phrygian:       { name: 'Phrygian',        steps: [0, 1, 3, 5, 7, 8, 10] },
  lydian:         { name: 'Lydian',          steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian:     { name: 'Mixolydian',      steps: [0, 2, 4, 5, 7, 9, 10] },
  major:          { name: 'major',           steps: [0, 2, 4, 5, 7, 9, 11] },
  harmonicMinor:  { name: 'harmonic minor',  steps: [0, 2, 3, 5, 7, 8, 11] },
  hirajoshi:      { name: 'Hirajoshi',       steps: [0, 2, 3, 7, 8] },
  kumoi:          { name: 'Kumoi',           steps: [0, 2, 3, 7, 9] },
  pentatonicMin:  { name: 'minor pentatonic',steps: [0, 3, 5, 7, 10] },
  blues:          { name: 'blues',           steps: [0, 3, 5, 6, 7, 10] },
  wholeTone:      { name: 'whole tone',      steps: [0, 2, 4, 6, 8, 10] },
} as const;

export type ScaleKey = keyof typeof SCALES;

const NOTE_NAMES = ['c', 'c#', 'd', 'eb', 'e', 'f', 'f#', 'g', 'ab', 'a', 'bb', 'b'] as const;

/** Root pitch classes that read well and avoid awkward spellings. */
export const ROOTS = ['c', 'd', 'eb', 'f', 'g', 'a', 'bb'] as const;

function rootIndex(root: string): number {
  const i = NOTE_NAMES.indexOf(root as any);
  return i === -1 ? 0 : i;
}

/** Renders a scale degree (0-based, may exceed the scale length) as `eb3`. */
export function degreeToNote(
  root: string,
  scale: ScaleKey,
  degree: number,
  octave: number,
): string {
  const steps = SCALES[scale].steps;
  const len = steps.length;
  const octaveShift = Math.floor(degree / len);
  const semitone = rootIndex(root) + steps[((degree % len) + len) % len];
  const finalOctave = octave + octaveShift + Math.floor(semitone / 12);
  return `${NOTE_NAMES[semitone % 12]}${finalOctave}`;
}

/** A triad or seventh built on a scale degree, as a bracketed chord group. */
export function chordOnDegree(
  root: string,
  scale: ScaleKey,
  degree: number,
  octave: number,
  seventh: boolean,
): string {
  const degrees = seventh ? [0, 2, 4, 6] : [0, 2, 4];
  return `[${degrees.map((d) => degreeToNote(root, scale, degree + d, octave)).join(' ')}]`;
}

/** Common progressions as scale degrees (0 = tonic). */
export const PROGRESSIONS: number[][] = [
  [0, 5, 3, 4],
  [0, 3, 4, 4],
  [0, 4, 5, 3],
  [5, 3, 0, 4],
  [0, 6, 3, 4],
  [0, 2, 5, 4],
  [0, 0, 3, 4],
  [3, 4, 0, 5],
];

// ---------------------------------------------------------------------------
// Voice leading and chromatic harmony
// ---------------------------------------------------------------------------

/**
 * Absolute semitone for a scale degree, where 0 is C at octave 0.
 *
 * Chords are computed in absolute semitones rather than note names because
 * every interesting harmonic operation — inverting a chord, measuring how far
 * two voicings are apart, borrowing a chord from another key — is arithmetic on
 * intervals. Doing it on strings means re-parsing them at every step.
 */
export function degreeToSemitone(
  root: string,
  scale: ScaleKey,
  degree: number,
  octave: number,
): number {
  const steps = SCALES[scale].steps;
  const len = steps.length;
  const octaveShift = Math.floor(degree / len);
  return (octave + octaveShift) * 12 + rootIndex(root) + steps[((degree % len) + len) % len];
}

export function semitoneToNote(semitone: number): string {
  const octave = Math.floor(semitone / 12);
  return `${NOTE_NAMES[((semitone % 12) + 12) % 12]}${octave}`;
}

/** Distinct pitches, low to high. */
function uniqueSorted(chord: readonly number[]): number[] {
  return [...new Set(chord)].sort((a, b) => a - b);
}

/** A chord, as a bracketed mini-notation group. */
export function renderChord(semitones: readonly number[]): string {
  return `[${uniqueSorted(semitones).map(semitoneToNote).join(' ')}]`;
}

/**
 * Every inversion of a chord, plus the octave either side of it.
 *
 * Each rotation is de-duplicated. A seventh built on a five- or six-note scale
 * can already span more than an octave, and moving its lowest voice up then
 * lands exactly on a note the chord already has — which reached the editor as
 * `[c#4 f4 f4 a4]`, a wasted voice rather than a doubling anyone chose.
 */
function inversionsOf(chord: readonly number[]): number[][] {
  const sorted = uniqueSorted(chord);
  const rotations: number[][] = [];
  for (let i = 0; i < sorted.length; i++) {
    // Move the lowest i notes up an octave.
    rotations.push(uniqueSorted(sorted.map((n, j) => (j < i ? n + 12 : n))));
  }
  return rotations.flatMap((r) => [r.map((n) => n - 12), r, r.map((n) => n + 12)]);
}

/** Total semitone movement between two voicings of the same size. */
function voiceDistance(a: readonly number[], b: readonly number[]): number {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  let total = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i++) total += Math.abs(x[i] - y[i]);
  // Chords of different sizes (a triad following a seventh) still need a cost.
  total += Math.abs(x.length - y.length) * 6;
  return total;
}

/**
 * Re-voices a progression so each chord moves as little as possible from the
 * one before it.
 *
 * Root-position chords make a progression lurch: every chord restarts at its
 * own root, so ii-V-I leaps around instead of the common tones holding still
 * and one or two voices stepping. This is the difference between a progression
 * that sounds composed and one that sounds like a chord chart, and it is the
 * single most audible thing missing from the composer's harmony.
 *
 * The first chord is placed nearest `centre` so a progression does not start in
 * an arbitrary register.
 */
export function voiceLead(chords: readonly number[][], centre: number): number[][] {
  const out: number[][] = [];
  let previous: number[] | null = null;

  for (const chord of chords) {
    if (chord.length === 0) {
      out.push([]);
      continue;
    }
    const candidates = inversionsOf(chord);
    const reference =
      previous ?? Array.from({ length: chord.length }, () => centre);
    let best = candidates[0];
    let bestCost = Infinity;
    for (const candidate of candidates) {
      const cost = voiceDistance(candidate, reference);
      if (cost < bestCost) {
        bestCost = cost;
        best = candidate;
      }
    }
    out.push(best);
    previous = best;
  }
  return out;
}

export interface HarmonyOptions {
  seventh: boolean;
  /**
   * Insert a dominant chord a fifth above the NEXT chord, in place of a repeat.
   * The strongest pull in tonal music, and entirely absent from a progression
   * built only from scale degrees.
   */
  secondaryDominants: boolean;
  /**
   * Borrow bVI or bVII from the parallel mode. One chromatic chord is what
   * separates a modal loop from a modal loop that goes somewhere.
   */
  modalInterchange: boolean;
}

/**
 * Builds a progression as absolute semitones, optionally with chromatic
 * substitutions, then voice-leads the result.
 */
export function buildProgression(
  root: string,
  scale: ScaleKey,
  degrees: readonly number[],
  octave: number,
  options: HarmonyOptions,
  rng?: Rng,
): number[][] {
  const tones = options.seventh ? [0, 2, 4, 6] : [0, 2, 4];
  const tonic = degreeToSemitone(root, scale, 0, octave);

  const chords: number[][] = degrees.map((degree) =>
    tones.map((t) => degreeToSemitone(root, scale, degree + t, octave)),
  );

  if (rng) {
    for (let i = 0; i < chords.length - 1; i++) {
      // A secondary dominant only makes sense where it resolves, so it replaces
      // a chord that repeats the one after it.
      if (options.secondaryDominants && degrees[i] === degrees[i + 1] && chance(rng, 0.7)) {
        const target = degreeToSemitone(root, scale, degrees[i + 1], octave);
        const dominantRoot = target + 7;
        chords[i] = options.seventh
          ? [dominantRoot, dominantRoot + 4, dominantRoot + 7, dominantRoot + 10]
          : [dominantRoot, dominantRoot + 4, dominantRoot + 7];
      } else if (options.modalInterchange && i > 0 && chance(rng, 0.25)) {
        const borrowed = pick(rng, [8, 10]); // bVI and bVII, as major triads
        const borrowedRoot = tonic + borrowed;
        chords[i] = [borrowedRoot, borrowedRoot + 4, borrowedRoot + 7];
      }
    }
  }

  return voiceLead(chords, tonic + 12);
}

/**
 * A tension curve across a phrase, in 0..1.
 *
 * The composer previously treated every cycle as independent, so a pattern was
 * the same intensity forever. Multiplying a filter cutoff or a gain by this
 * gives a phrase an arc — a rise across the bars and a release at the end —
 * which is what makes eight bars feel like a phrase rather than a loop.
 */
export function tensionCurve(bars: number): number[] {
  return Array.from({ length: bars }, (_, i) => {
    const t = bars === 1 ? 0 : i / (bars - 1);
    // Rises to a peak at three quarters, then falls back — a shape, not a ramp.
    return Math.sin(Math.PI * Math.min(1, t / 0.75)) * 0.85 + t * 0.15;
  });
}

// ---------------------------------------------------------------------------
// Rhythm
// ---------------------------------------------------------------------------

/** Bjorklund/Euclidean rhythm as booleans — `k` onsets spread over `n` steps. */
export function euclid(k: number, n: number): boolean[] {
  if (k <= 0 || n <= 0) return new Array(Math.max(0, n)).fill(false);
  if (k >= n) return new Array(n).fill(true);
  const out: boolean[] = [];
  let bucket = 0;
  for (let i = 0; i < n; i++) {
    bucket += k;
    if (bucket >= n) {
      bucket -= n;
      out.push(true);
    } else {
      out.push(false);
    }
  }
  return out;
}

/** Renders a boolean grid as mini-notation, e.g. `bd ~ bd ~`. */
export function gridToPattern(grid: boolean[], sound: string): string {
  return grid.map((on) => (on ? sound : '~')).join(' ');
}

/** Euclidean pairs that reliably groove, by feel. */
export const EUCLID_SHAPES: Record<string, Array<[number, number]>> = {
  straight:  [[4, 8], [4, 16], [8, 16]],
  syncopated:[[3, 8], [5, 8], [5, 16], [7, 16]],
  busy:      [[7, 12], [9, 16], [11, 16]],
  sparse:    [[2, 8], [3, 16], [2, 16]],
};

/** Kick patterns by feel, as mini-notation fragments. */
export const KICK_PATTERNS: Record<string, string[]> = {
  four:      ['bd*4', 'bd ~ bd ~ bd ~ bd ~', 'bd*4'],
  broken:    ['bd ~ ~ bd ~ ~ bd ~', 'bd ~ bd ~ ~ bd ~ ~', 'bd(3,8)'],
  halftime:  ['bd ~ ~ ~ ~ ~ ~ ~', 'bd ~ ~ ~ ~ ~ bd ~'],
  breakbeat: ['bd ~ ~ bd ~ ~ ~ bd', 'bd ~ bd ~ ~ ~ bd ~'],
  garage:    ['bd ~ ~ ~ bd ~ ~ ~', 'bd ~ ~ bd ~ ~ bd ~'],
};

export const SNARE_PATTERNS: Record<string, string[]> = {
  backbeat:  ['~ sd ~ sd', '~ ~ sd ~', '~ cp ~ cp'],
  garage:    ['~ ~ sd ~ ~ sd ~ ~', '~ ~ [sd cp] ~'],
  breakbeat: ['~ ~ sd ~ ~ sd ~ sd', '~ ~ sd ~ ~ ~ sd ~'],
  sparse:    ['~ ~ ~ ~ ~ ~ sd ~', '~ ~ ~ sd'],
};

export const HAT_DENSITIES = ['hh*4', 'hh*8', 'hh*16', 'hh(5,8)', 'hh(7,16)', '[hh oh]*4'] as const;

/** Percussion colour drawn only from voices the engine implements. */
export const PERC_VOICES = DRUM_VOICES.filter((d) =>
  ['rim', 'shaker', 'cb', 'tom', 'perc', 'cr'].includes(d),
);

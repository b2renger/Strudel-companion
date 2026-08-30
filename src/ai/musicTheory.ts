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

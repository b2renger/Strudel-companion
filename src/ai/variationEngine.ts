/**
 * Rule-based performance variations, built from the pattern that is actually
 * playing.
 *
 * What was here before was a fixed list of a dozen canned transforms applied
 * with blunt regexes, and several of them did nothing at all on a real
 * pattern:
 *
 *   - `.pan("< -0.75 0.75 >")` is a QUOTED effect argument. The system prompt
 *     forbids it, the sanitiser unquotes it in model output, and this engine's
 *     `.pan()` regex only matches a bare number — so the "stereo movement"
 *     variation moved nothing.
 *   - `.delaytime(0.375)` is not implemented anywhere in the audio engine.
 *   - `c3 e3 g3` -> `c3 eb3 g3 bb3` matched a literal note run that a generated
 *     pattern essentially never contains.
 *   - The breakdown replaced a layer with a `//` comment, which is the exact
 *     same-line comment hazard removed from every other code path.
 *
 * So a click produced three impressive titles and, often, three patterns
 * identical to the one already playing.
 *
 * This module instead works on the parsed layers, offers small edits as well as
 * structural ones, and — the part that matters — DISCARDS a transform that
 * turned out to be a no-op rather than presenting it as a variation.
 */

import { AIVariation } from '../types';
import { splitTopLevelArgs } from './sanitizeCode';
import { makeRng, pick, randInt, type Rng } from './musicTheory';
import { validateStructure } from '../audio/validate';
import { DRUM_VOICES } from '../audio/vocabulary';
import { splitTopLevelSpaces } from '../audio/miniNotation';

// ---------------------------------------------------------------------------
// Layer plumbing
// ---------------------------------------------------------------------------

interface ParsedPattern {
  /** Everything up to and including `stack(`, or '' for a bare single layer. */
  head: string;
  layers: string[];
  /** The closing `)` and anything after it. */
  tail: string;
}

/** Splits a pattern into its top-level layers so a transform can touch one. */
export function splitPattern(code: string): ParsedPattern | null {
  const start = code.search(/(?:^|[^.\w])stack\s*\(/);
  if (start === -1) {
    // A bare single-layer pattern, e.g. `s("bd*4").gain(0.9)`. It has to
    // actually contain a source call: without that check ANY non-empty string
    // came back as a one-layer pattern, so prose parsed and `countChangedLayers`
    // reported a number for it instead of admitting it could not measure.
    const trimmed = code.trim();
    if (!trimmed || !/(?:^|[^.\w])(?:s|sound|note|n)\s*\(/.test(trimmed)) return null;
    return { head: '', layers: [trimmed], tail: '' };
  }

  const open = code.indexOf('(', start);
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      if (c === quote && code[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) {
      const layers = splitTopLevelArgs(code.slice(open + 1, i))
        .map((l) => l.trim())
        .filter(Boolean);
      if (layers.length === 0) return null;
      return { head: code.slice(0, open + 1), layers, tail: code.slice(i) };
    }
  }
  return null;
}

function joinPattern(p: ParsedPattern, layers: string[]): string {
  if (!p.head) return layers.join('\n');
  return `${p.head}\n  ${layers.join(',\n  ')}\n${p.tail}`;
}

/** Indices of layers whose source call is `s("...")` — the drum layers. */
function drumLayerIndices(layers: string[]): number[] {
  return layers
    .map((l, i) => (/(?:^|[^.\w])(?:s|sound)\s*\(/.test(l) && !/(?:^|[^.\w])(?:note|n)\s*\(/.test(l) ? i : -1))
    .filter((i) => i >= 0);
}

/** Indices of layers whose source call is `note("...")`. */
function noteLayerIndices(layers: string[]): number[] {
  return layers.map((l, i) => (/(?:^|[^.\w])(?:note|n)\s*\(/.test(l) ? i : -1)).filter((i) => i >= 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Adjusts a numeric effect on ONE layer, adding it when absent.
 * Returns null when nothing changed, which is what makes a no-op detectable.
 */
function adjustEffect(
  layer: string,
  effect: string,
  transform: (current: number) => number,
  fallback: number,
  clampTo: [number, number],
): { layer: string; from: number; to: number } | null {
  const re = new RegExp(`\\.${effect}\\s*\\(\\s*(-?[\\d.]+)\\s*\\)`);
  const m = re.exec(layer);
  const from = m ? parseFloat(m[1]) : fallback;
  if (!Number.isFinite(from)) return null;

  const raw = transform(from);
  const to = round2(Math.min(clampTo[1], Math.max(clampTo[0], raw)));
  if (!Number.isFinite(to) || to === round2(from)) return null;

  return {
    layer: m ? layer.replace(re, `.${effect}(${to})`) : `${layer}.${effect}(${to})`,
    from: round2(from),
    to,
  };
}

/** Replaces the Nth occurrence of `needle` inside the layer's pattern string. */
function replaceNthInPattern(
  layer: string,
  needle: RegExp,
  replacement: string,
  which: number,
): string | null {
  const stringRe = /(["'`])([^"'`]*)\1/;
  const sm = stringRe.exec(layer);
  if (!sm) return null;

  let seen = 0;
  let changed = false;
  const body = sm[2].replace(new RegExp(needle.source, 'g'), (match) => {
    if (seen++ === which) {
      changed = true;
      return replacement;
    }
    return match;
  });
  if (!changed || body === sm[2]) return null;
  return layer.replace(stringRe, `${sm[1]}${body}${sm[1]}`);
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

/**
 * How many top-level layers differ between two patterns.
 *
 * The budget check. A transform that claims to change one hi-hat and comes
 * back having rewritten five layers is not a variation of what is playing, and
 * this is how that gets caught rather than trusted.
 *
 * Returns `Infinity` when either side cannot be parsed into layers, so an
 * unmeasurable candidate fails any budget rather than passing it.
 */
export function countChangedLayers(source: string, candidate: string): number {
  const a = splitPattern(source);
  const b = splitPattern(candidate);
  if (!a || !b) return Infinity;

  const removed = Math.abs(a.layers.length - b.layers.length);
  const shorter = Math.min(a.layers.length, b.layers.length);
  let differing = 0;
  for (let i = 0; i < shorter; i++) {
    if (a.layers[i].trim() !== b.layers[i].trim()) differing++;
  }
  // A removed layer shifts everything after it, so counting positionally would
  // report the whole tail as changed. Fall back to a set comparison there.
  if (removed > 0) {
    const setA = new Set(a.layers.map((l) => l.trim()));
    const kept = b.layers.filter((l) => setA.has(l.trim())).length;
    return Math.max(a.layers.length, b.layers.length) - kept;
  }
  return differing;
}

export type VariationScale = 'micro' | 'macro';

interface Transform {
  id: string;
  scale: VariationScale;
  type: AIVariation['type'];
  /** Mood keywords this transform suits. Empty means "any". */
  moods: string[];
  apply: (p: ParsedPattern, rng: Rng) => { code: string; title: string; description: string } | null;
}

/** A tiny edit to exactly one layer. This is the point of the module. */
const MICRO: Transform[] = [
  {
    id: 'gain-nudge',
    scale: 'micro',
    type: 'chill',
    moods: [],
    apply: (p, rng) => {
      const i = randInt(rng, 0, p.layers.length - 1);
      const up = rng() > 0.5;
      const delta = 0.08 + rng() * 0.1;
      const r = adjustEffect(p.layers[i], 'gain', (g) => g + (up ? delta : -delta), 0.8, [0.15, 1.2]);
      if (!r) return null;
      const next = [...p.layers];
      next[i] = r.layer;
      return {
        code: joinPattern(p, next),
        title: up ? 'Push layer ' + (i + 1) : 'Pull back layer ' + (i + 1),
        description: `Layer ${i + 1} gain ${r.from} → ${r.to}. One level, nothing else.`,
      };
    },
  },
  {
    id: 'filter-breathe',
    scale: 'micro',
    type: 'chill',
    moods: ['acid', 'filter', 'sweep'],
    apply: (p, rng) => {
      const i = randInt(rng, 0, p.layers.length - 1);
      const open = rng() > 0.45;
      const r = adjustEffect(
        p.layers[i],
        'lpf',
        (f) => (open ? f * (1.5 + rng() * 0.5) : f * (0.5 + rng() * 0.2)),
        3000,
        [180, 16000],
      );
      if (!r) return null;
      const next = [...p.layers];
      next[i] = r.layer;
      return {
        code: joinPattern(p, next),
        title: open ? 'Crack the filter open' : 'Close the filter down',
        description: `Layer ${i + 1} low-pass ${r.from}Hz → ${r.to}Hz.`,
      };
    },
  },
  {
    id: 'ghost-step',
    scale: 'micro',
    type: 'glitch',
    moods: [],
    apply: (p, rng) => {
      const candidates = drumLayerIndices(p.layers);
      if (!candidates.length) return null;
      const i = pick(rng, candidates);
      // `?` makes one step play half the time — a ghost note.
      const drum = new RegExp(`\\b(?:${DRUM_VOICES.join('|')})\\b(?![?*(@])`);
      const occurrences = (p.layers[i].match(new RegExp(drum.source, 'g')) || []).length;
      if (occurrences === 0) return null;
      const which = randInt(rng, 0, occurrences - 1);
      const hit = drum.exec(p.layers[i].slice(0))?.[0];
      const layer = replaceNthInPattern(p.layers[i], drum, `${hit}?`, which);
      if (!layer) return null;
      const next = [...p.layers];
      next[i] = layer;
      return {
        code: joinPattern(p, next),
        title: 'Ghost one hit',
        description: `One "${hit}" now plays half the time. The groove breathes without changing.`,
      };
    },
  },
  {
    id: 'open-a-hat',
    scale: 'micro',
    type: 'glitch',
    moods: [],
    apply: (p, rng) => {
      const candidates = drumLayerIndices(p.layers).filter((i) => /\bhh\b/.test(p.layers[i]));
      if (!candidates.length) return null;
      const i = pick(rng, candidates);

      // A standalone `hh` is one hit. `hh*8` and `hh(7,16)` are EIGHT or SEVEN
      // hits behind one token — rewriting those to `oh` opens every hat in the
      // bar, which is not the tiny change this claims to be. The repeated form
      // is expanded so the last hit alone opens.
      const repeated = /\bhh\*(\d+)\b/.exec(p.layers[i]);
      if (repeated) {
        const n = Number(repeated[1]);
        if (n < 2 || n > 16) return null;
        const next = [...p.layers];
        next[i] = p.layers[i].replace(
          repeated[0],
          n === 2 ? '[hh oh]' : `[hh*${n - 1} oh]`,
        );
        return {
          code: joinPattern(p, next),
          title: 'One open hat',
          description: `The last of the ${n} hats opens. One character changed, the rest identical.`,
        };
      }

      const standalone = /\bhh\b(?![*(@?])/;
      const count = (p.layers[i].match(new RegExp(standalone.source, 'g')) || []).length;
      if (count === 0) return null;
      const layer = replaceNthInPattern(p.layers[i], standalone, 'oh', randInt(rng, 0, count - 1));
      if (!layer) return null;
      const next = [...p.layers];
      next[i] = layer;
      return {
        code: joinPattern(p, next),
        title: 'One open hat',
        description: 'A single closed hat becomes an open one. Classic lift, one hit changed.',
      };
    },
  },
  {
    id: 'flam',
    scale: 'micro',
    type: 'glitch',
    moods: [],
    apply: (p, rng) => {
      const candidates = drumLayerIndices(p.layers);
      if (!candidates.length) return null;
      const i = pick(rng, candidates);
      const drum = new RegExp(`\\b(?:${DRUM_VOICES.join('|')})\\b(?![?*(@\\]])`);
      const hit = drum.exec(p.layers[i])?.[0];
      if (!hit) return null;
      const count = (p.layers[i].match(new RegExp(drum.source, 'g')) || []).length;
      const layer = replaceNthInPattern(
        p.layers[i],
        drum,
        `[${hit} ${hit}]`,
        randInt(rng, 0, count - 1),
      );
      if (!layer) return null;
      const next = [...p.layers];
      next[i] = layer;
      return {
        code: joinPattern(p, next),
        title: 'Double one step',
        description: `One "${hit}" is subdivided into two. A stutter in a single slot.`,
      };
    },
  },
  {
    id: 'hold-a-note',
    scale: 'micro',
    type: 'harmonic',
    moods: [],
    apply: (p, rng) => {
      const candidates = noteLayerIndices(p.layers);
      if (!candidates.length) return null;
      const i = pick(rng, candidates);
      const note = /\b[a-g][#b]?\d\b(?![@?])/;
      const count = (p.layers[i].match(new RegExp(note.source, 'g')) || []).length;
      if (count < 2) return null;
      const which = randInt(rng, 0, count - 1);
      const target = (p.layers[i].match(new RegExp(note.source, 'g')) || [])[which];
      const layer = replaceNthInPattern(p.layers[i], note, `${target}@2`, which);
      if (!layer) return null;
      const next = [...p.layers];
      next[i] = layer;
      return {
        code: joinPattern(p, next),
        title: 'Let one note ring',
        description: `"${target}" is held twice as long, so the phrase leans on it.`,
      };
    },
  },
  {
    id: 'rotate-cycle',
    scale: 'micro',
    type: 'harmonic',
    moods: [],
    apply: (p, rng) => {
      const candidates = p.layers
        .map((l, i) => (/<[^>]+>/.test(l) ? i : -1))
        .filter((i) => i >= 0);
      if (!candidates.length) return null;
      const i = pick(rng, candidates);
      let rotated = false;
      const layer = p.layers[i].replace(/<([^>]+)>/, (_m, inner: string) => {
        const parts = splitTopLevelSpaces(inner);
        if (parts.length < 2) return `<${inner}>`;
        rotated = true;
        return `<${[...parts.slice(1), parts[0]].join(' ')}>`;
      });
      if (!rotated) return null;
      const next = [...p.layers];
      next[i] = layer;
      return {
        code: joinPattern(p, next),
        title: 'Start on the second chord',
        description: 'The cycling sequence is rotated by one, so the phrase lands differently.',
      };
    },
  },
  {
    id: 'a-touch-of-room',
    scale: 'micro',
    type: 'chill',
    moods: ['ambient', 'space', 'reverb', 'chill'],
    apply: (p, rng) => {
      const i = randInt(rng, 0, p.layers.length - 1);
      const r = adjustEffect(p.layers[i], 'room', (v) => v + 0.12 + rng() * 0.12, 0.2, [0, 0.9]);
      if (!r) return null;
      const next = [...p.layers];
      next[i] = r.layer;
      return {
        code: joinPattern(p, next),
        title: 'A little more air',
        description: `Layer ${i + 1} reverb ${r.from} → ${r.to}. Everything else untouched.`,
      };
    },
  },
  {
    id: 'nudge-pan',
    scale: 'micro',
    type: 'chill',
    moods: [],
    apply: (p, rng) => {
      const i = randInt(rng, 0, p.layers.length - 1);
      const dir = rng() > 0.5 ? 1 : -1;
      const r = adjustEffect(
        p.layers[i],
        'pan',
        (v) => v + dir * (0.25 + rng() * 0.3),
        0,
        [-0.9, 0.9],
      );
      if (!r) return null;
      const next = [...p.layers];
      next[i] = r.layer;
      return {
        code: joinPattern(p, next),
        title: dir > 0 ? 'Nudge one layer right' : 'Nudge one layer left',
        description: `Layer ${i + 1} pan ${r.from} → ${r.to}. Opens the stereo image a crack.`,
      };
    },
  },
  {
    id: 'tighten-decay',
    scale: 'micro',
    type: 'glitch',
    moods: [],
    apply: (p, rng) => {
      const i = randInt(rng, 0, p.layers.length - 1);
      const shorter = rng() > 0.4;
      const r = adjustEffect(
        p.layers[i],
        'decay',
        (v) => (shorter ? v * 0.55 : v * 1.7),
        0.4,
        [0.05, 2],
      );
      if (!r) return null;
      const next = [...p.layers];
      next[i] = r.layer;
      return {
        code: joinPattern(p, next),
        title: shorter ? 'Tighten one envelope' : 'Let one tail ring',
        description: `Layer ${i + 1} decay ${r.from} → ${r.to}.`,
      };
    },
  },
  {
    id: 'fill-a-rest',
    scale: 'micro',
    type: 'glitch',
    moods: [],
    apply: (p, rng) => {
      const candidates = drumLayerIndices(p.layers).filter((i) => /~/.test(p.layers[i]));
      if (!candidates.length) return null;
      const i = pick(rng, candidates);
      const filler = pick(rng, ['rim', 'shaker', 'cp?'] as const);
      const count = (p.layers[i].match(/~/g) || []).length;
      const layer = replaceNthInPattern(p.layers[i], /~/, filler, randInt(rng, 0, count - 1));
      if (!layer) return null;
      const next = [...p.layers];
      next[i] = layer;
      return {
        code: joinPattern(p, next),
        title: `Drop a ${filler.replace('?', '')} in the gap`,
        description: 'One rest becomes a quiet percussive detail.',
      };
    },
  },
  {
    id: 'mute-one',
    scale: 'micro',
    type: 'breakdown',
    moods: [],
    apply: (p, rng) => {
      // Four, not three: dropping one of three layers leaves a sketch, not a
      // variation of what is playing.
      if (p.layers.length < 4) return null;
      const i = randInt(rng, 0, p.layers.length - 1);
      const next = p.layers.filter((_, idx) => idx !== i);
      return {
        code: joinPattern(p, next),
        title: `Mute layer ${i + 1}`,
        description: 'Everything else exactly as it was. Space is a variation too.',
      };
    },
  },
  {
    id: 'swap-one-drum',
    scale: 'micro',
    type: 'glitch',
    moods: [],
    apply: (p, rng) => {
      const candidates = drumLayerIndices(p.layers);
      if (!candidates.length) return null;
      const swaps: Array<[RegExp, string]> = [
        [/\bcp\b(?![*(@?])/, 'rim'],
        [/\bsd\b(?![*(@?])/, 'cp'],
        [/\brim\b(?![*(@?])/, 'shaker'],
        [/\bshaker\b(?![*(@?])/, 'hh'],
      ];
      const i = pick(rng, candidates);
      for (const [from, to] of swaps) {
        const count = (p.layers[i].match(new RegExp(from.source, 'g')) || []).length;
        if (count === 0) continue;
        const layer = replaceNthInPattern(p.layers[i], from, to, randInt(rng, 0, count - 1));
        if (!layer) continue;
        const next = [...p.layers];
        next[i] = layer;
        return {
          code: joinPattern(p, next),
          title: `One hit becomes a ${to}`,
          description: `A single hit swaps voice. Same placement, different colour.`,
        };
      }
      return null;
    },
  },
  {
    id: 'octave-one-note',
    scale: 'micro',
    type: 'harmonic',
    moods: [],
    apply: (p, rng) => {
      const candidates = noteLayerIndices(p.layers);
      if (!candidates.length) return null;
      const i = pick(rng, candidates);
      const note = /\b([a-g][#b]?)([0-8])\b/;
      const all = p.layers[i].match(new RegExp(note.source, 'g')) || [];
      if (all.length < 2) return null;
      const which = randInt(rng, 0, all.length - 1);
      const target = all[which];
      const m = note.exec(target);
      if (!m) return null;
      const up = rng() > 0.5;
      const octave = Number(m[2]) + (up ? 1 : -1);
      if (octave < 1 || octave > 7) return null;
      const layer = replaceNthInPattern(p.layers[i], note, `${m[1]}${octave}`, which);
      if (!layer) return null;
      const next = [...p.layers];
      next[i] = layer;
      return {
        code: joinPattern(p, next),
        title: up ? 'One note an octave up' : 'One note an octave down',
        description: `"${target}" moves to "${m[1]}${octave}". One pitch, nothing else.`,
      };
    },
  },
  {
    id: 'speed-one-layer',
    scale: 'micro',
    type: 'polyrhythm',
    moods: [],
    apply: (p, rng) => {
      // `.fast(2)` / `.slow(2)` on ONE layer is the classic live move: the
      // layer pulls against the rest without anything else moving.
      const eligible = p.layers
        .map((l, i) => (/\.(fast|slow)\s*\(/.test(l) ? -1 : i))
        .filter((i) => i >= 0);
      if (eligible.length < 2) return null;
      const i = pick(rng, eligible);
      const faster = rng() > 0.4;
      const next = [...p.layers];
      next[i] = `${p.layers[i]}.${faster ? 'fast' : 'slow'}(2)`;
      return {
        code: joinPattern(p, next),
        title: faster ? `Layer ${i + 1} at double speed` : `Layer ${i + 1} at half speed`,
        description: `One layer pulls against the rest. Every other layer is untouched.`,
      };
    },
  },
];

/** Structural moves. Bigger, and still built from the live pattern. */
const MACRO: Transform[] = [
  {
    id: 'euclid-shift',
    scale: 'macro',
    type: 'polyrhythm',
    moods: ['poly', 'euclid', 'rhythm'],
    apply: (p, rng) => {
      const pairs: Array<[RegExp, string]> = [
        [/\bbd\*4\b/g, `bd(${pick(rng, [3, 5])},8)`],
        [/\bhh\*(?:8|16)\b/g, `hh(${pick(rng, [5, 7])},${pick(rng, [8, 16])})`],
        [/\bsd\*2\b/g, 'sd(2,8)'],
      ];
      let code = joinPattern(p, p.layers);
      let changed = false;
      for (const [re, to] of pairs) {
        const next = code.replace(re, to);
        if (next !== code) changed = true;
        code = next;
      }
      if (!changed) return null;
      return {
        code,
        title: 'Euclidean cross-rhythm',
        description: 'Straight subdivisions become syncopated Euclidean spreads.',
      };
    },
  },
  {
    id: 'half-time',
    scale: 'macro',
    type: 'drop',
    moods: ['half', 'heavy', 'dub'],
    apply: (p) => {
      let changed = false;
      const layers = p.layers.map((l) => {
        const next = l.replace(/\b(hh|oh|shaker)\*(\d+)\b/g, (_m, voice: string, n: string) => {
          const halved = Math.max(1, Math.floor(Number(n) / 2));
          if (halved === Number(n)) return `${voice}*${n}`;
          changed = true;
          return `${voice}*${halved}`;
        });
        return next;
      });
      if (!changed) return null;
      return {
        code: joinPattern(p, layers),
        title: 'Half-time feel',
        description: 'Hats and shakers at half the density. Same notes, twice the weight.',
      };
    },
  },
  {
    id: 'double-time',
    scale: 'macro',
    type: 'polyrhythm',
    moods: ['fast', 'jungle', 'dnb', 'break', 'energy'],
    apply: (p) => {
      let changed = false;
      const layers = p.layers.map((l) =>
        l.replace(/\b(hh|shaker)\*(\d+)\b/g, (_m, voice: string, n: string) => {
          const doubled = Math.min(16, Number(n) * 2);
          if (doubled === Number(n)) return `${voice}*${n}`;
          changed = true;
          return `${voice}*${doubled}`;
        }),
      );
      if (!changed) return null;
      return {
        code: joinPattern(p, layers),
        title: 'Double-time hats',
        description: 'Hi-hat subdivision doubled for forward momentum.',
      };
    },
  },
  {
    id: 'strip-back',
    scale: 'macro',
    type: 'breakdown',
    moods: ['ambient', 'space', 'breakdown', 'chill'],
    apply: (p) => {
      const drums = drumLayerIndices(p.layers);
      if (drums.length < 2) return null;
      // Keep the melodic layers and one drum; open the reverb on what is left.
      const keep = p.layers.filter((_, i) => !drums.slice(1).includes(i));
      const layers = keep.map((l) => {
        const r = adjustEffect(l, 'room', (v) => Math.max(v, 0.65), 0.2, [0, 0.9]);
        return r ? r.layer : l;
      });
      return {
        code: joinPattern(p, layers),
        title: 'Strip it back',
        description: 'Drums cut to one element, reverb opened on everything that remains.',
      };
    },
  },
  {
    id: 'peak',
    scale: 'macro',
    type: 'drop',
    moods: ['drop', 'energy', 'heavy', 'peak'],
    apply: (p) => {
      let changed = false;
      const layers = p.layers.map((l) => {
        const opened = adjustEffect(l, 'lpf', (f) => Math.max(f, 5000), 5200, [180, 16000]);
        const louder = adjustEffect(opened ? opened.layer : l, 'gain', (g) => Math.max(g, 0.92), 0.95, [0.15, 1.2]);
        if (opened || louder) changed = true;
        return louder ? louder.layer : opened ? opened.layer : l;
      });
      if (!changed) return null;
      return {
        code: joinPattern(p, layers),
        title: 'Peak energy',
        description: 'Filters wide open, everything pushed to the front.',
      };
    },
  },
  {
    id: 'lofi',
    scale: 'macro',
    type: 'chill',
    moods: ['lofi', 'chill', 'dusty', 'warm'],
    apply: (p) => {
      let changed = false;
      const layers = p.layers.map((l) => {
        const dulled = adjustEffect(l, 'lpf', (f) => Math.min(f, 1600), 1600, [180, 16000]);
        if (dulled) changed = true;
        return dulled ? dulled.layer : l;
      });
      if (!changed) return null;
      return {
        code: joinPattern(p, layers),
        title: 'Dusty and warm',
        description: 'Everything low-passed into a soft, tape-like haze.',
      };
    },
  },
];

const ALL = [...MICRO, ...MACRO];

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function moodMatches(t: Transform, mood: string): boolean {
  if (t.moods.length === 0) return true;
  const lower = mood.toLowerCase();
  return t.moods.some((k) => lower.includes(k));
}

/** True when the mood explicitly names what this transform does. */
function moodNamesTransform(t: Transform, mood: string): boolean {
  if (t.moods.length === 0) return false;
  const lower = mood.toLowerCase();
  return t.moods.some((k) => lower.includes(k));
}

/**
 * Builds `count` distinct variations of `currentCode`.
 *
 * Weighted toward micro edits: in a live set the useful move is usually one
 * small thing, not a wholesale replacement, and the macro transforms are the
 * ones most likely to no-op on an unusual pattern anyway.
 *
 * Every candidate is checked for being a real change and for still parsing;
 * a transform that does not apply to this pattern is dropped rather than
 * offered as a variation identical to what is already playing.
 */
export function buildHeuristicVariations(
  currentCode: string,
  mood = '',
  count = 4,
  seed = Date.now(),
): AIVariation[] {
  const parsed = splitPattern(currentCode);
  if (!parsed) return [];

  const rng = makeRng(seed >>> 0);
  const source = currentCode.trim();

  // Mood-matched transforms first, then everything else as filler, each group
  // shuffled so repeated clicks do not produce the same list.
  const preferred = ALL.filter((t) => t.moods.length > 0 && moodMatches(t, mood));
  const general = ALL.filter((t) => !preferred.includes(t));
  const shuffle = <T,>(items: T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const micro = shuffle([...preferred, ...general].filter((t) => t.scale === 'micro'));

  // Structural moves are offered ONLY when the mood asks for one by name.
  //
  // The default mood is "Dynamic & Surprising", and under it every macro used
  // to be eligible — so a click could return three patterns that had each
  // rewritten every layer. That is three different tracks, not three
  // variations of the one playing, and it is useless to somebody about to
  // switch into it mid-bar. Picking "Heavy Drops" or "Ambient Reverb" is an
  // explicit request for a big move, so there they are allowed, and even then
  // at most one per batch.
  const macro = shuffle(ALL.filter((t) => t.scale === 'macro' && moodNamesTransform(t, mood)));
  // The mood-named macro goes FIRST when there is one. Behind fifteen micro
  // transforms it would never be reached, and picking "Heavy Drops" is an
  // explicit request for a drop — so that batch is one big move plus three
  // small ones, and the default mood stays entirely small.
  const order = [...macro.slice(0, 1), ...micro];

  const out: AIVariation[] = [];
  const seenCode = new Set<string>([source]);

  for (const transform of order) {
    if (out.length >= count) break;
    let result: ReturnType<Transform['apply']> = null;
    // A transform picks a layer at random, so give it a few tries before
    // giving up on this pattern.
    for (let attempt = 0; attempt < 4 && !result; attempt++) {
      try {
        result = transform.apply(parsed, rng);
      } catch {
        result = null;
      }
    }
    if (!result) continue;

    const code = result.code.trim();
    if (seenCode.has(code)) continue;
    if (!validateStructure(code).ok) continue;

    // The budget, verified rather than trusted. A micro transform that came
    // back having touched more than one layer is not doing what its title
    // says, and a DJ variation that rewrites the pattern is not a variation.
    const touched = countChangedLayers(source, code);
    const budget = transform.scale === 'micro' ? 1 : Infinity;
    if (touched > budget) continue;

    seenCode.add(code);
    out.push({
      id: `var-${transform.id}-${seed.toString(36)}-${out.length}`,
      title: result.title,
      type: transform.type,
      description: result.description,
      code,
      createdAt: Date.now(),
    });
  }

  return out;
}

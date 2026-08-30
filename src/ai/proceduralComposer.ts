/**
 * Procedural composer for the offline "built-in pattern rules" engine.
 *
 * Replaces picking one of two or three hardcoded strings per genre. Each call
 * assembles a fresh arrangement: a root and mode, a chord progression, a kick
 * and snare feel, hat density, a bassline derived from the harmony, and effect
 * settings — all within the character of the requested genre.
 *
 * Output uses only names from `src/audio/vocabulary.ts` and only notation the
 * engine implements, so everything it emits is guaranteed to play.
 */

import {
  makeRng,
  pick,
  chance,
  randInt,
  Rng,
  SCALES,
  ScaleKey,
  ROOTS,
  degreeToNote,
  chordOnDegree,
  PROGRESSIONS,
  KICK_PATTERNS,
  SNARE_PATTERNS,
  HAT_DENSITIES,
  EUCLID_SHAPES,
  PERC_VOICES,
} from './musicTheory';

interface GenreRecipe {
  label: string;
  bpm: [number, number];
  scales: ScaleKey[];
  kick: keyof typeof KICK_PATTERNS;
  snare: keyof typeof SNARE_PATTERNS;
  hatFeel: 'straight' | 'syncopated' | 'busy' | 'sparse';
  /** Lead/pad instrument, from the implemented synth voices. */
  voice: string;
  bassOctave: number;
  chordOctave: number;
  seventhChance: number;
  lpf: [number, number];
  room: [number, number];
  delay: [number, number];
  /** Chance of adding a percussion colour layer. */
  percChance: number;
  /** Chance of a melodic top line. */
  leadChance: number;
}

const RECIPES: Record<string, GenreRecipe> = {
  cyberpunk: { label: 'Cyberpunk / Synthwave', bpm: [110, 128], scales: ['minor', 'phrygian', 'harmonicMinor'], kick: 'four', snare: 'backbeat', hatFeel: 'straight', voice: 'sawtooth', bassOctave: 1, chordOctave: 3, seventhChance: 0.4, lpf: [1200, 3400], room: [0.15, 0.4], delay: [0.15, 0.35], percChance: 0.4, leadChance: 0.6 },
  acid:      { label: 'Acid Techno',           bpm: [130, 145], scales: ['minor', 'phrygian'],                 kick: 'four', snare: 'backbeat', hatFeel: 'busy',     voice: 'sawtooth', bassOctave: 1, chordOctave: 3, seventhChance: 0.15, lpf: [500, 2600], room: [0.1, 0.3], delay: [0.1, 0.3], percChance: 0.5, leadChance: 0.35 },
  lofi:      { label: 'Lo-Fi Chillhop',        bpm: [72, 92],   scales: ['dorian', 'minor', 'major'],          kick: 'broken', snare: 'sparse', hatFeel: 'syncopated', voice: 'piano', bassOctave: 2, chordOctave: 3, seventhChance: 0.85, lpf: [900, 2200], room: [0.35, 0.7], delay: [0.2, 0.45], percChance: 0.55, leadChance: 0.35 },
  ambient:   { label: 'Ambient Drone',         bpm: [60, 80],   scales: ['lydian', 'dorian', 'wholeTone', 'major'], kick: 'halftime', snare: 'sparse', hatFeel: 'sparse', voice: 'piano', bassOctave: 2, chordOctave: 3, seventhChance: 0.9, lpf: [700, 1800], room: [0.6, 0.9], delay: [0.35, 0.6], percChance: 0.2, leadChance: 0.5 },
  jungle:    { label: 'Jungle / DnB',          bpm: [160, 174], scales: ['minor', 'phrygian', 'pentatonicMin'], kick: 'breakbeat', snare: 'breakbeat', hatFeel: 'busy', voice: 'sawtooth', bassOctave: 1, chordOctave: 3, seventhChance: 0.3, lpf: [600, 2400], room: [0.2, 0.5], delay: [0.15, 0.4], percChance: 0.6, leadChance: 0.3 },
  ukgarage:  { label: 'UK Garage',             bpm: [128, 136], scales: ['minor', 'dorian'],                   kick: 'garage', snare: 'garage', hatFeel: 'syncopated', voice: 'pluck', bassOctave: 1, chordOctave: 3, seventhChance: 0.7, lpf: [1000, 2800], room: [0.2, 0.45], delay: [0.2, 0.4], percChance: 0.6, leadChance: 0.4 },
  amapiano:  { label: 'Amapiano',              bpm: [108, 118], scales: ['minor', 'dorian'],                   kick: 'four', snare: 'sparse',  hatFeel: 'syncopated', voice: 'piano', bassOctave: 1, chordOctave: 3, seventhChance: 0.8, lpf: [900, 2400], room: [0.3, 0.6], delay: [0.2, 0.45], percChance: 0.8, leadChance: 0.4 },
  chiptune:  { label: 'Chiptune',              bpm: [130, 160], scales: ['major', 'mixolydian', 'lydian'],     kick: 'four', snare: 'backbeat', hatFeel: 'straight', voice: 'square', bassOctave: 2, chordOctave: 4, seventhChance: 0.2, lpf: [3000, 8000], room: [0.05, 0.2], delay: [0.05, 0.2], percChance: 0.3, leadChance: 0.85 },
  koto:      { label: 'Japanese Zen',          bpm: [70, 96],   scales: ['hirajoshi', 'kumoi'],                kick: 'halftime', snare: 'sparse', hatFeel: 'sparse', voice: 'pluck', bassOctave: 2, chordOctave: 4, seventhChance: 0.1, lpf: [1200, 3000], room: [0.5, 0.85], delay: [0.3, 0.55], percChance: 0.35, leadChance: 0.8 },
  bossa:     { label: 'Bossa Nova',            bpm: [118, 132], scales: ['major', 'dorian', 'mixolydian'],     kick: 'broken', snare: 'sparse', hatFeel: 'syncopated', voice: 'piano', bassOctave: 2, chordOctave: 3, seventhChance: 0.95, lpf: [1400, 3200], room: [0.25, 0.5], delay: [0.1, 0.3], percChance: 0.7, leadChance: 0.45 },
  mathrock:  { label: 'Math Rock / Polymeter', bpm: [120, 150], scales: ['lydian', 'dorian', 'major'],         kick: 'broken', snare: 'backbeat', hatFeel: 'syncopated', voice: 'pluck', bassOctave: 2, chordOctave: 3, seventhChance: 0.5, lpf: [1600, 4000], room: [0.15, 0.4], delay: [0.1, 0.3], percChance: 0.5, leadChance: 0.7 },
  footwork:  { label: 'Footwork / Juke',       bpm: [155, 165], scales: ['minor', 'pentatonicMin', 'blues'],   kick: 'broken', snare: 'breakbeat', hatFeel: 'busy', voice: 'square', bassOctave: 1, chordOctave: 3, seventhChance: 0.25, lpf: [800, 2600], room: [0.15, 0.4], delay: [0.15, 0.35], percChance: 0.7, leadChance: 0.4 },
};

export const PROCEDURAL_GENRES = Object.keys(RECIPES);

function range(rng: Rng, [lo, hi]: [number, number], decimals = 0): number {
  const v = lo + rng() * (hi - lo);
  return decimals ? Number(v.toFixed(decimals)) : Math.round(v);
}

export interface ComposedTrack {
  code: string;
  title: string;
  bpm: number;
  genreLabel: string;
  description: string;
  theory: string;
  seed: number;
}

const TITLE_ADJECTIVES = ['Neon', 'Velvet', 'Rusted', 'Midnight', 'Paper', 'Glass', 'Amber', 'Hollow', 'Electric', 'Quiet', 'Crimson', 'Distant', 'Copper', 'Salt', 'Lucid', 'Drifting'];
const TITLE_NOUNS = ['Circuit', 'Harbour', 'Cascade', 'Signal', 'Orbit', 'Lantern', 'Current', 'Meridian', 'Static', 'Garden', 'Transit', 'Ember', 'Tide', 'Corridor', 'Bloom', 'Compass'];

/**
 * Composes a complete track. Pass a seed to reproduce one exactly.
 */
export function composeTrack(
  genreKey: string,
  tempo?: number,
  seed: number = Math.floor(Math.random() * 2 ** 31),
): ComposedTrack {
  const recipe = RECIPES[genreKey] ?? RECIPES.cyberpunk;
  const rng = makeRng(seed);

  const bpm = tempo && tempo > 0 ? tempo : range(rng, recipe.bpm);
  const root = pick(rng, ROOTS);
  const scale = pick(rng, recipe.scales);
  const progression = pick(rng, PROGRESSIONS);
  const seventh = chance(rng, recipe.seventhChance);

  const lpf = range(rng, recipe.lpf);
  const room = range(rng, recipe.room, 2);
  const delay = range(rng, recipe.delay, 2);

  const lines: string[] = [];

  // --- Drums -------------------------------------------------------------
  const kick = pick(rng, KICK_PATTERNS[recipe.kick]);
  lines.push(`  s("${kick}").gain(${range(rng, [0.85, 1.0], 2)}), // TWEAK TIP: change *4 to *8 to double the kick`);

  const snare = pick(rng, SNARE_PATTERNS[recipe.snare]);
  lines.push(`  s("${snare}").gain(${range(rng, [0.7, 0.95], 2)}),`);

  const hats = chance(rng, 0.55)
    ? pick(rng, HAT_DENSITIES)
    : (() => {
        const [k, n] = pick(rng, EUCLID_SHAPES[recipe.hatFeel]);
        return `hh(${k},${n})`;
      })();
  lines.push(`  s("${hats}").gain(${range(rng, [0.45, 0.7], 2)}), // TWEAK TIP: try hh*16 for a driving feel`);

  if (chance(rng, recipe.percChance) && PERC_VOICES.length) {
    const voice = pick(rng, PERC_VOICES);
    const [k, n] = pick(rng, EUCLID_SHAPES[recipe.hatFeel]);
    lines.push(`  s("${voice}(${k},${n})").gain(${range(rng, [0.35, 0.6], 2)}),`);
  }

  // --- Bass --------------------------------------------------------------
  // Follows the progression's roots, with an occasional octave or fifth lift.
  const bassSteps = progression.map((deg) => {
    const rootNote = degreeToNote(root, scale, deg, recipe.bassOctave);
    if (chance(rng, 0.3)) {
      const lift = degreeToNote(root, scale, deg + (chance(rng, 0.5) ? 7 : 4), recipe.bassOctave);
      return `[${rootNote} ${lift}]`;
    }
    return chance(rng, 0.2) ? `${rootNote}@2` : rootNote;
  });
  lines.push(
    `  note("<${bassSteps.join(' ')}>").s("sawtooth").lpf(${Math.round(lpf * 0.55)})` +
      `.decay(${range(rng, [0.15, 0.35], 2)}).gain(${range(rng, [0.8, 1.0], 2)}),`,
  );

  // --- Harmony -----------------------------------------------------------
  const chords = progression.map((deg) => chordOnDegree(root, scale, deg, recipe.chordOctave, seventh));
  lines.push(
    `  note("<${chords.join(' ')}>").s("${recipe.voice}").lpf(${lpf})` +
      `.decay(${range(rng, [0.3, 0.8], 2)}).room(${room}).gain(${range(rng, [0.55, 0.75], 2)}),`,
  );

  // --- Melody ------------------------------------------------------------
  if (chance(rng, recipe.leadChance)) {
    const scaleLen = SCALES[scale].steps.length;
    const motif: string[] = [];
    let deg = randInt(rng, 0, scaleLen - 1);
    for (let i = 0; i < 8; i++) {
      if (chance(rng, 0.25)) {
        motif.push('~');
        continue;
      }
      deg += randInt(rng, -2, 2);
      deg = Math.max(0, Math.min(scaleLen * 2 - 1, deg));
      const note = degreeToNote(root, scale, deg, recipe.chordOctave + 1);
      motif.push(chance(rng, 0.15) ? `${note}?` : note);
    }
    lines.push(
      `  note("${motif.join(' ')}").s("${recipe.voice}").lpf(${Math.round(lpf * 1.3)})` +
        `.decay(${range(rng, [0.12, 0.3], 2)}).delay(${delay}).gain(${range(rng, [0.5, 0.7], 2)})`,
    );
  } else {
    // Trim the trailing comma from the last layer when there is no melody.
    lines[lines.length - 1] = lines[lines.length - 1].replace(/,(\s*)$/, '$1');
  }

  const title = `${pick(rng, TITLE_ADJECTIVES)} ${pick(rng, TITLE_NOUNS)}`;
  const scaleName = SCALES[scale].name;

  const code = `// ${recipe.label} — ${title} (${bpm} BPM, ${root.toUpperCase()} ${scaleName})\n` +
    `stack(\n${lines.join('\n')}\n)`;

  return {
    code,
    title,
    bpm,
    genreLabel: recipe.label,
    seed,
    description:
      `A ${recipe.label.toLowerCase()} sketch in ${root.toUpperCase()} ${scaleName} at ${bpm} BPM, ` +
      `built on a ${progression.length}-chord progression with ${seventh ? 'seventh' : 'triad'} voicings.`,
    theory:
      `Root ${root.toUpperCase()}, ${scaleName}. Degrees ${progression.map((d) => d + 1).join('–')} ` +
      `cycle once per bar. Bass follows the chord roots; the filter sits at ${lpf} Hz.`,
  };
}

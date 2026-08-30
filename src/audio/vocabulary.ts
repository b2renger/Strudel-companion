/**
 * THE single source of truth for which sound names this app can actually play.
 *
 * Why this file exists
 * --------------------
 * The AI prompt used to advertise a "rich palette" of ~12 drums and ~12 synths
 * while the audio engine implemented far fewer. Names the engine did not know
 * fell through to a generic noise burst, and names outside its drum list fell
 * through to the *melodic* path, where `noteToFrequency` failed its regex and
 * returned a default 261.63 Hz — so `s("glitch")` played a sustained middle-C
 * sawtooth. The model was being coached to reach for timbres that collapse to
 * a sawtooth on playback, which is a large part of why generated patterns
 * sounded wrong no matter which model produced them.
 *
 * Both sides now read from here: `audioEngine` builds its drum lookup from
 * `ALL_DRUM_NAMES`, and `prompts.ts` builds the model's vocabulary section
 * from `buildVocabularyPromptSection()`. Adding a voice means editing this
 * file and the matching branch in `renderDrumSound` / `renderMelodySynth` —
 * the prompt then updates itself and cannot drift again.
 */

/** Drums with their own dedicated synthesis recipe in `renderDrumSound`. */
export const DRUM_VOICES = [
  'bd',     // kick    — sine sweep + click transient
  'sd',     // snare   — tuned body + noise
  'hh',     // hihat   — short highpassed noise
  'oh',     // open hat— long highpassed noise
  'cp',     // clap    — multi-tap noise bursts
  'rim',    // rimshot — short sine ping
  'cb',     // cowbell — dual detuned squares through a bandpass
  'tom',    // tom     — pitched sine with downward sweep
  'shaker', // shaker  — short bright noise, softer than a hat
  'cr',     // crash   — long bright noise wash
] as const;

/**
 * Aliases accepted by the parser and folded onto a `DRUM_VOICES` entry.
 * Matching is `startsWith`, so these must not prefix-collide with each other.
 */
export const DRUM_ALIASES: Record<string, (typeof DRUM_VOICES)[number]> = {
  kick: 'bd',
  snare: 'sd',
  hat: 'hh',
  clap: 'cp',
  cowbell: 'cb',
  crash: 'cr',
};

/**
 * Names routed to the generic bandpassed noise burst. They are audible and
 * usable as texture, but they are NOT distinct from one another — do not
 * advertise them to the model as if they were separate instruments.
 */
export const GENERIC_PERCUSSION = ['perc'] as const;

/** Every token the engine should treat as a drum rather than a pitch. */
export const ALL_DRUM_NAMES: string[] = [
  ...DRUM_VOICES,
  ...GENERIC_PERCUSSION,
  ...Object.keys(DRUM_ALIASES),
];

/** Synth voices with genuinely distinct timbres in `renderMelodySynth`. */
export const SYNTH_VOICES = [
  'piano',    // FM chime
  'rhodes',   // FM chime, softer index — shares the piano branch
  'pluck',    // filtered decaying pluck
  'sawtooth', // dual detuned saw
  'square',
  'triangle',
  'sine',
] as const;

/**
 * Longest-first so `startsWith` cannot mis-match a shorter name inside a
 * longer one (e.g. `sawtooth` must be tested before `saw`).
 */
export const ALL_DRUM_NAMES_BY_LENGTH: string[] = [...ALL_DRUM_NAMES].sort(
  (a, b) => b.length - a.length,
);

/**
 * Returns true when a mini-notation token names a drum rather than a pitch.
 * `token` should already be lowercased and stripped of operators.
 */
export function isDrumName(token: string): boolean {
  return ALL_DRUM_NAMES_BY_LENGTH.some((name) => token.startsWith(name));
}

/**
 * The vocabulary block injected into every model prompt. Generated from the
 * lists above so it can never contradict what the engine implements.
 */
export function buildVocabularyPromptSection(): string {
  return `SOUND VOCABULARY — this is the COMPLETE list. Any name not on it will not play correctly.
- Drums (each has its own distinct voice): ${DRUM_VOICES.join(', ')}
- Aliases for the same drums: ${Object.entries(DRUM_ALIASES)
    .map(([alias, target]) => `${alias} = ${target}`)
    .join(', ')}
- Generic texture percussion (shares one noise voice, use sparingly): ${GENERIC_PERCUSSION.join(', ')}
- Synth voices (distinct timbres): ${SYNTH_VOICES.join(', ')}
NEVER invent sample names. Names such as glitch, cabasa, supersaw, marimba,
vibraphone, organ, bass, 808, 909, fm or acid are NOT supported — they produce
a wrong pitched tone instead of the intended sound. Use only the names above.`;
}

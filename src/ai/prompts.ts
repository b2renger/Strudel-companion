/**
 * System prompts and prompt templates for client-side Strudel synthesis.
 * Sized for small local models (0.5B–2B) as well as Gemini.
 *
 * Two rules govern this file:
 *
 * 1. The sound vocabulary is NOT written here. It is generated from
 *    `src/audio/vocabulary.ts`, which the audio engine also reads. Hardcoding
 *    a palette here is what previously coached models to emit `glitch`,
 *    `supersaw` and `marimba` — names the engine renders as a wrong pitched
 *    tone or a plain sawtooth.
 *
 * 2. Output contracts are FENCED CODE + LABELLED LINES, not nested JSON.
 *    Asking a 1B model for JSON with escaped newlines inside string values is
 *    close to the worst case for structured output; when such a reply is
 *    truncated, `jsonrepair` silently closes the string and hands back a
 *    half-written pattern that looks valid. A fence is ~35% cheaper in output
 *    tokens and, crucially, a truncated reply is *detectable* (no closing
 *    fence) rather than silently repaired. Engines with real constrained
 *    decoding (Gemini's `responseSchema`) use their own schema instead.
 */

import { buildVocabularyPromptSection, DRUM_VOICES, SYNTH_VOICES } from '../audio/vocabulary';

/**
 * Skill-level calibration. Ported from the Express server's prompt, which was
 * the only place in the codebase that defined what these words mean — the
 * client previously passed the bare word "Intermediate" with no definition.
 */
const COMPLEXITY_GUIDE: Record<string, string> = {
  Beginner: 'simple 2-3 layers, clear 4/4 meter, no probability or polymeter',
  Intermediate: '3-4 layers, Euclidean rhythms and filter modulation',
  Advanced: "4-6 layers, Euclidean cross-rhythms, probability '?' and deep polymeter",
};

function complexityLine(complexity: string): string {
  const guide = COMPLEXITY_GUIDE[complexity] || COMPLEXITY_GUIDE.Intermediate;
  return `${complexity || 'Intermediate'} (${guide})`;
}

export const STRUDEL_SYSTEM_PROMPT = `You are Strudel AI, an expert TidalCycles live-coding assistant.
You write short, valid, runnable Strudel patterns using mini-notation.

${buildVocabularyPromptSection()}

MINI-NOTATION:
- "bd*4"      repeat 4 times per cycle
- "bd(3,8)"   Euclidean: 3 pulses across 8 steps
- "<a b c>"   step to the next value each cycle
- "[bd sd] hh" subdivide one step
- "bd, hh*8"  play both at once
- "~"         rest
- "cp?"       50% chance
- "a@2 b"     hold twice as long

EFFECTS: .gain(0.7) .lpf(1200) .hpf(200) .room(0.5) .delay(0.25) .decay(0.4) .pan(0.3)

STRUCTURE: wrap concurrent layers in stack(...):
stack(
  s("bd*4"),
  s("~ cp ~ cp"),
  s("hh*8").gain(0.6),
  note("<c2 f2 g2 bb1>").s("sawtooth").lpf(1200)
)

MUSICAL VARIETY: vary the mode (Dorian, Phrygian, Lydian, Mixolydian, Aeolian,
Hirajoshi, harmonic minor) and the root. Vary the groove (Euclidean (5,8)/(7,16),
2-step garage skips, half-time dub, jungle breaks, bossa clave, ambient drones).
Avoid a generic 4-on-the-floor unless it is asked for.

RULES:
- Numeric effect arguments only. Write .pan(0.3), never .pan("0 1") — a quoted
  argument is parsed as a note pattern and will silence the layer.
- Never nest a function call inside an effect argument.
- Output only what the response format asks for. No preamble, no commentary.`;

/** Shared instruction for the fenced-code contract. */
const CODE_BLOCK_CONTRACT = `Reply in EXACTLY this format and nothing else:

\`\`\`strudel
stack(
  ...your pattern...
)
\`\`\`
TITLE: a short creative title
BPM: a number
GENRE: one or two words
WHY: one or two sentences on the groove and harmony
NOTE: symbol or method — what it does
NOTE: symbol or method — what it does`;

export function buildGeneratePrompt(
  prompt: string,
  style: string,
  complexity: string,
  tempo: number
): string {
  return `${STRUDEL_SYSTEM_PROMPT}

TASK: compose a Strudel pattern.
- Description: "${prompt}"
- Style: "${style || 'Electronic'}"
- Skill level: ${complexityLine(complexity)}
- BPM: ${tempo || 120}

The structure MUST genuinely reflect the ${complexity || 'Intermediate'} skill level.
Add a short inline "// TWEAK TIP:" comment on each layer telling the user which
number or symbol to change by hand and what it will do.

${CODE_BLOCK_CONTRACT}`;
}

export function buildTweakPrompt(currentCode: string, instruction: string): string {
  return `${STRUDEL_SYSTEM_PROMPT}

CURRENT PATTERN:
\`\`\`strudel
${currentCode}
\`\`\`

INSTRUCTION: "${instruction}"

Apply the instruction while keeping the pattern musical. Return the COMPLETE
updated pattern, not a fragment or a diff.

Reply in EXACTLY this format and nothing else:

\`\`\`strudel
stack(
  ...the full updated pattern...
)
\`\`\`
SUMMARY: one sentence on what changed
CHANGED: one specific edit
CHANGED: another specific edit`;
}

export function buildExplainPrompt(code: string): string {
  return `${STRUDEL_SYSTEM_PROMPT}

ANALYSE THIS PATTERN:
\`\`\`strudel
${code}
\`\`\`

Reply in EXACTLY this format and nothing else:

SUMMARY: two sentences on the groove, harmony and rhythm
LINE: s("bd*4") | Drums | four-on-the-floor kick anchoring the groove
LINE: note(...) | Bass | what this layer does
SYMBOL: * | Subdivision | repeats N times per cycle | bd*4
SYMBOL: ~ | Rest | a silent step | ~ cp ~ cp
TIP: one music-theory tip for developing this pattern

Use one LINE row per layer in the pattern, and at most three SYMBOL rows.`;
}

/**
 * One variation per call.
 *
 * Three complete patterns in a single reply needs roughly 2,100 output tokens,
 * which overruns the local models' budget every time and truncates mid-pattern.
 * The manager issues these sequentially instead.
 */
export function buildVariationPrompt(
  currentCode: string,
  mood: string,
  variationType: string,
  description: string
): string {
  return `${STRUDEL_SYSTEM_PROMPT}

CURRENT PATTERN:
\`\`\`strudel
${currentCode}
\`\`\`

TASK: create ONE performance variation of this pattern.
- Variation type: ${variationType}
- It should feel like: ${description}
- Overall mood: ${mood || 'energetic'}

Reply in EXACTLY this format and nothing else:

\`\`\`strudel
stack(
  ...the full variation...
)
\`\`\`
TITLE: a short performance name
SUMMARY: one sentence on how it differs from the original`;
}

/** The variations the copilot offers, used to drive sequential calls. */
export const VARIATION_RECIPES = [
  { type: 'drop', title: 'The Drop', description: 'peak energy — full kick, open filter, maximum drive' },
  { type: 'breakdown', title: 'The Breakdown', description: 'drums stripped back, atmospheric pads, long reverb' },
  { type: 'polyrhythm', title: 'Euclidean Shift', description: 'syncopated Euclidean cross-rhythms against the pulse' },
] as const;

export function buildFixPrompt(code: string, errorMessage: string): string {
  return `${STRUDEL_SYSTEM_PROMPT}

THIS PATTERN FAILS TO PARSE:
\`\`\`strudel
${code}
\`\`\`

ERROR: "${errorMessage}"

Fix the syntax. Change as little as possible — keep the musical intent intact.

Reply in EXACTLY this format and nothing else:

\`\`\`strudel
stack(
  ...the corrected pattern...
)
\`\`\`
SUMMARY: one sentence naming the syntax error you fixed
CHANGED: the specific correction you made`;
}

// ---------------------------------------------------------------------------
// Compact prompts for small local models
// ---------------------------------------------------------------------------

/**
 * Everything a 0.5B–2B model needs, and nothing else.
 *
 * The full system prompt is ~550 tokens of rules. Small instruct models do not
 * absorb that: they answer in prose, invent syntax, or drift from the output
 * format — which reaches the user as "the model did not return a usable
 * pattern". A short syntax card plus ONE complete worked example is
 * dramatically more effective, because it demonstrates the contract instead of
 * describing it.
 */
export const STRUDEL_SYNTAX_CARD = `Strudel is a live-coding music language. A pattern looks like:

stack(
  s("bd*4"),
  s("~ cp ~ cp"),
  s("hh*8").gain(0.6),
  note("<c2 eb2 g2 bb1>").s("sawtooth").lpf(1200)
)

RULES:
- s("...") plays drums. Allowed drums ONLY: ${DRUM_VOICES.join(' ')}
- note("...") plays pitches like c2, eb3, f#4. Add .s("...") to choose the voice.
  Allowed voices ONLY: ${SYNTH_VOICES.join(' ')}
- bd*4 = 4 times per cycle. bd(3,8) = 3 hits spread over 8 steps.
- <a b c> = one per cycle. [a b] = squeeze into one step. ~ = silence.
- Effects take NUMBERS: .gain(0.8) .lpf(1200) .room(0.4) .delay(0.25) .decay(0.3)
- Never write .pan("0 1") — a quoted effect argument breaks the layer.
- Never invent drum or voice names that are not listed above.`;

/** One complete, correctly formatted answer. Small models copy the shape. */
const GENERATE_EXAMPLE = `EXAMPLE — for "dark rolling techno at 130 bpm" you would reply EXACTLY like this:

\`\`\`strudel
stack(
  s("bd*4").gain(0.95),
  s("~ cp ~ cp").gain(0.8),
  s("hh(7,16)").gain(0.55),
  note("<c2 c2 eb2 g2>").s("sawtooth").lpf(900).decay(0.2).gain(0.9),
  note("<[c3 eb3 g3] [ab2 c3 eb3]>").s("pluck").lpf(1800).room(0.3).gain(0.6)
)
\`\`\`
TITLE: Iron Corridor
BPM: 130
GENRE: Techno
WHY: A driving four-on-the-floor with a dark C minor bass and sparse stabs.`;

export function buildCompactGeneratePrompt(
  prompt: string,
  style: string,
  complexity: string,
  tempo: number,
): string {
  return `${STRUDEL_SYNTAX_CARD}

${GENERATE_EXAMPLE}

NOW YOUR TURN.
Request: "${prompt}"
Style: ${style || 'Electronic'}
Complexity: ${complexityLine(complexity)}
BPM: ${tempo || 120}

Reply with the code block first, then TITLE, BPM, GENRE and WHY lines.
Write nothing else — no greeting, no explanation outside those lines.`;
}

export function buildCompactTweakPrompt(currentCode: string, instruction: string): string {
  return `${STRUDEL_SYNTAX_CARD}

Here is an existing pattern:
\`\`\`strudel
${currentCode}
\`\`\`

Change it so that: "${instruction}"

Reply with the COMPLETE updated pattern in a \`\`\`strudel block, then one
SUMMARY line. Write nothing else.

\`\`\`strudel
stack(
  ...the full updated pattern...
)
\`\`\`
SUMMARY: what you changed`;
}

export function buildCompactVariationPrompt(
  currentCode: string,
  variationType: string,
  description: string,
): string {
  return `${STRUDEL_SYNTAX_CARD}

Here is an existing pattern:
\`\`\`strudel
${currentCode}
\`\`\`

Rewrite it as a "${variationType}" variation — ${description}.

Reply with the COMPLETE new pattern in a \`\`\`strudel block, then one TITLE
line. Write nothing else.`;
}

/**
 * Last-resort prompt, used to retry once after a parse failure.
 *
 * Strips away every secondary instruction: no labels, no explanation, just the
 * code. A model that fumbled the multi-part format will usually manage this.
 */
export function buildRetryPrompt(prompt: string, tempo: number): string {
  return `${STRUDEL_SYNTAX_CARD}

Write a Strudel pattern for: "${prompt}" at ${tempo || 120} BPM.

Output ONLY the code, starting with stack( and ending with ). No code fence, no
title, no explanation, no other text.`;
}

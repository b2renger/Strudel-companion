/**
 * System prompts and prompt templates for client-side Strudel synthesis.
 * Sized for small local models (0.5B–2B) as well as Gemini.
 *
 * Three rules govern this file:
 *
 * 1. The sound vocabulary is NOT written here. It is generated from
 *    `src/audio/vocabulary.ts`, which the audio engine also reads. Hardcoding
 *    a palette here is what previously coached models to emit `glitch`,
 *    `supersaw` and `marimba` — names the engine renders as a wrong pitched
 *    tone or a plain sawtooth.
 *
 * 2. Every builder here returns the TASK ONLY. It does not prepend the system
 *    prompt. Each of the three engines has its own system channel — Gemini's
 *    `systemInstruction`, Nano's `initialPrompts`, web-llm's system message —
 *    and every one of them was ALSO receiving a copy embedded in the user
 *    turn. That is ~550 wasted tokens per call on the full tier and, on Gemini
 *    Nano's small window, enough to crowd out the actual request. Callers that
 *    have no system channel (a chat template without a system turn) use
 *    `withSystemPrompt()`.
 *
 * 3. Output contracts are FENCED CODE + LABELLED LINES, not nested JSON.
 *    Asking a 1B model for JSON with escaped newlines inside string values is
 *    close to the worst case for structured output; when such a reply is
 *    truncated, `jsonrepair` silently closes the string and hands back a
 *    half-written pattern that looks valid. A fence is ~35% cheaper in output
 *    tokens and, crucially, a truncated reply is *detectable* (no closing
 *    fence) rather than silently repaired. Engines with real constrained
 *    decoding (Gemini's `responseSchema`) use their own schema instead.
 */

import { buildVocabularyPromptSection, DRUM_VOICES, SYNTH_VOICES } from '../audio/vocabulary';
import { stripComments } from './sanitizeCode';

/**
 * The user's current pattern, as the model should see it.
 *
 * Comments are removed before the pattern is quoted into a prompt. The starter
 * presets and the procedural composer both write "// TWEAK TIP:" comments —
 * good for a human reading the editor, actively harmful here, because quoting
 * them shows the model the exact same-line comment form that the system prompt
 * two paragraphs earlier tells it never to use. A contradictory demonstration
 * beats a stated rule every time with a small model, and same-line comments
 * were behind every hard parse failure in the session trace.
 */
function forModel(code: string): string {
  return stripComments(code || '').code.replace(/[ \t]+$/gm, '').trim();
}

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

/**
 * The style picker's default is "All Styles", which is a UI label, not a
 * genre. It was being quoted into the prompt verbatim — the model was asked to
 * write in the style of "All Styles" while the description said Amapiano.
 */
function styleLine(style: string): string {
  const clean = (style || '').trim();
  if (!clean || /^all styles$/i.test(clean)) {
    return '- Style: take it from the description';
  }
  return `- Style: "${clean}"`;
}

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
- NEVER write comments. No "//", no "/* */", nothing. A comment on the same
  line as a layer silently deletes the rest of that line.
- s("...") is ONLY for drums. A synth voice belongs in note("...").s("voice") —
  writing s("rhodes") or s("sine") produces no sound at all.
- Numeric effect arguments only. Write .pan(0.3), never .pan("0 1") — a quoted
  argument is parsed as a note pattern and will silence the layer.
- Euclid arguments are whole numbers: bd(3,8), never bd(e,i).
- One .s(...) per layer. Never chain .s("a").s("b").
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

/**
 * Reads a tempo out of what the user actually asked for.
 *
 * The suggestion list is full of prompts that name a tempo — "138 BPM Acid
 * Techno", "at 113 BPM" — while the BPM slider sat at whatever it happened to
 * be. Clicking a suggestion set only the prompt text, so the request said 138
 * and the prompt told the model `BPM: 118`. The model dutifully echoed 118,
 * and every generation in a whole session came out at the same tempo.
 *
 * Free text works too: "make me something at 90 bpm" now means 90.
 */
export function extractBpmFromPrompt(text: string): number | null {
  if (!text) return null;
  const patterns = [
    /(\d{2,3})\s*(?:bpm|beats\s+per\s+minute)\b/i,
    /\bbpm\b\s*[:=]?\s*(\d{2,3})/i,
    // A bare "at 130". The exclusion list matters: without it "the reverb at
    // 60 percent" set the tempo to 60 and moved the user's slider for them.
    //
    // The whitespace belongs INSIDE the lookahead. Written as
    // `(\d{2,3})\s*(?!percent|…)` the engine simply backtracks `\s*` to zero
    // width, checks the space character against the alternation, finds no
    // match and happily succeeds — so the exclusion never fired at all.
    /\bat\s+(\d{2,3})\b(?!\s*(?:%|percent|per\s?cent|steps?|bars?|beats?|notes?|seconds?|secs?|ms\b|hz|khz|db|cents?|degrees?))/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 40 && n <= 240) return n;
  }
  return null;
}

export function buildGeneratePrompt(
  prompt: string,
  style: string,
  complexity: string,
  tempo: number
): string {
  return `TASK: compose a Strudel pattern.
- Description: "${prompt}"
${styleLine(style)}
- Skill level: ${complexityLine(complexity)}
- BPM: ${tempo || 120} — but if the description names a different tempo, follow
  the description and report that number on the BPM line.

The structure MUST genuinely reflect the ${complexity || 'Intermediate'} skill level.

${CODE_BLOCK_CONTRACT}`;
}

export function buildTweakPrompt(currentCode: string, instruction: string): string {
  return `CURRENT PATTERN:
\`\`\`strudel
${forModel(currentCode)}
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
  return `ANALYSE THIS PATTERN:
\`\`\`strudel
${forModel(code)}
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
  return `CURRENT PATTERN:
\`\`\`strudel
${forModel(currentCode)}
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
  return `THIS PATTERN FAILS TO PARSE:
\`\`\`strudel
${forModel(code)}
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
- Never invent drum or voice names that are not listed above.
- NEVER write a comment. No "//" anywhere.
- s("...") holds drums ONLY. s("rhodes") or s("sine") makes no sound —
  a voice goes in note("c3 e3").s("rhodes").
- Euclid takes whole numbers: hh(5,8). Never hh(e,i).
- Write ONE .s(...) per layer, never .s("a").s("b").`;

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
  return `${GENERATE_EXAMPLE}

NOW YOUR TURN.
Request: "${prompt}"
Style: ${style || 'Electronic'}
Complexity: ${complexityLine(complexity)}
BPM: ${tempo || 120}

Reply with the code block first, then TITLE, BPM, GENRE and WHY lines.
Write nothing else — no greeting, no explanation outside those lines.`;
}

export function buildCompactTweakPrompt(currentCode: string, instruction: string): string {
  return `Here is an existing pattern:
\`\`\`strudel
${forModel(currentCode)}
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
  return `Here is an existing pattern:
\`\`\`strudel
${forModel(currentCode)}
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
  return `Write a Strudel pattern for: "${prompt}" at ${tempo || 120} BPM.

Output ONLY the code, starting with stack( and ending with ). No code fence, no
title, no explanation, no other text.`;
}

// ---------------------------------------------------------------------------
// System-channel helper
// ---------------------------------------------------------------------------

/**
 * Prepends the system prompt to a task, for the one case that needs it: a chat
 * template with no system turn (Gemma 2, for example), where the rules have to
 * travel inside the user message.
 *
 * Every other caller passes the system text through its engine's own system
 * channel and the task through the builders above. Do NOT use this in addition
 * to a system message — sending both is the duplication this refactor removed.
 */
export function withSystemPrompt(task: string, tier: 'full' | 'compact'): string {
  return `${tier === 'compact' ? STRUDEL_SYNTAX_CARD : STRUDEL_SYSTEM_PROMPT}\n\n${task}`;
}

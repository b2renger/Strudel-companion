/**
 * Parser for model output.
 *
 * Design rule: THIS FILE NEVER INVENTS MUSIC.
 *
 * The previous version answered every unparseable response with a canned
 * `stack(s("bd*4"), ...)` pattern and a plausible explanation, so a user
 * could not tell a working model from a broken one — and a truncated reply
 * (which `jsonrepair` happily closes into well-formed JSON) became a
 * half-written pattern that overwrote their work. Every function here now
 * throws `AIParseError` when it cannot honestly extract a result. Callers
 * report the failure and name the engine that produced it.
 *
 * Two response shapes are supported:
 *  - Fenced code + labelled lines, which is what `prompts.ts` asks small
 *    local models for (see the rationale there).
 *  - JSON, which Gemini produces under a real `responseSchema`.
 */

import { AIGeneratedTrack, AITweakResult, AIExplanationResult, AIVariation } from '../types';
import { jsonrepair } from 'jsonrepair';
import { sanitizeGeneratedCode, stripComments, stripCommentsLenient } from './sanitizeCode';

export class AIParseError extends Error {
  /** Raw model output, kept for the dev console — never shown to the user. */
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = 'AIParseError';
    this.raw = raw;
  }
}

/**
 * From `start`, returns the substring up to the point where parentheses
 * balance — and no further.
 *
 * This is what lets us discard the chatter small models wrap around their
 * answers. Scanning to the end of the string instead meant `stack(...)\nHope
 * you like it!` came back with the prose attached, which then failed
 * validation and looked to the user like the model had produced nonsense.
 */
function balancedSlice(text: string, start: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  let opened = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(') {
      depth++;
      opened = true;
    } else if (c === ')') {
      depth--;
      if (opened && depth === 0) return text.slice(start, i + 1);
      if (depth < 0) return null;
    }
  }
  return null; // never balanced — genuinely incomplete
}

/** Longest-first so `sound(` is not matched as `s`. */
const PATTERN_START = /(?:^|\n)([ \t]*)((?:stack|sound|note|n|s)\s*\()/;

function extractFromCandidate(candidate: string, whole = candidate): string | null {
  // Comments are removed BEFORE the parentheses are counted. `balancedSlice`
  // tracks quotes but not comments, so an apostrophe in `// don't change this`
  // opened a string that never closed and swallowed the rest of the reply; a
  // `(` inside a comment threw the depth count off by one. Both were reaching
  // users as `Missing ")" — a "(" was never closed`.
  const strict = sliceFrom(stripComments(candidate).code);
  if (strict) return strict;

  // The model put the pattern and its comments on one line, so ending each
  // comment at the newline deleted the pattern. Try ending them at the next
  // layer instead. Only reached once the strict pass has failed.
  if (candidate.includes('//')) {
    const lenient = stripCommentsLenient(candidate).code;
    return sliceFrom(lenient) ?? sliceClosingComments(lenient, whole);
  }
  return null;
}

/**
 * True when the very end of `text` sits inside a `//` comment.
 *
 * String-aware, so a `//` inside a mini-notation string does not count.
 */
function endsInsideLineComment(text: string): boolean {
  let quote: string | null = null;
  let inComment = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inComment) {
      if (c === '\n') inComment = false;
      continue;
    }
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      inComment = true;
      i++;
    }
  }
  return inComment;
}

/**
 * Recovers the one case where a trailing comment swallowed the closing bracket.
 *
 * Gemini returned this verbatim, all on one line:
 *
 *   stack(s("bd ...").gain(0.8), // ... s("hh(5,8)*2")... // ... progression.)
 *
 * The final `)` is inside the last comment, so no amount of comment stripping
 * leaves a balanced expression.
 *
 * The danger is obvious and was very nearly realised: a general "close the
 * brackets" pass turns a reply cut off by the token limit into a plausible
 * half-written pattern, which is the exact failure this whole file exists to
 * prevent. An earlier version of this function guarded only on "the text
 * contained a //", and a truncated tweak reply that happened to carry one
 * comment sailed through as a complete four-layer pattern and overwrote the
 * user's work, reported as success.
 *
 * Three conditions now have to hold together, and each one alone rules the
 * truncation case out:
 *
 *   1. No unterminated code fence. A model that opened ``` and never closed it
 *      was cut off; that is a truncation signal, not a comment problem.
 *   2. The trailing comment must contain a closing bracket — the premise of
 *      the whole function is that a comment ate one.
 *   3. Nothing but whitespace after the last cleanly closed layer. If real
 *      content follows it, the reply stopped mid-layer — exactly what
 *      truncation looks like, and never what a swallowed bracket looks like,
 *      because there the only thing that followed was the comment we just
 *      removed.
 *   4. Exactly one bracket missing. Truncating back to the last clean layer
 *      leaves the outer call and nothing else open, so anything other than one
 *      means a bracket went missing mid-structure, which is not this case.
 */
function sliceClosingComments(text: string, original: string): string | null {
  // (0) the reply must actually END inside a comment. That is what "the
  //     comment ate the closing bracket" means, and it is the one thing a
  //     truncated reply can never look like: truncation stops in the middle of
  //     code, not in the middle of a trailing comment.
  if (!endsInsideLineComment(original)) return null;

  // (1) an unterminated fence means the reply was cut off.
  if ((original.match(/```/g) || []).length % 2 === 1) return null;

  // (2) the trailing comment must actually CONTAIN a closing bracket — which
  //     is the entire premise: the comment ate it. A model cut off while
  //     writing a comment also ends inside one, but its half-written sentence
  //     ("// now add the sub bass under") has no bracket in it. Without this,
  //     a truncated reply lost the very layer the user had asked for and was
  //     still reported as a successful edit.
  const lastComment = original.slice(original.lastIndexOf('//'));
  if (!lastComment.includes(')')) return null;

  const m = PATTERN_START.exec(text);
  if (!m) return null;
  const start = m.index + (m[0].length - m[2].length);

  let depth = 0;
  let quote: string | null = null;
  let lastCleanEnd = -1;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1).trim(); // balanced after all
      // Depth 1 means an argument of the outer call just closed.
      if (depth === 1) lastCleanEnd = i + 1;
    }
  }

  if (quote !== null) return null; // an unterminated string is a real failure
  if (depth !== 1) return null; // (4)
  if (lastCleanEnd === -1) return null;

  // (3) whatever follows the last complete layer must be nothing at all.
  if (text.slice(lastCleanEnd).trim() !== '') return null;

  return `${text.slice(start, lastCleanEnd).trim()})`;
}

function sliceFrom(text: string): string | null {
  const m = PATTERN_START.exec(text);
  if (!m) return null;
  const identStart = m.index + (m[0].length - m[2].length);
  const slice = balancedSlice(text, identStart);
  return slice ? slice.trim() : null;
}

/**
 * True when the text opened something it never closed — the signature of a
 * reply cut off by the token limit, as opposed to one that simply is not code.
 */
function looksTruncated(rawText: string): boolean {
  const text = stripComments(rawText).code;
  if ((text.match(/```/g) || []).length % 2 === 1) {
    // An unclosed fence alone is NOT proof: small models routinely forget the
    // closing fence on an otherwise complete answer. Only call it truncated if
    // the code inside also fails to balance.
    return extractFromCandidate(text) === null;
  }
  let depth = 0;
  for (const c of text) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
  }
  return depth > 0;
}

/**
 * Extracts the runnable pattern from whatever the model wrapped around it.
 *
 * Tries, in order: each closed fenced block, an unterminated fence, then the
 * raw text. In every case it returns only the balanced expression, so preamble
 * and trailing commentary are discarded rather than pasted into the editor.
 *
 * Deliberately does NOT fall back to "the text contains s(" — that old
 * catch-all matched almost any English sentence, and is how a raw JSON blob
 * once ended up in the user's editor as code.
 */
export function extractCodeBlock(text: string): string | null {
  if (!text) return null;

  const candidates: string[] = [];

  // Closed fences, with any language tag or none.
  for (const m of text.matchAll(/```[a-zA-Z]*[ \t]*\r?\n?([\s\S]*?)```/g)) {
    if (m[1]?.trim()) candidates.push(m[1]);
  }

  // An unterminated fence. Common, and not by itself a failure — small models
  // routinely forget the closing fence on an otherwise complete answer.
  if ((text.match(/```/g) || []).length % 2 === 1) {
    const open = text.lastIndexOf('```');
    candidates.push(text.slice(open + 3).replace(/^[a-zA-Z]*[ \t]*\r?\n?/, ''));
  }

  // Unfenced output.
  candidates.push(text);

  for (const candidate of candidates) {
    // `text`, not `candidate`: the truncation signals live in the whole reply.
    // Passing the fence-stripped candidate here hid the unterminated fence
    // that is the clearest evidence a reply was cut off.
    const found = extractFromCandidate(candidate, text);
    if (found) return found;
  }
  return null;
}

/**
 * Last gate before a pattern reaches the editor: repair it, and refuse it if
 * every layer turned out to be silent.
 *
 * A pattern whose layers all fail to produce audio used to sail through as
 * "EVALUATED OK — 3 layer(s)" and play nothing at all, which is a worse
 * outcome than an honest failure because there is no error to react to.
 */
/**
 * The code field of a schema-constrained JSON reply.
 *
 * There used to be a `|| json.code.trim()` fallback here, and it was a hole
 * the size of the one this file's header warns about. When Gemini hits
 * `maxOutputTokens` mid-string, `jsonrepair` closes the string and hands back
 * well-formed JSON whose `code` is a fragment. `extractCodeBlock` correctly
 * returned null for it — and the fallback then shipped the fragment anyway,
 * straight into the user's editor over their working pattern, reported as
 * success. `looksTruncated` was never consulted on this path at all.
 *
 * There is no fallback now. If no balanced pattern can be found in the field,
 * that is a parse failure, which is the honest answer.
 */
function codeFromJson(jsonCode: string, label: string, raw: string): string {
  const found = extractCodeBlock(jsonCode);
  if (!found) {
    throw new AIParseError(
      looksTruncated(jsonCode)
        ? 'The model ran out of room and its answer was cut off mid-pattern.'
        : 'The model did not return a usable pattern.',
      raw,
    );
  }
  return finalizeCode(found, label, raw);
}

function finalizeCode(code: string, label: string, raw: string): string {
  const result = sanitizeGeneratedCode(code, label);
  if (result.allLayersDead) {
    throw new AIParseError(
      'The model used sound names this engine cannot play, so every layer ' +
        'would have been silent.',
      raw,
    );
  }
  return result.code;
}

/** Read `LABEL: value` lines, ignoring anything inside the fenced block. */
function readLabels(text: string): Map<string, string[]> {
  const withoutCode = text.replace(/```[\s\S]*?```/g, '\n');
  const out = new Map<string, string[]>();
  for (const line of withoutCode.split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z_]{2,15}):\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1].toUpperCase();
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(m[2].trim());
  }
  return out;
}

function firstLabel(labels: Map<string, string[]>, key: string): string | undefined {
  return labels.get(key)?.[0];
}

/** Tolerant JSON extraction, used for Gemini's schema-constrained replies. */
export function extractJsonFromOutput<T = any>(text: string): T | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  const candidates: string[] = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) candidates.push(fenced[1].trim());

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(trimmed.substring(first, last + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try the repair pass below */
    }
    try {
      return JSON.parse(jsonrepair(candidate)) as T;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/** Musical tempos only. Guards against a truncated or hallucinated BPM. */
function sensibleBpm(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 40 && value <= 240 ? value : fallback;
}

const VALID_ROLES = ['Drums', 'Bass', 'Harmony', 'Melody', 'FX', 'Structure'] as const;
type Role = (typeof VALID_ROLES)[number];

function coerceRole(value: string): Role {
  const found = VALID_ROLES.find((r) => r.toLowerCase() === value.trim().toLowerCase());
  return found || 'Structure';
}

// ---------------------------------------------------------------------------
// Public parsers
// ---------------------------------------------------------------------------

export function parseGeneratedTrack(
  rawOutput: string,
  defaultPrompt = '',
  defaultGenre = 'Electronic',
  defaultBpm = 120,
): AIGeneratedTrack {
  // Gemini path: schema-constrained JSON.
  const json = extractJsonFromOutput<Partial<AIGeneratedTrack>>(rawOutput);
  if (json && typeof json.code === 'string' && json.code.trim()) {
    return {
      code: codeFromJson(json.code, 'generated track', rawOutput),
      title: json.title || 'Untitled Pattern',
      bpm: sensibleBpm(Number(json.bpm), defaultBpm),
      genre: json.genre || defaultGenre,
      explanation: json.explanation || '',
      notationBreakdown: Array.isArray(json.notationBreakdown) ? json.notationBreakdown : [],
      liveTweaks: Array.isArray(json.liveTweaks) ? json.liveTweaks : [],
    };
  }

  // Local-model path: fenced code + labels.
  const code = extractCodeBlock(rawOutput);
  if (!code) {
    throw new AIParseError(
      looksTruncated(rawOutput)
        ? 'The model ran out of room and its answer was cut off mid-pattern.'
        : 'The model did not return a usable pattern.',
      rawOutput,
    );
  }

  const labels = readLabels(rawOutput);
  const notation = (labels.get('NOTE') || [])
    .map((entry) => {
      const [symbol, ...rest] = entry.split(/\s+[—–-]\s+/);
      return { symbolOrMethod: symbol.trim(), meaning: rest.join(' - ').trim() };
    })
    .filter((n) => n.symbolOrMethod && n.meaning);

  // Range-checked, not just "finite and positive". A reply cut off mid-label
  // yields `BPM: 1`, which passed the old test and reached the engine as a
  // twelve-second cycle.
  const bpm = Number((firstLabel(labels, 'BPM') || '').replace(/[^\d.]/g, ''));
  const bpmUsable = Number.isFinite(bpm) && bpm >= 40 && bpm <= 240;

  return {
    code: finalizeCode(code, 'generated track', rawOutput),
    title: firstLabel(labels, 'TITLE') || 'Untitled Pattern',
    bpm: bpmUsable ? bpm : defaultBpm,
    genre: firstLabel(labels, 'GENRE') || defaultGenre,
    explanation:
      firstLabel(labels, 'WHY') ||
      (defaultPrompt ? `Pattern generated for "${defaultPrompt}".` : ''),
    notationBreakdown: notation,
    liveTweaks: [],
  };
}

export function parseTweakResult(rawOutput: string): AITweakResult {
  const json = extractJsonFromOutput<Partial<AITweakResult>>(rawOutput);
  if (json && typeof json.code === 'string' && json.code.trim()) {
    return {
      code: codeFromJson(json.code, 'tweaked pattern', rawOutput),
      summary: json.summary || 'Pattern updated.',
      diffHighlights: Array.isArray(json.diffHighlights) ? json.diffHighlights : [],
      liveTweaks: Array.isArray(json.liveTweaks) ? json.liveTweaks : [],
    };
  }

  const code = extractCodeBlock(rawOutput);
  if (!code) {
    throw new AIParseError(
      looksTruncated(rawOutput)
        ? 'The model ran out of room before finishing the updated pattern.'
        : 'The model did not return an updated pattern.',
      rawOutput,
    );
  }

  const labels = readLabels(rawOutput);
  return {
    code: finalizeCode(code, 'tweaked pattern', rawOutput),
    summary: firstLabel(labels, 'SUMMARY') || 'Pattern updated.',
    diffHighlights: labels.get('CHANGED') || [],
    liveTweaks: [],
  };
}

export function parseExplanationResult(rawOutput: string): AIExplanationResult {
  const json = extractJsonFromOutput<Partial<AIExplanationResult>>(rawOutput);
  if (json && (json.summary || Array.isArray(json.lineByLine))) {
    return {
      summary: json.summary || '',
      lineByLine: Array.isArray(json.lineByLine) ? json.lineByLine : [],
      miniNotationGuide: Array.isArray(json.miniNotationGuide) ? json.miniNotationGuide : [],
      musicTheoryTip: json.musicTheoryTip || '',
    };
  }

  const labels = readLabels(rawOutput);
  const summary = firstLabel(labels, 'SUMMARY');

  const lineByLine = (labels.get('LINE') || [])
    .map((entry) => {
      const parts = entry.split('|').map((p) => p.trim());
      return { line: parts[0] || '', role: coerceRole(parts[1] || ''), explanation: parts[2] || '' };
    })
    .filter((l) => l.line && l.explanation);

  const miniNotationGuide = (labels.get('SYMBOL') || [])
    .map((entry) => {
      const parts = entry.split('|').map((p) => p.trim());
      return {
        symbol: parts[0] || '',
        title: parts[1] || '',
        explanation: parts[2] || '',
        example: parts[3] || '',
      };
    })
    .filter((s) => s.symbol && s.explanation);

  if (!summary && lineByLine.length === 0) {
    throw new AIParseError('The model did not return a usable explanation.', rawOutput);
  }

  return {
    summary: summary || '',
    lineByLine,
    miniNotationGuide,
    musicTheoryTip: firstLabel(labels, 'TIP') || '',
  };
}

/** Parses ONE variation. `prompts.ts` requests them one per call. */
export function parseVariationResult(
  rawOutput: string,
  recipe: { type: string; title: string; description: string },
): AIVariation {
  const newId = () =>
    `var-${recipe.type}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  // Gemini path: schema-constrained JSON.
  const json = extractJsonFromOutput<{ code?: string; title?: string; summary?: string }>(
    rawOutput,
  );
  if (json && typeof json.code === 'string' && json.code.trim()) {
    return {
      id: newId(),
      title: json.title || recipe.title,
      type: recipe.type,
      description: json.summary || recipe.description,
      code: codeFromJson(json.code, `variation "${recipe.type}"`, rawOutput),
      createdAt: Date.now(),
    };
  }

  const code = extractCodeBlock(rawOutput);
  if (!code) {
    throw new AIParseError(
      looksTruncated(rawOutput)
        ? 'The model ran out of room before finishing the variation.'
        : 'The model did not return a usable variation.',
      rawOutput,
    );
  }

  const labels = readLabels(rawOutput);
  return {
    id: newId(),
    title: firstLabel(labels, 'TITLE') || recipe.title,
    type: recipe.type,
    description: firstLabel(labels, 'SUMMARY') || recipe.description,
    code: finalizeCode(code, `variation "${recipe.type}"`, rawOutput),
    createdAt: Date.now(),
  };
}

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

export class AIParseError extends Error {
  /** Raw model output, kept for the dev console — never shown to the user. */
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = 'AIParseError';
    this.raw = raw;
  }
}

/** A fenced block that never closed means the model was cut off mid-answer. */
function assertNotTruncated(text: string): void {
  const fences = (text.match(/```/g) || []).length;
  if (fences % 2 !== 0) {
    throw new AIParseError(
      'The model ran out of room and its answer was cut off mid-pattern.',
      text,
    );
  }
}

/**
 * Extract the runnable pattern.
 *
 * Deliberately strict. The old implementation ended with
 * `if (text.includes('s(')) return text.trim()`, which matches almost any
 * English sentence containing "s(" — that catch-all is how a raw JSON blob
 * ended up in the editor as "code".
 */
export function extractCodeBlock(text: string): string | null {
  if (!text) return null;

  const fenced = text.match(/```(?:strudel|javascript|js)?\s*\n?([\s\S]*?)```/i);
  if (fenced && fenced[1] && fenced[1].trim()) {
    return fenced[1].trim();
  }

  // Unfenced, but starting on a line that opens a real Strudel expression.
  const bare = text.match(/^[ \t]*((?:stack|s|note|n|sound)\s*\([\s\S]*)$/m);
  if (bare && bare[1]) {
    const candidate = bare[1].trim();
    // Balanced parentheses is a cheap proxy for "this is a whole expression".
    let depth = 0;
    for (const ch of candidate) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth < 0) break;
    }
    if (depth === 0) return candidate;
  }

  return null;
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
  assertNotTruncated(rawOutput);

  // Gemini path: schema-constrained JSON.
  const json = extractJsonFromOutput<Partial<AIGeneratedTrack>>(rawOutput);
  if (json && typeof json.code === 'string' && json.code.trim()) {
    return {
      code: extractCodeBlock(json.code) || json.code.trim(),
      title: json.title || 'Untitled Pattern',
      bpm: Number(json.bpm) || defaultBpm,
      genre: json.genre || defaultGenre,
      explanation: json.explanation || '',
      notationBreakdown: Array.isArray(json.notationBreakdown) ? json.notationBreakdown : [],
      liveTweaks: Array.isArray(json.liveTweaks) ? json.liveTweaks : [],
    };
  }

  // Local-model path: fenced code + labels.
  const code = extractCodeBlock(rawOutput);
  if (!code) {
    throw new AIParseError('The model did not return a usable pattern.', rawOutput);
  }

  const labels = readLabels(rawOutput);
  const notation = (labels.get('NOTE') || [])
    .map((entry) => {
      const [symbol, ...rest] = entry.split(/\s+[—–-]\s+/);
      return { symbolOrMethod: symbol.trim(), meaning: rest.join(' - ').trim() };
    })
    .filter((n) => n.symbolOrMethod && n.meaning);

  const bpm = Number((firstLabel(labels, 'BPM') || '').replace(/[^\d.]/g, ''));

  return {
    code,
    title: firstLabel(labels, 'TITLE') || 'Untitled Pattern',
    bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : defaultBpm,
    genre: firstLabel(labels, 'GENRE') || defaultGenre,
    explanation:
      firstLabel(labels, 'WHY') ||
      (defaultPrompt ? `Pattern generated for "${defaultPrompt}".` : ''),
    notationBreakdown: notation,
    liveTweaks: [],
  };
}

export function parseTweakResult(rawOutput: string): AITweakResult {
  assertNotTruncated(rawOutput);

  const json = extractJsonFromOutput<Partial<AITweakResult>>(rawOutput);
  if (json && typeof json.code === 'string' && json.code.trim()) {
    return {
      code: extractCodeBlock(json.code) || json.code.trim(),
      summary: json.summary || 'Pattern updated.',
      diffHighlights: Array.isArray(json.diffHighlights) ? json.diffHighlights : [],
      liveTweaks: Array.isArray(json.liveTweaks) ? json.liveTweaks : [],
    };
  }

  const code = extractCodeBlock(rawOutput);
  if (!code) {
    throw new AIParseError('The model did not return an updated pattern.', rawOutput);
  }

  const labels = readLabels(rawOutput);
  return {
    code,
    summary: firstLabel(labels, 'SUMMARY') || 'Pattern updated.',
    diffHighlights: labels.get('CHANGED') || [],
    liveTweaks: [],
  };
}

export function parseExplanationResult(rawOutput: string): AIExplanationResult {
  assertNotTruncated(rawOutput);

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
  assertNotTruncated(rawOutput);

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
      code: extractCodeBlock(json.code) || json.code.trim(),
      createdAt: Date.now(),
    };
  }

  const code = extractCodeBlock(rawOutput);
  if (!code) {
    throw new AIParseError('The model did not return a usable variation.', rawOutput);
  }

  const labels = readLabels(rawOutput);
  return {
    id: newId(),
    title: firstLabel(labels, 'TITLE') || recipe.title,
    type: recipe.type,
    description: firstLabel(labels, 'SUMMARY') || recipe.description,
    code,
    createdAt: Date.now(),
  };
}

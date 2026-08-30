/**
 * Output parser for client-side LLM outputs.
 * Extracts clean JSON and code blocks with fallbacks.
 */

import { AIGeneratedTrack, AITweakResult, AIExplanationResult, AIVariation } from '../types';
import { jsonrepair } from 'jsonrepair';

/**
 * Extract clean JSON or markdown code block from raw LLM output string.
 */
export function extractJsonFromOutput<T = any>(text: string): T | null {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim();

  // 1. Direct JSON parse
  try {
    return JSON.parse(trimmed) as T;
  } catch (e) {
    // Continue
  }

  try {
    return JSON.parse(jsonrepair(trimmed)) as T;
  } catch (e) {}

  // 2. Parse inside ```json ... ``` or ``` ... ``` block
  const markdownJsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (markdownJsonMatch && markdownJsonMatch[1]) {
    try {
      return JSON.parse(markdownJsonMatch[1].trim()) as T;
    } catch (e) {
      try {
        return JSON.parse(jsonrepair(markdownJsonMatch[1].trim())) as T;
      } catch (e) {}
    }
  }

  // 3. Find outermost curly braces { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch (e) {
      try {
        return JSON.parse(jsonrepair(candidate)) as T;
      } catch (e) {}
    }
  }

  return null;
}

/**
 * Extract raw runnable code block from text.
 */
export function extractCodeBlock(text: string): string {
  if (!text) return '';

  const codeBlockMatch = text.match(/```(?:javascript|js|strudel)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  // If starts with stack( or s( or note(
  if (text.includes('stack(') || text.includes('s(') || text.includes('note(')) {
    return text.trim();
  }

  return text.trim();
}

/**
 * Normalize and validate generated track.
 */
export function parseGeneratedTrack(rawOutput: string, defaultPrompt: string = '', defaultGenre: string = 'Electronic'): AIGeneratedTrack {
  const json = extractJsonFromOutput<Partial<AIGeneratedTrack>>(rawOutput);

  if (json && json.code) {
    return {
      code: extractCodeBlock(json.code),
      title: json.title || 'Algorithmic Track',
      bpm: Number(json.bpm) || 120,
      genre: json.genre || defaultGenre,
      explanation: json.explanation || `Algorithmic synthesis generated for "${defaultPrompt}".`,
      notationBreakdown: Array.isArray(json.notationBreakdown) ? json.notationBreakdown : [],
      liveTweaks: Array.isArray(json.liveTweaks) ? json.liveTweaks : [],
    };
  }

  // Fallback: extract code from raw text
  const extractedCode = extractCodeBlock(rawOutput);
  return {
    code: extractedCode || `// Generated Pattern\nstack(\n  s("bd*4"),\n  s("~ cp ~ cp"),\n  s("hh*8").gain(0.6)\n)`,
    title: 'Algorithmic Live Pattern',
    bpm: 120,
    genre: defaultGenre,
    explanation: `Generated pattern based on prompt: ${defaultPrompt}`,
    notationBreakdown: [
      { symbolOrMethod: 'stack(...)', meaning: 'Concurrent polyphonic layers' },
      { symbolOrMethod: 's("bd*4")', meaning: '4-on-the-floor kick' },
    ],
    liveTweaks: [],
  };
}

/**
 * Normalize and validate tweak result.
 */
export function parseTweakResult(rawOutput: string, originalCode: string): AITweakResult {
  const json = extractJsonFromOutput<Partial<AITweakResult>>(rawOutput);

  if (json && json.code) {
    return {
      code: extractCodeBlock(json.code),
      summary: json.summary || 'Updated pattern with live modifications.',
      diffHighlights: Array.isArray(json.diffHighlights) ? json.diffHighlights : ['Modified arrangement'],
      liveTweaks: Array.isArray(json.liveTweaks) ? json.liveTweaks : [],
    };
  }

  const extractedCode = extractCodeBlock(rawOutput);
  return {
    code: extractedCode || originalCode,
    summary: 'Adjusted pattern code based on instruction.',
    diffHighlights: ['Pattern updated live'],
    liveTweaks: [],
  };
}

/**
 * Normalize and validate explanation result.
 */
export function parseExplanationResult(rawOutput: string): AIExplanationResult {
  const json = extractJsonFromOutput<Partial<AIExplanationResult>>(rawOutput);

  if (json && (json.summary || json.lineByLine)) {
    return {
      summary: json.summary || 'Algorithmic Strudel composition analysis.',
      lineByLine: Array.isArray(json.lineByLine) ? json.lineByLine : [],
      miniNotationGuide: Array.isArray(json.miniNotationGuide) ? json.miniNotationGuide : [],
      musicTheoryTip: json.musicTheoryTip || 'Explore modal interchange and Euclidean rhythms to evolve this pattern.',
    };
  }

  return {
    summary: 'Algorithmic composition utilizing Strudel mini-notation syntax.',
    lineByLine: [
      { line: 'stack(...)', role: 'Structure', explanation: 'Combines multiple rhythmic layers together' },
    ],
    miniNotationGuide: [
      { symbol: '*', title: 'Multiplication', explanation: 'Repeats pattern N times per cycle', example: 'bd*4' },
      { symbol: '~', title: 'Rest', explanation: 'Silent musical pause', example: '~ cp ~ cp' },
    ],
    musicTheoryTip: 'Try applying .lpf(cutoff) and .room(reverb) modulation for atmospheric depth.',
  };
}

/**
 * Normalize and validate variations result.
 */
export function parseVariationsResult(rawOutput: string, baseCode: string): { variations: AIVariation[] } {
  const json = extractJsonFromOutput<{ variations: AIVariation[] }>(rawOutput);

  if (json && Array.isArray(json.variations) && json.variations.length > 0) {
    return {
      variations: json.variations.map((v) => ({
        id: v.id || 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        title: v.title || 'Live Variation',
        type: v.type || 'drop',
        description: v.description || 'Dynamic transformation',
        code: extractCodeBlock(v.code),
        createdAt: Date.now(),
      })),
    };
  }

  // Heuristic variations fallback
  return {
    variations: [
      {
        id: 'var-peak-drop',
        title: 'The Drop (Peak Energy)',
        type: 'drop',
        description: 'Pumping four-on-the-floor kick with wide open synth filter.',
        code: `// The Drop\nstack(\n  s("bd*4"),\n  s("hh*16").gain(0.6),\n  s("~ cp ~ cp").gain(0.85),\n  note("<c2 f2 g2 bb1>").s("sawtooth").lpf(3200).decay(0.25).gain(0.9)\n)`,
        createdAt: Date.now(),
      },
      {
        id: 'var-ambient-break',
        title: 'Atmospheric Breakdown',
        type: 'breakdown',
        description: 'Drums muted, spacious delay and reverb wash.',
        code: `// Atmospheric Breakdown\nstack(\n  s("~ hh ~ hh").gain(0.35),\n  note("<[c3 e3 g3 b3] [f3 a3 c4 e4]>").s("piano").decay(0.8).room(0.7).delay(0.5).gain(0.8)\n)`,
        createdAt: Date.now(),
      },
    ],
  };
}

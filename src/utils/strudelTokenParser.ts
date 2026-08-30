export type TokenType =
  | 'sample'
  | 'synth'
  | 'note'
  | 'subdivision'
  | 'euclidean'
  | 'rest'
  | 'method'
  | 'param'
  | 'chord'
  | 'bracket'
  | 'cycle_bracket'
  | 'probability'
  | 'bank'
  | 'unknown';

export type TokenCategory =
  | 'drum_kick'
  | 'drum_snare'
  | 'drum_hat'
  | 'drum_perc'
  | 'synth_voice'
  | 'note_pitch'
  | 'chord_cluster'
  | 'cycle_progression'
  | 'euclidean_rhythm'
  | 'speed_multiplier'
  | 'slow_divisor'
  | 'rest_silence'
  | 'probability_chance'
  | 'effect_lpf'
  | 'effect_hpf'
  | 'effect_lpq'
  | 'effect_decay'
  | 'effect_attack'
  | 'effect_sustain'
  | 'effect_release'
  | 'effect_room'
  | 'effect_delay'
  | 'effect_delaytime'
  | 'effect_delayfeedback'
  | 'effect_gain'
  | 'effect_velocity'
  | 'effect_pan'
  | 'effect_distort'
  | 'effect_crush'
  | 'effect_fast'
  | 'effect_slow'
  | 'effect_bank'
  | 'effect_method'
  | 'general';

export interface StrudelToken {
  id: string;
  type: TokenType;
  category: TokenCategory;
  value: string;
  raw: string;
  startIndex: number;
  endIndex: number;
  line: number;
  layerIndex: number;
  context: {
    layerRole?: 'drums' | 'bass' | 'chords' | 'melody' | 'synth' | 'fx' | 'other';
    parentMethod?: string;
    description?: string;
    matchedParamName?: string;
    chordGroup?: string;
    cycleGroup?: string;
  };
}

export interface ParsedCodeLayer {
  id: string;
  layerIndex: number;
  fullText: string;
  lineStart: number;
  lineEnd: number;
  role: 'drums' | 'bass' | 'chords' | 'melody' | 'synth' | 'fx' | 'other';
  soundSource?: string;
  tokens: StrudelToken[];
}

export interface ParseResult {
  layers: ParsedCodeLayer[];
  allTokens: StrudelToken[];
}

// Known sample sound categories
const KICK_SAMPLES = new Set(['bd', 'kick', '808bd', '909bd', 'bassdrum']);
const SNARE_SAMPLES = new Set(['sd', 'snare', 'cp', 'rim', 'clap', '808sd', '909sd', '808']);
const HAT_SAMPLES = new Set(['hh', 'oh', 'cr', 'ride', 'shaker', 'cabasa', 'hat']);
const PERC_SAMPLES = new Set([
  'tom', 'lt', 'mt', 'ht', 'perc', 'glitch', 'laser', 'noise', 'wood',
  'cb', 'cowbell', 'tabla', 'conga', 'bongo', 'agogo', 'click', 'beep'
]);

// Synthesizer waveforms & synth sound voices
const SYNTH_VOICES = new Set([
  'sawtooth', 'square', 'sine', 'triangle', 'supersaw', 'pluck', 'piano',
  'vibraphone', 'marimba', 'strings', 'organ', 'pad', 'lead', 'casio',
  'fm', 'pwm', 'pulse', 'sub', 'acid', 'brass', 'synth'
]);

// Note regex (e.g., c2, c#3, eb4, f#2, ab3, bb4, etc.)
// Also matches chord shorthand like c3m, c3maj, a2m7, etc. if written as single token
const NOTE_REGEX = /^([a-gA-G][b#]?[0-8](?:maj|min|m|M|dim|aug|sus2|sus4|7|maj7|m7|9)?)$/;

/**
 * Classify a sound or note string into a precise TokenCategory
 */
function classifyWordToken(word: string, isNoteContext: boolean): { type: TokenType; category: TokenCategory } {
  const cleanWord = word.split(':')[0].toLowerCase();

  // If in note() pattern or matches pitch regex
  if (isNoteContext || NOTE_REGEX.test(word) || NOTE_REGEX.test(cleanWord)) {
    return { type: 'note', category: 'note_pitch' };
  }

  // Synthesizers
  if (SYNTH_VOICES.has(cleanWord)) {
    return { type: 'synth', category: 'synth_voice' };
  }

  // Drums & Samples
  if (KICK_SAMPLES.has(cleanWord)) {
    return { type: 'sample', category: 'drum_kick' };
  }
  if (SNARE_SAMPLES.has(cleanWord)) {
    return { type: 'sample', category: 'drum_snare' };
  }
  if (HAT_SAMPLES.has(cleanWord)) {
    return { type: 'sample', category: 'drum_hat' };
  }
  if (PERC_SAMPLES.has(cleanWord)) {
    return { type: 'sample', category: 'drum_perc' };
  }

  return { type: isNoteContext ? 'note' : 'sample', category: isNoteContext ? 'note_pitch' : 'drum_perc' };
}

/**
 * Classify an effect parameter based on method name
 */
function classifyParamToken(methodName: string): TokenCategory {
  const m = methodName.toLowerCase();
  if (m === 'lpf' || m === 'cutoff') return 'effect_lpf';
  if (m === 'hpf') return 'effect_hpf';
  if (m === 'lpq' || m === 'resonance') return 'effect_lpq';
  if (m === 'decay') return 'effect_decay';
  if (m === 'attack') return 'effect_attack';
  if (m === 'sustain') return 'effect_sustain';
  if (m === 'release') return 'effect_release';
  if (m === 'room' || m === 'roomsize') return 'effect_room';
  if (m === 'delay') return 'effect_delay';
  if (m === 'delaytime') return 'effect_delaytime';
  if (m === 'delayfeedback') return 'effect_delayfeedback';
  if (m === 'gain') return 'effect_gain';
  if (m === 'velocity') return 'effect_velocity';
  if (m === 'pan') return 'effect_pan';
  if (m === 'distort') return 'effect_distort';
  if (m === 'crush') return 'effect_crush';
  if (m === 'fast') return 'effect_fast';
  if (m === 'slow') return 'effect_slow';
  if (m === 'bank') return 'effect_bank';
  return 'general';
}

/**
 * Tokenize a mini-notation string inside s("...") or note("...").
 * Crucially: treats brackets [ ... ] and angle brackets < ... > as structural groupings,
 * while tokenizing every individual note, synth, sound, and subdivision inside them individually!
 */
function parseMiniNotationString(
  patternStr: string,
  baseOffset: number,
  lineNum: number,
  layerIndex: number,
  isNoteContext: boolean,
  role: 'drums' | 'bass' | 'chords' | 'melody' | 'synth' | 'fx' | 'other'
): StrudelToken[] {
  const tokens: StrudelToken[] = [];
  let i = 0;

  while (i < patternStr.length) {
    const char = patternStr[i];

    // Skip whitespace
    if (char === ' ' || char === '\t' || char === '\n') {
      i++;
      continue;
    }

    // Comma separator for polyphony
    if (char === ',') {
      tokens.push({
        id: `tok-${baseOffset + i}`,
        type: 'probability',
        category: 'probability_chance',
        value: ',',
        raw: ',',
        startIndex: baseOffset + i,
        endIndex: baseOffset + i + 1,
        line: lineNum,
        layerIndex,
        context: { layerRole: role, description: 'Parallel polyphonic step delimiter (,)' },
      });
      i++;
      continue;
    }

    // Rest symbol ~
    if (char === '~') {
      tokens.push({
        id: `tok-${baseOffset + i}`,
        type: 'rest',
        category: 'rest_silence',
        value: '~',
        raw: '~',
        startIndex: baseOffset + i,
        endIndex: baseOffset + i + 1,
        line: lineNum,
        layerIndex,
        context: { layerRole: role, description: 'Silent rest step (~)' },
      });
      i++;
      continue;
    }

    // Random choice / probability ? or |
    if (char === '?' || char === '|') {
      tokens.push({
        id: `tok-${baseOffset + i}`,
        type: 'probability',
        category: 'probability_chance',
        value: char,
        raw: char,
        startIndex: baseOffset + i,
        endIndex: baseOffset + i + 1,
        line: lineNum,
        layerIndex,
        context: {
          layerRole: role,
          description: char === '?' ? '50% probability chance (?)' : 'Random alternative choice (|)',
        },
      });
      i++;
      continue;
    }

    // Euclidean rhythm (k, n) e.g., (3,8) or (5,8) or (3,8,1)
    if (char === '(') {
      const closeParen = patternStr.indexOf(')', i);
      if (closeParen !== -1) {
        const euclidContent = patternStr.substring(i, closeParen + 1);
        if (/^\(\s*\d+\s*,\s*\d+\s*(?:,\s*\d+\s*)?\)$/.test(euclidContent)) {
          tokens.push({
            id: `tok-${baseOffset + i}`,
            type: 'euclidean',
            category: 'euclidean_rhythm',
            value: euclidContent,
            raw: euclidContent,
            startIndex: baseOffset + i,
            endIndex: baseOffset + closeParen + 1,
            line: lineNum,
            layerIndex,
            context: {
              layerRole: role,
              description: `Euclidean rhythm pattern: ${euclidContent}`,
            },
          });
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Subdivisions or multipliers: *4, *8, /2, @2
    if (char === '*' || char === '/' || char === '@') {
      let j = i + 1;
      while (j < patternStr.length && /[0-9.]/.test(patternStr[j])) {
        j++;
      }
      const rawSub = patternStr.substring(i, j);
      const isSlow = char === '/';
      tokens.push({
        id: `tok-${baseOffset + i}`,
        type: 'subdivision',
        category: isSlow ? 'slow_divisor' : 'speed_multiplier',
        value: rawSub,
        raw: rawSub,
        startIndex: baseOffset + i,
        endIndex: baseOffset + j,
        line: lineNum,
        layerIndex,
        context: {
          layerRole: role,
          description: isSlow ? `Speed divisor / slow step: ${rawSub}` : `Speed multiplier / subdivision: ${rawSub}`,
        },
      });
      i = j;
      continue;
    }

    // Structural bracket tokens [ or ] (allows individual notes inside to be parsed as single tokens)
    if (char === '[' || char === ']') {
      i++;
      continue;
    }

    // Structural angle bracket tokens < or >
    if (char === '<' || char === '>') {
      i++;
      continue;
    }

    // Word tokens: notes (c2, eb3, g4), synths (sawtooth, square, sine), drums (bd, sd, hh), etc.
    if (/[a-zA-Z0-9_#:]/.test(char)) {
      let j = i;
      while (j < patternStr.length && /[a-zA-Z0-9_#:]/.test(patternStr[j])) {
        j++;
      }
      const rawWord = patternStr.substring(i, j);
      const { type: tokenType, category: tokenCategory } = classifyWordToken(rawWord, isNoteContext);

      tokens.push({
        id: `tok-${baseOffset + i}`,
        type: tokenType,
        category: tokenCategory,
        value: rawWord,
        raw: rawWord,
        startIndex: baseOffset + i,
        endIndex: baseOffset + j,
        line: lineNum,
        layerIndex,
        context: {
          layerRole: role,
          description:
            tokenType === 'synth'
              ? `Synthesizer Voice: ${rawWord}`
              : tokenType === 'note'
              ? `Musical Pitch / Note: ${rawWord}`
              : `Sample / Drum Sound: ${rawWord}`,
        },
      });
      i = j;
      continue;
    }

    // Other characters: step forward
    i++;
  }

  return tokens;
}

/**
 * Main parser that parses complete Strudel JavaScript code into layers and interactive tokens
 */
export function parseStrudelCodeToTokens(code: string): ParseResult {
  const layers: ParsedCodeLayer[] = [];
  const allTokens: StrudelToken[] = [];

  if (!code || !code.trim()) {
    return { layers: [], allTokens: [] };
  }

  // Extract individual track layers inside stack(...) or root statements
  const layerRegex = /(s|note)\(\s*(["'`])([\s\S]*?)\2\s*\)([\s\S]*?)(?=(?:,\s*(?:s|note)\()|(?:\)\s*;?\s*$)|\n\s*(?:s|note)\(|$)/g;

  let match: RegExpExecArray | null;
  let layerIdx = 0;

  while ((match = layerRegex.exec(code)) !== null) {
    const fullMatch = match[0];
    const matchStart = match.index;
    const methodType = match[1]; // 's' or 'note'
    const patternContent = match[3]; // the string inside quotes
    const quoteChar = match[2];
    const patternStrOffset = matchStart + fullMatch.indexOf(quoteChar) + 1;
    const restOfChain = match[4]; // chained effects like .lpf(1200).decay(0.3)

    // Calculate line numbers
    const linesBefore = code.substring(0, matchStart).split('\n').length;
    const linesInMatch = fullMatch.split('\n').length;

    // Detect layer musical role
    let role: 'drums' | 'bass' | 'chords' | 'melody' | 'synth' | 'fx' | 'other' = 'other';
    const lowerContent = patternContent.toLowerCase();
    const lowerChain = restOfChain.toLowerCase();

    // Check if synth voice is present
    const hasSynth = Array.from(SYNTH_VOICES).some((sv) => lowerContent.includes(sv) || lowerChain.includes(sv));

    if (hasSynth) {
      role = 'synth';
    } else if (methodType === 's') {
      if (
        lowerContent.includes('bd') ||
        lowerContent.includes('sd') ||
        lowerContent.includes('hh') ||
        lowerContent.includes('cp') ||
        lowerContent.includes('rim') ||
        lowerContent.includes('cb')
      ) {
        role = 'drums';
      } else if (lowerContent.includes('bass') || lowerChain.includes('lpf(400)') || lowerChain.includes('lpf(600)')) {
        role = 'bass';
      } else {
        role = 'drums';
      }
    } else {
      // note(...)
      if (lowerContent.includes('1') || lowerContent.includes('2') || lowerChain.includes('bass')) {
        role = 'bass';
      } else if (lowerContent.includes('[') && lowerContent.includes(']')) {
        role = 'chords';
      } else if (lowerContent.includes('<') && lowerContent.includes('>')) {
        role = 'melody';
      } else {
        role = 'melody';
      }
    }

    const layerTokens: StrudelToken[] = [];

    // 1. Parse tokens inside the mini-notation pattern
    const patternTokens = parseMiniNotationString(
      patternContent,
      patternStrOffset,
      linesBefore,
      layerIdx,
      methodType === 'note',
      role
    );
    layerTokens.push(...patternTokens);

    // 2. Parse method chains and parameters in restOfChain (e.g. .lpf(1200).gain(0.8).sound("sawtooth"))
    const effectRegex = /\.([a-zA-Z0-9_]+)\(\s*([^)]*)\s*\)/g;
    let effMatch: RegExpExecArray | null;
    const chainBaseOffset = matchStart + fullMatch.indexOf(restOfChain);

    while ((effMatch = effectRegex.exec(restOfChain)) !== null) {
      const effMethod = effMatch[1]; // e.g. 'lpf' or 's' or 'sound'
      const effParam = effMatch[2]; // e.g. '1200' or '"sawtooth"'
      const effStart = chainBaseOffset + effMatch.index;
      const paramOffsetInside = effMatch[0].indexOf(effParam);
      const paramStart = effStart + paramOffsetInside;

      // Method token
      layerTokens.push({
        id: `tok-${effStart}`,
        type: 'method',
        category: 'effect_method',
        value: effMethod,
        raw: `.${effMethod}`,
        startIndex: effStart,
        endIndex: effStart + effMethod.length + 1, // includes the leading dot
        line: linesBefore,
        layerIndex: layerIdx,
        context: {
          layerRole: role,
          parentMethod: effMethod,
          description: `DSP audio transformer / effect: .${effMethod}()`,
        },
      });

      // Param token (if parameter exists and isn't empty)
      if (effParam.trim().length > 0) {
        const cleanParam = effParam.trim().replace(/^["']|["']$/g, '');
        
        let pType: TokenType = 'param';
        let pCat: TokenCategory = classifyParamToken(effMethod);

        if (effMethod === 'bank') {
          pType = 'bank';
          pCat = 'effect_bank';
        } else if (effMethod === 's' || effMethod === 'sound') {
          if (SYNTH_VOICES.has(cleanParam.toLowerCase())) {
            pType = 'synth';
            pCat = 'synth_voice';
          } else {
            pType = 'sample';
            pCat = 'drum_perc';
          }
        }

        layerTokens.push({
          id: `tok-${paramStart}`,
          type: pType,
          category: pCat,
          value: cleanParam,
          raw: effParam,
          startIndex: paramStart,
          endIndex: paramStart + effParam.length,
          line: linesBefore,
          layerIndex: layerIdx,
          context: {
            layerRole: role,
            parentMethod: effMethod,
            matchedParamName: effMethod,
            description: `Parameter for .${effMethod}(): ${effParam}`,
          },
        });
      }
    }

    // Sort layer tokens by startIndex
    layerTokens.sort((a, b) => a.startIndex - b.startIndex);

    layers.push({
      id: `layer-${layerIdx}`,
      layerIndex: layerIdx,
      fullText: fullMatch.trim(),
      lineStart: linesBefore,
      lineEnd: linesBefore + linesInMatch - 1,
      role,
      soundSource: methodType,
      tokens: layerTokens,
    });

    allTokens.push(...layerTokens);
    layerIdx++;
  }

  // Fallback: If no structured s(...) or note(...) matched, parse lines directly
  if (layers.length === 0) {
    let lineOffset = 0;
    const lines = code.split('\n');
    lines.forEach((lineText, idx) => {
      const trimmed = lineText.trim();
      if (trimmed.length > 0) {
        const lineTokens = parseMiniNotationString(
          trimmed,
          lineOffset + lineText.indexOf(trimmed),
          idx + 1,
          0,
          trimmed.includes('note'),
          'melody'
        );
        allTokens.push(...lineTokens);
      }
      lineOffset += lineText.length + 1;
    });
  }

  allTokens.sort((a, b) => a.startIndex - b.startIndex);

  return { layers, allTokens };
}

/**
 * Accurately find the exact start and end position of a token within current code
 */
export function findTokenExactRange(
  code: string,
  token: StrudelToken
): { start: number; end: number } {
  if (!token) return { start: 0, end: 0 };

  // 1. Direct index check
  if (
    typeof token.startIndex === 'number' &&
    typeof token.endIndex === 'number' &&
    token.startIndex >= 0 &&
    token.endIndex <= code.length &&
    code.substring(token.startIndex, token.endIndex) === token.raw
  ) {
    return { start: token.startIndex, end: token.endIndex };
  }

  // 2. Search locally near original position (window of 150 chars)
  const targetRaw = token.raw;
  if (!targetRaw) {
    return {
      start: Math.max(0, token.startIndex || 0),
      end: Math.max(0, token.endIndex || 0),
    };
  }

  const searchRadius = 150;
  const searchStart = Math.max(0, (token.startIndex || 0) - searchRadius);
  const searchEnd = Math.min(code.length, (token.endIndex || 0) + searchRadius);
  const localWindow = code.substring(searchStart, searchEnd);
  const localOffset = localWindow.indexOf(targetRaw);

  if (localOffset !== -1) {
    const actualStart = searchStart + localOffset;
    return { start: actualStart, end: actualStart + targetRaw.length };
  }

  // 3. Fallback: Search globally in code
  const globalOffset = code.indexOf(targetRaw);
  if (globalOffset !== -1) {
    return { start: globalOffset, end: globalOffset + targetRaw.length };
  }

  return {
    start: Math.max(0, token.startIndex || 0),
    end: Math.max(0, token.endIndex || 0),
  };
}

/**
 * Check if a token position is inside pattern notation quotes on its line
 */
function getPatternQuoteContext(code: string, tokenStart: number, tokenEnd: number) {
  const lineStart = Math.max(0, code.lastIndexOf('\n', tokenStart - 1) + 1);
  const nextNewline = code.indexOf('\n', tokenEnd);
  const lineEnd = nextNewline === -1 ? code.length : nextNewline;
  const lineText = code.substring(lineStart, lineEnd);

  const relStart = tokenStart - lineStart;
  const relEnd = tokenEnd - lineStart;

  // Scan quotes on this line
  const quoteSpans: { open: number; close: number; quoteChar: string }[] = [];
  let currentOpen: { pos: number; char: string } | null = null;

  for (let idx = 0; idx < lineText.length; idx++) {
    const ch = lineText[idx];
    if (ch === '"' || ch === "'" || ch === '`') {
      if (currentOpen && currentOpen.char === ch) {
        quoteSpans.push({ open: currentOpen.pos, close: idx, quoteChar: ch });
        currentOpen = null;
      } else if (!currentOpen) {
        currentOpen = { pos: idx, char: ch };
      }
    }
  }

  // Find if token is inside a quote span
  const enclosing = quoteSpans.find(
    (span) => relStart >= span.open && relEnd <= span.close + 1
  );

  return {
    lineStart,
    lineEnd,
    lineText,
    isInsideQuotes: Boolean(enclosing),
    quoteOpenAbs: enclosing ? lineStart + enclosing.open : -1,
    quoteCloseAbs: enclosing ? lineStart + enclosing.close : -1,
    lastQuoteCloseAbs:
      quoteSpans.length > 0
        ? lineStart + quoteSpans[quoteSpans.length - 1].close
        : -1,
  };
}

/**
 * Replace a token inside the code and return the updated code string
 */
export function replaceTokenInCode(
  originalCode: string,
  token: StrudelToken,
  newValue: string
): string {
  if (!token) return originalCode;

  const { start, end } = findTokenExactRange(originalCode, token);
  
  // Clean parameter quotes if replacing a bank or string parameter
  let valueToInsert = newValue;
  if ((token.type === 'bank' || token.type === 'synth') && token.raw.startsWith('"') && !valueToInsert.startsWith('"')) {
    valueToInsert = `"${valueToInsert}"`;
  } else if ((token.type === 'bank' || token.type === 'synth') && token.raw.startsWith("'") && !valueToInsert.startsWith("'")) {
    valueToInsert = `'${valueToInsert}'`;
  }

  const before = originalCode.substring(0, start);
  const after = originalCode.substring(end);
  return before + valueToInsert + after;
}

/**
 * Insert a block of choice behind/after any specific token in the Strudel code
 */
export function insertBlockBehindTokenInCode(
  originalCode: string,
  token: StrudelToken | null,
  blockToInsert: string
): string {
  const trimmedBlock = blockToInsert.trim();
  if (!trimmedBlock) return originalCode;

  if (!token) {
    // If no token target, check if we should append as a new layer or line
    if (trimmedBlock.startsWith('.')) {
      // Append method to the last non-empty line
      return originalCode + trimmedBlock;
    }
    return originalCode + (originalCode.endsWith('\n') ? '' : '\n') + `s("${trimmedBlock}")`;
  }

  const { start, end } = findTokenExactRange(originalCode, token);
  const isMethod = trimmedBlock.startsWith('.');
  const ctx = getPatternQuoteContext(originalCode, start, end);

  if (isMethod) {
    // Method/Effect insertion (e.g. .lpf(1200) or .gain(0.8))
    if (ctx.isInsideQuotes) {
      // Find the closing quote and parent method closing parenthesis: e.g. s("bd sd") -> s("bd sd").lpf(1200)
      const afterQuote = originalCode.substring(ctx.quoteCloseAbs + 1);
      const nextParenRel = afterQuote.indexOf(')');
      if (nextParenRel !== -1) {
        const insertPos = ctx.quoteCloseAbs + 1 + nextParenRel + 1;
        return (
          originalCode.substring(0, insertPos) +
          trimmedBlock +
          originalCode.substring(insertPos)
        );
      }
    }

    // If token is a method or parameter (e.g. .gain(0.8)), find closing paren of this method call
    if (token.type === 'method' || token.type === 'param' || !ctx.isInsideQuotes) {
      const textAfterToken = originalCode.substring(end);
      const nextParenRel = textAfterToken.indexOf(')');
      if (nextParenRel !== -1) {
        const insertPos = end + nextParenRel + 1;
        return (
          originalCode.substring(0, insertPos) +
          trimmedBlock +
          originalCode.substring(insertPos)
        );
      }
    }

    // Direct insertion behind token
    return (
      originalCode.substring(0, end) +
      trimmedBlock +
      originalCode.substring(end)
    );
  }

  // Mini-notation element insertion (sample, note, rhythm modifier, chord, rest)
  if (ctx.isInsideQuotes) {
    // If it is a modifier that binds directly to the previous token (e.g., *4, /2, (3,8), @2, ?)
    const isDirectModifier =
      trimmedBlock.startsWith('*') ||
      trimmedBlock.startsWith('/') ||
      trimmedBlock.startsWith('(') ||
      trimmedBlock.startsWith('@') ||
      trimmedBlock === '?';

    if (isDirectModifier) {
      return (
        originalCode.substring(0, end) +
        trimmedBlock +
        originalCode.substring(end)
      );
    }

    // Normal note, sample, chord, or rest token: insert with leading space
    return (
      originalCode.substring(0, end) +
      ' ' +
      trimmedBlock +
      originalCode.substring(end)
    );
  }

  // If outside quotes on a line with quotes, insert inside the last quote of that line
  if (ctx.lastQuoteCloseAbs !== -1) {
    return (
      originalCode.substring(0, ctx.lastQuoteCloseAbs) +
      ' ' +
      trimmedBlock +
      originalCode.substring(ctx.lastQuoteCloseAbs)
    );
  }

  // If line has no quotes (e.g. stack(...) or custom variable), wrap or append cleanly
  return (
    originalCode.substring(0, end) +
    ' ' +
    trimmedBlock +
    originalCode.substring(end)
  );
}

/**
 * Insert a block at the end of a specific line or layer
 */
export function insertBlockAtLineInCode(
  originalCode: string,
  lineNumber: number,
  blockToInsert: string
): string {
  const trimmedBlock = blockToInsert.trim();
  if (!trimmedBlock) return originalCode;

  const lines = originalCode.split('\n');
  const targetIdx = Math.max(0, Math.min(lines.length - 1, lineNumber - 1));
  const line = lines[targetIdx] || '';

  if (trimmedBlock.startsWith('.')) {
    // Append method to the end of the line before any trailing comma
    if (line.endsWith(',')) {
      lines[targetIdx] = line.slice(0, -1) + trimmedBlock + ',';
    } else {
      lines[targetIdx] = line + trimmedBlock;
    }
  } else {
    // Mini-notation token: insert inside quotes if present
    const lastQuote = line.lastIndexOf('"');
    const lastSingleQuote = line.lastIndexOf("'");
    const quoteIdx = Math.max(lastQuote, lastSingleQuote);

    if (quoteIdx !== -1) {
      lines[targetIdx] =
        line.substring(0, quoteIdx) +
        ' ' +
        trimmedBlock +
        line.substring(quoteIdx);
    } else {
      // If line is empty or doesn't have pattern quotes, wrap in s("...")
      if (line.trim().length === 0) {
        lines[targetIdx] = `s("${trimmedBlock}")`;
      } else {
        lines[targetIdx] = line + ` .s("${trimmedBlock}")`;
      }
    }
  }

  return lines.join('\n');
}

/**
 * Remove any selected token/block from Strudel code cleanly
 */
export function removeBlockInCode(
  originalCode: string,
  token: StrudelToken
): string {
  if (!token) return originalCode;

  const { start, end } = findTokenExactRange(originalCode, token);
  const ctx = getPatternQuoteContext(originalCode, start, end);

  // 1. If removing a method/effect (e.g. .lpf(1200), .gain(0.8))
  if (token.type === 'method' || token.category.startsWith('effect_')) {
    // Find leading dot
    const beforeToken = originalCode.substring(0, start);
    const dotIdx = beforeToken.lastIndexOf('.');
    const nextParenRel = originalCode.substring(end).indexOf(')');

    if (dotIdx !== -1 && nextParenRel !== -1) {
      const methodStart = dotIdx;
      const methodEnd = end + nextParenRel + 1;
      return (
        originalCode.substring(0, methodStart) +
        originalCode.substring(methodEnd)
      );
    }
  }

  // 2. If removing a parameter inside a method call (e.g. 1200 in .lpf(1200))
  if (token.type === 'param') {
    // Check if it's the only argument of its method; remove the whole method
    const beforeToken = originalCode.substring(0, start);
    const dotIdx = beforeToken.lastIndexOf('.');
    const nextParenRel = originalCode.substring(end).indexOf(')');
    if (dotIdx !== -1 && nextParenRel !== -1) {
      const methodStart = dotIdx;
      const methodEnd = end + nextParenRel + 1;
      return (
        originalCode.substring(0, methodStart) +
        originalCode.substring(methodEnd)
      );
    }
  }

  // 3. If inside mini-notation quotes (samples, notes, rhythms, rests, chords)
  if (ctx.isInsideQuotes) {
    let removeStart = start;
    let removeEnd = end;

    // Check surrounding whitespace within the quote
    const beforeChar = start > ctx.quoteOpenAbs + 1 ? originalCode[start - 1] : '';
    const afterChar = end < ctx.quoteCloseAbs ? originalCode[end] : '';

    if (beforeChar === ' ' && afterChar === ' ') {
      // "bd  sd" -> take leading space
      removeStart = start - 1;
    } else if (beforeChar === ' ') {
      removeStart = start - 1;
    } else if (afterChar === ' ') {
      removeEnd = end + 1;
    }

    let updated =
      originalCode.substring(0, removeStart) +
      originalCode.substring(removeEnd);

    // If the quotes are now completely empty, leave a rest ~ or clean space
    const updatedLineStart = Math.max(0, updated.lastIndexOf('\n', start - 1) + 1);
    const updatedLineEnd = updated.indexOf('\n', start) === -1 ? updated.length : updated.indexOf('\n', start);
    const updatedLine = updated.substring(updatedLineStart, updatedLineEnd);

    // Clean any accidental duplicate spaces inside quotes
    const cleanedLine = updatedLine.replace(/"\s*"/g, '"~"').replace(/'\s*'/g, "'~'");
    if (cleanedLine !== updatedLine) {
      updated =
        updated.substring(0, updatedLineStart) +
        cleanedLine +
        updated.substring(updatedLineEnd);
    }

    return updated;
  }

  // 4. Default fallback: remove raw slice
  return originalCode.substring(0, start) + originalCode.substring(end);
}

/**
 * Remove an entire layer / line from the code
 */
export function removeLayerInCode(
  originalCode: string,
  lineNumber: number
): string {
  const lines = originalCode.split('\n');
  const targetIdx = Math.max(0, Math.min(lines.length - 1, lineNumber - 1));

  lines.splice(targetIdx, 1);

  // If all lines were deleted, return a default silent groove or kick
  if (lines.length === 0 || lines.every((l) => l.trim().length === 0)) {
    return 's("~")';
  }

  return lines.join('\n');
}

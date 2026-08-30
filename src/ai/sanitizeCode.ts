/**
 * Repair pass applied to every pattern a model produces, whichever engine
 * produced it.
 *
 * Why this exists
 * ---------------
 * A live session trace showed three separate ways a model's output reached the
 * user broken, and one way it reached the user *silently* broken:
 *
 *   1. Comments. `prompts.ts` used to ask for an inline "// TWEAK TIP:" on
 *      every layer. Gemini returned the whole pattern on ONE line, so
 *      everything after the first `//` was commented out and the parentheses
 *      never closed. Gemini Nano produced `.pan(0.4).// TWEAK TIP: ...`,
 *      leaving a dangling `.`. The prompt no longer asks for them, but models
 *      volunteer comments anyway, so they are stripped here as well.
 *
 *   2. Chained nonsense: `s("rhodes").s("rhodes")`, `s("303").~ .lpf(800)`,
 *      `s("sub bass").bd`. Small models emit these constantly.
 *
 *   3. Non-numeric Euclid arguments: `s("shaker(e,i)")` reached Strudel's own
 *      transpiler and came back as `RangeError: Invalid array length`, which
 *      is what the user was shown.
 *
 *   4. DEAD LAYERS. `s("rhodes")`, `s("sine")` and `s("transpose 1 octave up")`
 *      all passed validation and were reported as "EVALUATED OK", but `rhodes`
 *      is a synth voice and not a drum, so `isDrumName` sends it down the
 *      melodic path, `noteToFrequency` fails its regex, and the event is
 *      dropped. The layer is *silent*. The engine counted it, the log counted
 *      it, and the user heard nothing. This is the most damaging of the four
 *      because nothing anywhere reported a problem.
 *
 * Design rule, inherited from `outputParser.ts`: THIS FILE NEVER INVENTS
 * MUSIC. It only deletes what provably cannot make sound and rewrites what is
 * unambiguously a typo. Every change it makes is recorded in `repairs` and
 * logged to the session trace, so a repaired pattern can never be mistaken for
 * one the model got right.
 */

import { isDrumName, SYNTH_VOICES } from '../audio/vocabulary';
import { log, warn } from './diagnostics';

export interface SanitizeResult {
  code: string;
  /** Edits that were applied. Safe to show the user. */
  repairs: string[];
  /** Problems that could not be repaired. */
  problems: string[];
  /**
   * True when every layer was provably silent. Callers treat this as a parse
   * failure rather than handing the user a pattern that makes no sound.
   */
  allLayersDead: boolean;
}

/**
 * Removes `//` and block comments without touching the inside of a string
 * literal.
 *
 * A regex cannot do this correctly: `s("http://x")` and, more realistically,
 * a mini-notation string containing `/` would both be mangled.
 */
export function stripComments(code: string): { code: string; count: number } {
  let out = '';
  let quote: string | null = null;
  let count = 0;

  for (let i = 0; i < code.length; i++) {
    const c = code[i];

    if (quote) {
      out += c;
      if (c === quote && code[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      continue;
    }
    if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      count++;
      i--; // hand the newline back to the loop so line structure survives
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? code.length : end + 1;
      count++;
      continue;
    }
    out += c;
  }

  return { code: out, count };
}

/**
 * Second-chance strip, for a reply where the model put the whole pattern on
 * ONE line WITH comments on it.
 *
 * That shape is unrecoverable under the normal rule, because `//` runs to the
 * end of the line and the line is the entire pattern. It is exactly what
 * Gemini returned in the session trace:
 *
 *   stack(s("bd ...").gain(0.8), // TWEAK TIP: change bd to tom. s("hh(5,8)")...
 *
 * Here a comment is ended early, at the next thing that unambiguously starts a
 * pattern layer. This only runs after the strict strip has already failed to
 * yield a balanced expression, so correctly formatted code never reaches it.
 */
export function stripCommentsLenient(code: string): { code: string; count: number } {
  const NEXT_CALL = /\s(?:stack|sound|note|s|n)\s*\(/;
  let out = '';
  let quote: string | null = null;
  let count = 0;

  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      out += c;
      if (c === quote && code[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      continue;
    }
    if (c === '/' && code[i + 1] === '/') {
      const lineEnd = code.indexOf('\n', i);
      const rest = code.slice(i, lineEnd === -1 ? code.length : lineEnd);
      const next = NEXT_CALL.exec(rest);
      count++;
      if (next) {
        // Cut the comment short and keep the code that followed it.
        i += next.index;
        continue;
      }
      i = lineEnd === -1 ? code.length : lineEnd - 1;
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? code.length : end + 1;
      count++;
      continue;
    }
    out += c;
  }
  return { code: out, count };
}

const MASK = '\u0000';

/**
 * Replaces every string literal with an opaque placeholder.
 *
 * The structural repairs below are regexes over the whole file, and a
 * mini-notation string is full of characters that look like code. The stray
 * `.~` repair in particular used to rewrite `s("bd sd . ~ hh hh")` into
 * `s("bd sd hh hh")` — six steps silently became four, it validated cleanly,
 * and nothing anywhere reported it.
 */
function maskStrings(code: string): { masked: string; parts: string[] } {
  const parts: string[] = [];
  let out = '';
  let i = 0;

  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < code.length && !(code[j] === c && code[j - 1] !== '\\')) j++;
      parts.push(code.slice(i, Math.min(j + 1, code.length)));
      out += `${MASK}${parts.length - 1}${MASK}`;
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return { masked: out, parts };
}

function unmaskStrings(masked: string, parts: string[]): string {
  return masked.replace(new RegExp(`${MASK}(\\d+)${MASK}`, 'g'), (_m, n: string) => parts[Number(n)] ?? '');
}

/** Splits `a, b, c` on commas that are not nested inside brackets or quotes. */
export function splitTopLevelArgs(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';

  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      current += c;
      if (c === quote && inner[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      current += c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;

    if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

const SYNTH_VOICE_SET = new Set<string>(SYNTH_VOICES);

/**
 * Tokens that can make a sound when they appear inside `s("...")`.
 *
 * Deliberately excludes bare numbers. In real Strudel a number in `s()` is a
 * sample index; in this engine it falls through to `noteToFrequency`, which
 * reads `1` as MIDI note 1 — 8.66 Hz, below the range of hearing. Counting it
 * as playable is how `s("transpose 1 octave up")` was accepted.
 */
function sampleTokenIsPlayable(token: string): boolean {
  const clean = token
    .replace(/[[\]<>]/g, ' ')
    .replace(/[@?*!].*$/, '')
    .replace(/\(.*$/, '')
    .trim()
    .toLowerCase();
  if (!clean) return false;
  if (clean === '~' || clean === '_') return true; // rests are legitimate
  return isDrumName(clean);
}

/** True when NOTHING in this `s("...")` pattern can produce audio. */
function samplePatternIsDead(pattern: string): boolean {
  const tokens = pattern.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return true;
  // A pattern of nothing but rests is intentional silence, not a dead layer.
  if (tokens.every((t) => /^[~_]+$/.test(t))) return false;
  return !tokens.some(sampleTokenIsPlayable);
}

/** The first `s("…")` / `sound("…")` that is a source call, not `.s("…")`. */
const SOURCE_S = /(?:^|[^.\w])(?:s|sound)\s*\(\s*["'`]([^"'`]*)["'`]\s*\)/;
const SOURCE_NOTE = /(?:^|[^.\w])(?:note|n)\s*\(\s*["'`]([^"'`]*)["'`]\s*\)/;

/**
 * Textual repairs that do not need the layer structure.
 * Each returns the new code and pushes a human-readable note into `repairs`.
 */
function applyTextRepairs(code: string, repairs: string[]): string {
  let out = code;

  // The repairs from here to the mask boundary need to see inside strings.
  //
  // `s("rhodes").s("rhodes")` — the source call and the instrument selector
  // given the same argument. Keep the source, drop the duplicate selector.
  const doubledS = out.replace(
    /(?:^|[^.\w])(s|sound)\s*\(\s*(["'`])([^"'`]*)\2\s*\)\s*\.\s*(?:s|sound)\s*\(\s*(["'`])([^"'`]*)\4\s*\)/g,
    (match, _fn, _q1, first: string, _q2, second: string) => {
      if (first.trim().toLowerCase() !== second.trim().toLowerCase()) return match;
      const lead = match.startsWith('s(') || match.startsWith('sound(') ? '' : match[0];
      return `${lead}s("${first}")`;
    },
  );
  if (doubledS !== out) {
    repairs.push('collapsed a duplicated .s("…") selector');
    out = doubledS;
  }

  // `note("c3").s("a").s("b")` — several chained instrument selectors. The last
  // one wins, so the earlier ones are noise.
  const beforeChains = out;
  let pass;
  do {
    pass = out;
    out = out.replace(
      /\.[ \t]*(?:s|sound)[ \t]*\(\s*(["'`])[^"'`]*\1\s*\)(?=\s*\.[ \t]*(?:s|sound)[ \t]*\()/g,
      '',
    );
  } while (out !== pass);
  if (out !== beforeChains) repairs.push('dropped an overridden .s("…") selector');

  // `.pan("0 1")` — a quoted argument to a numeric effect is parsed as a note
  // pattern and silences the layer. Keep the first number in the string.
  const quotedArgs = out.replace(
    /\.(gain|pan|lpf|hpf|cutoff|room|delay|decay|fast|slow|speed|resonance)\s*\(\s*["'`]\s*(-?[\d.]+)[^"'`]*["'`]\s*\)/g,
    (_m, fn: string, num: string) => `.${fn}(${num})`,
  );
  if (quotedArgs !== out) {
    repairs.push('unquoted a numeric effect argument');
    out = quotedArgs;
  }

  // ---- structural repairs, with string literals masked out ----------------
  const { masked, parts } = maskStrings(out);
  let body = masked;

  // `s("303").~ .lpf(800)` — a stray `.~` produced by small models.
  const strayTilde = body.replace(/\.\s*~\s*/g, '');
  if (strayTilde !== body) {
    repairs.push('removed a stray ".~"');
    body = strayTilde;
  }

  // A layer that ends with "." — the residue of a comment that followed the
  // dot and ate the layer separator with it.
  //
  // An earlier version used INDENTATION to decide whether the next line was a
  // new layer or the continuation of a method chain. It was wrong in both
  // directions and manufactured the exact error it was meant to remove: in a
  // multi-line chain every link after the first sits at the SAME indent as the
  // one before it, so `note("c2 e2").\n  s("sawtooth").\n  lpf(1200)` lost its
  // voice and its filter, and `s("bd*4").\n  gain(0.8)` came out as the
  // verbatim `Unexpected token (3:2)` from the session trace.
  //
  // Indentation is not the discriminator. Almost every name that can start a
  // line here is also a legal chained method — `.s()`, `.note()`, `.n()`,
  // `.gain()` — so the only safe reading of `foo().` followed by an identifier
  // is a chain, and the dot stays. `stack(` is the one name that is never a
  // method, so that alone earns the comma. Anything else (a bracket, a comma)
  // means the dot is simply stray.
  //
  // The cost is that the one true positive in the trace — `.pan(0.4).` then
  // `s("perc")`, which really was a layer — merges into the line above instead
  // of splitting. That produces valid, audible code rather than a syntax
  // error, which is the right way to be wrong here.
  const lines = body.split('\n');
  let danglingFixed = false;
  for (let i = 0; i < lines.length - 1; i++) {
    const m = lines[i].match(/^(\s*)(.*?)\.[ \t]*$/);
    if (!m || !m[2].trim()) continue;
    const next = lines[i + 1];
    if (!next.trim()) continue;
    if (/^\s*stack\s*\(/.test(next)) {
      lines[i] = `${m[1]}${m[2]},`; // stack() is never a chained method
      danglingFixed = true;
      continue;
    }
    if (/^\s*[a-zA-Z_$][\w$]*\s*\(/.test(next)) continue; // a chained method
    lines[i] = m[1] + m[2]; // stray dot before a bracket or comma
    danglingFixed = true;
  }
  if (danglingFixed) {
    repairs.push('repaired a dangling "." at the end of a line');
    body = lines.join('\n');
  }

  // Two layers with no comma between them. Small models drop the separator
  // constantly — one session trace has a six-layer stack with none at all,
  // which Strudel reports as `Unexpected token (3:2)`. A `)` followed by a
  // newline and then a new call is unambiguous: neither `),` nor `)\n.method`
  // nor `)\n)` matches.
  const commas = body.replace(
    /\)([ \t]*\r?\n[ \t]*)(?=(?:stack|sound|note|s|n)[ \t]*\()/g,
    ')_COMMA_$1',
  );
  if (commas !== body) {
    repairs.push('inserted a missing comma between two layers');
    body = commas.replace(/\)_COMMA_/g, '),');
  }

  // Trailing whitespace left where a comment used to be.
  body = body.replace(/[ \t]+(?=\r?\n)/g, '');

  out = unmaskStrings(body, parts);

  // `shaker(e,i)` — Euclid needs integers. Reaching Strudel's own transpiler
  // with this came back as `RangeError: Invalid array length`, which is what
  // the user was shown. Handled inside string literals only, where a
  // `name(a,b)` is unambiguously mini-notation and not a JS call.
  out = out.replace(/(["'`])([^"'`]*)\1/g, (match, q: string, body: string) => {
    const fixed = body.replace(
      /([a-zA-Z_~][a-zA-Z0-9_]*)\(([^)]*)\)/g,
      (call, name: string, args: string) => {
        const parts = args.split(',').map((a) => a.trim());
        // `bd(<3 5>,8)` is legitimate: `tokenizeMiniNotation` expands `<…>`
        // BEFORE the Euclid regex runs, so the engine plays 3-over-8 on one
        // cycle and 5-over-8 on the next. Rewriting it to `s("bd")` destroyed
        // the rhythm.
        const isCount = (a: string) => /^-?\d+$/.test(a) || /^[<[][\d\s]+[>\]]$/.test(a);
        const allCounts = parts.length >= 2 && parts.every(isCount);
        if (allCounts) return call;
        repairs.push(`dropped a non-numeric Euclid argument in "${name}(${args})"`);
        return name;
      },
    );
    return fixed === body ? match : `${q}${fixed}${q}`;
  });

  return out;
}

/**
 * Repairs a generated pattern and reports everything it had to change.
 *
 * `label` only names the caller in the trace.
 */
export function sanitizeGeneratedCode(code: string, label = 'model output'): SanitizeResult {
  const repairs: string[] = [];
  const problems: string[] = [];

  if (!code || !code.trim()) {
    return { code: code || '', repairs, problems, allLayersDead: false };
  }

  const stripped = stripComments(code);
  if (stripped.count > 0) {
    repairs.push(`removed ${stripped.count} comment${stripped.count === 1 ? '' : 's'}`);
  }

  let out = applyTextRepairs(stripped.code, repairs);

  // ---- dead-layer removal, inside stack(...) only -------------------------
  let allLayersDead = false;
  const stackStart = out.search(/(?:^|[^.\w])stack\s*\(/);

  // A reply with no stack() wrapper is still a pattern, and it was skipping
  // this check entirely: `s("rhodes")` on its own was accepted, validated and
  // reported as "EVALUATED OK — 1 layer(s)" while making no sound. The compact
  // tweak and variation prompts, and buildRetryPrompt, none of them guarantee
  // a wrapper.
  if (stackStart === -1) {
    const m = SOURCE_S.exec(out);
    if (m && !SOURCE_NOTE.test(out) && samplePatternIsDead(m[1])) {
      const voice = m[1].trim().split(/[\s(]/)[0].toLowerCase();
      problems.push(
        SYNTH_VOICE_SET.has(voice)
          ? `s("${m[1].trim()}") is silent — "${voice}" is a synth voice, so it needs note("…").s("${voice}")`
          : `s("${m[1].trim()}") is silent — no playable drum name in it`,
      );
      allLayersDead = true;
    }
  }

  if (stackStart !== -1) {
    const open = out.indexOf('(', stackStart);
    let depth = 0;
    let quote: string | null = null;
    let close = -1;
    for (let i = open; i < out.length; i++) {
      const c = out[i];
      if (quote) {
        if (c === quote && out[i - 1] !== '\\') quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        quote = c;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }

    if (close !== -1) {
      const args = splitTopLevelArgs(out.slice(open + 1, close));
      const kept: string[] = [];
      const dropped: string[] = [];

      for (const arg of args) {
        if (!arg.trim()) continue;
        // A `note(...)` layer is pitched; its tokens go through a different
        // path and are not judged here.
        if (SOURCE_NOTE.test(arg)) {
          kept.push(arg);
          continue;
        }
        const m = SOURCE_S.exec(arg);
        if (m && samplePatternIsDead(m[1])) {
          dropped.push(m[1].trim());
          continue;
        }
        kept.push(arg);
      }

      if (dropped.length > 0) {
        for (const d of dropped) {
          const voice = d.split(/[\s(]/)[0].toLowerCase();
          problems.push(
            SYNTH_VOICE_SET.has(voice)
              ? `s("${d}") is silent — "${voice}" is a synth voice, so it needs note("…").s("${voice}")`
              : `s("${d}") is silent — no playable drum name in it`,
          );
        }
        if (kept.length === 0) {
          allLayersDead = true;
        } else {
          const indent = out.slice(open + 1).match(/^\s*\n(\s*)/)?.[1] ?? '  ';
          const body = kept.map((k) => k.trim()).join(`,\n${indent}`);
          out = `${out.slice(0, open + 1)}\n${indent}${body}\n${out.slice(close)}`;
          repairs.push(
            `removed ${dropped.length} silent layer${dropped.length === 1 ? '' : 's'}: ` +
              dropped.map((d) => `s("${d}")`).join(', '),
          );
        }
      }
    }
  }

  if (repairs.length || problems.length) {
    log(
      'ai',
      `sanitiser touched ${label}: ` +
        [...repairs, ...problems.map((p) => `UNFIXABLE: ${p}`)].join(' | '),
    );
  }
  if (allLayersDead) {
    warn('ai', `every layer in ${label} was silent — rejecting it`);
  }

  return { code: out, repairs, problems, allLayersDead };
}

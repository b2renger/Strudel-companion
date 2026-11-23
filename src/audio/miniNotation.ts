/**
 * Bracket-aware helpers for mini-notation alternations, `<a b c>`.
 *
 * Both callers used to find the options with `inner.split(/\s+/)`, which
 * splits INSIDE groups: `<[a3 c4 e4] [f3 a3 c4]>` became the options `[a3`,
 * `c4`, `e4]`… The engine then played `[a3` (not a note) and the chord layer
 * of every composed pattern was silent, and the cycle-rotation variation
 * wrote `<c4 e4] [f3 a3 c4] [a3>`.
 */

/** Splits at whitespace that is not inside `[ ]`, `< >` or `( )`. */
export function splitTopLevelSpaces(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const c of str) {
    if (c === '[' || c === '<' || c === '(') depth++;
    else if (c === ']' || c === '>' || c === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(c)) {
      if (current) parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Index of the `>` closing the `<` at `open`, or -1 if it is never closed. */
function closingAngle(str: string, open: number): number {
  let depth = 0;
  for (let i = open; i < str.length; i++) {
    if (str[i] === '<') depth++;
    else if (str[i] === '>' && --depth === 0) return i;
  }
  return -1;
}

/**
 * Replaces every alternation with what it plays on `cycle`, following
 * Strudel's semantics:
 *
 * - `<a [b c] d>` plays one option per cycle, a group counting as one option.
 * - `<a b c d>*2` plays two consecutive options per cycle: `[a b]`, then `[c d]`.
 * - A nested alternation advances only on the cycles its parent selects it,
 *   so `<a <b c>>` plays a, b, a, c.
 */
export function resolveAlternations(str: string, cycle: number): string {
  let out = '';
  let i = 0;
  while (i < str.length) {
    if (str[i] !== '<') {
      out += str[i++];
      continue;
    }
    const close = closingAngle(str, i);
    if (close < 0) {
      // Unbalanced: leave it for the validator to report.
      out += str.slice(i);
      break;
    }
    const options = splitTopLevelSpaces(str.slice(i + 1, close));
    i = close + 1;

    // Only an integer multiplier steps through the options; anything else
    // stays attached to the chosen option, as before.
    const fast = str.slice(i).match(/^\*(\d+)(?![\d.])/);
    const steps = fast ? Math.max(1, Math.min(64, parseInt(fast[1], 10))) : 1;
    if (fast) i += fast[0].length;
    if (options.length === 0) continue;

    const picked: string[] = [];
    for (let j = 0; j < steps; j++) {
      const k = cycle * steps + j;
      picked.push(resolveAlternations(options[k % options.length], Math.floor(k / options.length)));
    }
    out += steps === 1 ? picked[0] : `[${picked.join(' ')}]`;
  }
  return out;
}

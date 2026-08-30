/**
 * Syntax validation for Strudel patterns.
 *
 * Why this exists
 * ---------------
 * The playback engine is a hand-rolled synthesiser, not Strudel. Its parser
 * never threw: `parseStrudelCode` and everything under it returned best-effort
 * results, and when nothing matched it fell back to a hardcoded
 * `bd sd, hh*4` layer. So `evaluate("this is not code")` reported success and
 * played a drum loop. Three things followed from that:
 *
 *   - `errorMessage` was never set, so the "Fix with AI" button was
 *     unreachable and its whole code path was dead.
 *   - Users got positive audio feedback for code that real Strudel rejects.
 *   - "Export to strudel.cc" shipped that code to a real parser, which would
 *     reject or reinterpret it — the feature was actively misleading.
 *
 * We therefore validate with Strudel's own transpiler and play with our own
 * synth. Real errors, real REPL compatibility, and no sample downloads — so
 * offline playback still works with nothing but the bundle.
 *
 * `@strudel/transpiler` is loaded lazily so it stays out of the initial
 * bundle; until it resolves, validation falls back to structural checks.
 */

type TranspileFn = (code: string, options?: unknown) => unknown;

let transpiler: TranspileFn | null = null;
let transpilerLoad: Promise<void> | null = null;

/** Kick off the lazy import. Safe to call repeatedly. */
export function warmUpValidator(): Promise<void> {
  if (!transpilerLoad) {
    transpilerLoad = import('@strudel/transpiler')
      .then((mod: any) => {
        transpiler = (mod.transpiler || mod.default || null) as TranspileFn | null;
      })
      .catch(() => {
        // Offline on a cold cache, or the package is unavailable. Structural
        // validation below still catches the common mistakes.
        transpiler = null;
      });
  }
  return transpilerLoad;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Structural checks that do not need the transpiler.
 *
 * These catch the mistakes that actually occur in live coding — unbalanced
 * delimiters and empty input — and they run synchronously, which matters
 * because evaluation happens on the audio path.
 */
export function validateStructure(code: string): ValidationResult {
  const withoutComments = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  if (!withoutComments.trim()) {
    return { ok: false, error: 'The pattern is empty.' };
  }

  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' };
  const openers = new Set(['(', '[', '{', '<']);
  const stack: string[] = [];
  let quote: string | null = null;

  for (let i = 0; i < withoutComments.length; i++) {
    const ch = withoutComments[i];

    if (quote) {
      if (ch === quote && withoutComments[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    // '<' and '>' are only delimiters inside mini-notation strings, which the
    // branch above already skips, so only track the bracket family here.
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch);
    } else if (ch === ')' || ch === ']' || ch === '}') {
      const expected = pairs[ch];
      if (stack.length === 0 || stack[stack.length - 1] !== expected) {
        return { ok: false, error: `Unexpected "${ch}" — check your brackets.` };
      }
      stack.pop();
    }
  }

  if (quote) {
    return { ok: false, error: 'A quoted pattern was never closed.' };
  }
  if (stack.length > 0) {
    const missing = stack[stack.length - 1];
    const closer = missing === '(' ? ')' : missing === '[' ? ']' : '}';
    return { ok: false, error: `Missing "${closer}" — a "${missing}" was never closed.` };
  }

  // Euclid arguments must be whole numbers. `s("shaker(e,i)")` reached
  // Strudel's own transpiler and came back as `RangeError: Invalid array
  // length`, which is what the user was shown as the error message.
  for (const m of withoutComments.matchAll(/(["'`])([^"'`]*)\1/g)) {
    for (const call of m[2].matchAll(/([a-zA-Z_~][a-zA-Z0-9_]*)\(([^)]*)\)/g)) {
      const args = call[2].split(',').map((a) => a.trim());
      // `bd(<3 5>,8)` is valid: tokenizeMiniNotation expands `<…>` before the
      // Euclid regex runs, so it alternates 3-over-8 and 5-over-8 by cycle.
      const isCount = (a: string) => /^-?\d+$/.test(a) || /^[<[][\d\s]+[>\]]$/.test(a);
      if (!args.every(isCount)) {
        return {
          ok: false,
          error:
            `"${call[1]}(${call[2]})" is not a valid Euclidean rhythm — ` +
            'the numbers in brackets must be whole numbers, like bd(3,8).',
        };
      }
    }
  }

  if (!/(?:^|[\s,(])(?:stack|s|n|note|sound)\s*\(/m.test(withoutComments)) {
    return {
      ok: false,
      error: 'No pattern found. A pattern needs at least one s("...") or note("...").',
    };
  }

  return { ok: true };
}

/**
 * Full validation: structure first, then Strudel's own transpiler when it has
 * loaded. Synchronous by design — evaluation sits on the audio path.
 */
export function validatePattern(code: string): ValidationResult {
  const structural = validateStructure(code);
  if (!structural.ok) return structural;

  if (transpiler) {
    try {
      transpiler(code, { wrapAsync: false, addReturn: false });
    } catch (err: any) {
      const message = String(err?.message || err || 'Invalid syntax.');
      return { ok: false, error: cleanTranspilerMessage(message) };
    }
  }

  return { ok: true };
}

/** Strudel's parser messages are terse; give them a little context. */
function cleanTranspilerMessage(message: string): string {
  const trimmed = message.replace(/^.*?Error:\s*/i, '').trim();

  // A RangeError from inside the transpiler is not a message for a musician.
  // `s("shaker(e,i)")` produced literally `Invalid array length`, which tells
  // the user nothing about what to change.
  if (/invalid array length|maximum call stack|out of memory/i.test(trimmed)) {
    return (
      'Strudel choked on this pattern — usually a bracketed rhythm with ' +
      'something other than whole numbers in it, like bd(e,i) instead of bd(3,8).'
    );
  }
  if (/unexpected|expected/i.test(trimmed)) {
    return `Strudel could not parse this: ${trimmed}`;
  }
  return trimmed || 'Strudel could not parse this pattern.';
}

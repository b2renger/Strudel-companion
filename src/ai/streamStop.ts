/**
 * When to stop a streaming completion.
 *
 * Lives outside `src/workers/aiWorker.ts` so it can be tested: importing the
 * worker pulls in @mlc-ai/web-llm and assigns `self.onmessage` at module
 * scope, which is exactly why nothing else may import it.
 */

/**
 * Room allowed after the code block for TITLE / BPM / GENRE / WHY / NOTE lines.
 *
 * This was 40 characters, measured from the closing bracket, on unfenced
 * replies. A perfectly ordinary answer ending
 * `\nTITLE: Midnight Corridor of Iron\nBPM: 138` was guillotined at `BPM: 1`,
 * and the parser accepted 1 as the tempo.
 */
export const LABEL_BUDGET = 400;

/** Index just past the first balanced top-level pattern call, or -1. */
export function indexAfterBalancedPattern(text: string): number {
  const start = text.search(/(?:^|\n)[ \t]*(?:stack|sound|note|n|s)[ \t]*\(/);
  if (start === -1) return -1;

  let depth = 0;
  let quote: string | null = null;
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
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Returns a reason when the reply is structurally finished, so generation can
 * be stopped instead of running to the cap.
 *
 * Small models do not reliably stop after a strict-format answer; they start a
 * second pattern or explain themselves until the budget runs out, which is
 * where the 37-second dead ends came from.
 *
 * The fence count is the tricky part. An earlier version handled 0 fences and
 * 2+, and did nothing at all for exactly 1 — a model that opened
 * ```` ```strudel ```` and never closed it, which is the single most common
 * small-model slip and precisely the case this was written for.
 */
export function completionIsDone(text: string): string | null {
  const fences = (text.match(/```/g) || []).length;
  if (fences >= 3) return 'the model started a second code block';

  let endOfCode: number;
  if (fences >= 2) {
    endOfCode = text.lastIndexOf('```') + 3;
  } else {
    // 0 fences (the retry prompt asks for bare code) or 1 (opened and never
    // closed). Either way, the code ends where the top-level call balances.
    endOfCode = indexAfterBalancedPattern(text);
    if (endOfCode === -1) return null;
  }

  const after = text.slice(endOfCode);
  if (/(?:^|\n)[ \t]*(?:stack|sound|note|n|s)[ \t]*\(/.test(after)) {
    return 'the model started a second pattern';
  }
  if (after.length > LABEL_BUDGET) return 'the label block is complete';
  if (/\n[ \t]*\n[ \t]*\n/.test(after)) return 'the model ran out of labels';
  return null;
}

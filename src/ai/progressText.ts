import { AIEngineProgress } from '../types';

/**
 * Text for a button that is mid-request.
 *
 * Components used to render `aiProgress.text || 'Generating…'` directly, but
 * that field is truthy from app start — it carries the engine's *idle* status
 * ("Gemini ready, using your API key"). So a forty-second generation showed a
 * spinner next to the words "Gemini ready", which reads as a stuck UI.
 *
 * Only genuinely in-flight states have something worth saying; otherwise fall
 * back to the caller's own label.
 */
export function statusText(
  progress: AIEngineProgress | undefined,
  fallback: string,
): string {
  if (!progress) return fallback;
  if (progress.status === 'downloading') {
    return `${progress.text} ${Math.round(progress.progress * 100)}%`;
  }
  // 'ready' is also emitted during generation with a live label such as
  // "Composing…" or "Created 2 of 3 variations…". Those are useful; the idle
  // ones are not, and are filtered out by the fallback comparison below.
  if (progress.status === 'error') return fallback;
  return progress.text && progress.text.endsWith('…') ? progress.text : fallback;
}

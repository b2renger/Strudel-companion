/**
 * Storage for the user's own Gemini API key.
 *
 * Threat model, stated plainly because this app is a public static site:
 *
 * The key belongs to the user and never leaves their browser except in the
 * request to Google. There is no server to protect it from, and no other
 * visitor can read it — browser storage is origin-scoped and per-device.
 *
 * The realistic risks, in order:
 *   1. XSS on this origin. Any injected script can read `localStorage` and
 *      `sessionStorage` equally, so the storage choice does not mitigate it;
 *      a Content-Security-Policy does.
 *   2. Shared or kiosk machines, where a persisted key outlives the user.
 *   3. A user pasting an unrestricted billable key.
 *
 * `localStorage` is the right trade-off: a tool you reopen constantly is
 * unusable if the key must be re-pasted every session, and `sessionStorage`
 * buys nothing against (1). What actually mitigates (3) is telling the user
 * to restrict the key by HTTP referrer, which the settings UI does.
 *
 * The key is deliberately kept out of `SavedSession` objects, which are
 * exported to JSON files and shared.
 */

const STORAGE_KEY = 'strudel_gemini_api_key';

export function getApiKey(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function setApiKey(key: string): boolean {
  try {
    const trimmed = key.trim();
    if (!trimmed) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, trimmed);
    }
    return true;
  } catch {
    return false;
  }
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

export function hasApiKey(): boolean {
  return getApiKey() !== null;
}

/**
 * Shape check only — it cannot tell whether the key is live. Google's keys
 * begin "AIza" and are ~39 characters; we warn rather than block, since the
 * format is not contractual.
 */
export function looksLikeApiKey(key: string): boolean {
  const t = key.trim();
  return t.length >= 30 && !/\s/.test(t);
}

/** Never log or display more than this. */
export function maskApiKey(key: string): string {
  const t = key.trim();
  if (t.length <= 8) return '••••';
  return `${t.slice(0, 4)}${'•'.repeat(Math.max(4, t.length - 8))}${t.slice(-4)}`;
}

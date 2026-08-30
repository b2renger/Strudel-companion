/**
 * Utility for exporting, sharing, and sending Strudel live-coding patterns
 * directly to the official Strudel REPL environment (https://strudel.cc).
 */

/**
 * Generate an official Strudel REPL URL with embedded base64 code hash.
 * Strudel.cc parses URL hashes encoded in base64 on initialization.
 */
export function getStrudelOfficialReplUrl(code: string): string {
  try {
    const cleanCode = typeof code === 'string' ? code.trim() : '';
    // Standard UTF-8 safe base64 encoding for browser URLs
    const encoded = btoa(unescape(encodeURIComponent(cleanCode)));
    return `https://strudel.cc/#${encoded}`;
  } catch (err) {
    console.warn('Failed to encode code for Strudel REPL URL:', err);
    return 'https://strudel.cc/';
  }
}

/**
 * Open the pattern directly in the official Strudel online editor in a new browser tab.
 */
export function openInOfficialStrudel(code: string): void {
  const url = getStrudelOfficialReplUrl(code);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    // If popups are blocked, fallback to standard location change or anchor trigger
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Copy the official Strudel REPL share link to the clipboard.
 */
export async function copyStrudelReplLink(code: string): Promise<boolean> {
  try {
    const url = getStrudelOfficialReplUrl(code);
    await navigator.clipboard.writeText(url);
    return true;
  } catch (err) {
    console.error('Failed to copy Strudel REPL link:', err);
    return false;
  }
}

/**
 * Copy the raw runnable Strudel code to clipboard.
 */
export async function copyRawCodeToClipboard(code: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch (err) {
    console.error('Failed to copy raw code:', err);
    return false;
  }
}

/**
 * Download the pattern as a standalone `.strudel.js` file.
 */
export function downloadStrudelFile(code: string, trackTitle: string = 'pattern'): void {
  const sanitizedTitle = trackTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const filename = `${sanitizedTitle || 'strudel-pattern'}-${new Date().toISOString().slice(0, 10)}.js`;

  const blob = new Blob([code], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

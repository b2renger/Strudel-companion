/**
 * Structured console diagnostics.
 *
 * Answers, at runtime and without a debugger: which engine ran, what it was
 * asked, how long each phase took, what came back, what is cached, and why a
 * fallback happened.
 *
 * Enabled automatically in `npm run dev`. In a production build it is off
 * until you ask for it, so ordinary visitors get a clean console:
 *
 *     localStorage.strudel_debug = '1'   // then reload
 *     …or append ?debug to the URL
 *     …or run strudel.debug(true) in the console
 *
 * Safe to import from the Web Worker: it touches `self`, never `window`, and
 * guards every storage access.
 */

const STORAGE_KEY = 'strudel_debug';

function readFlag(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1') {
      return true;
    }
  } catch {
    /* storage may be unavailable in a worker or a private window */
  }
  try {
    if (typeof location !== 'undefined' && /[?&]debug\b/.test(location.search)) return true;
  } catch {
    /* no location in some worker contexts */
  }
  try {
    // Vite replaces this at build time; guarded for the worker bundle.
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

let enabled = readFlag();

export function setDebug(on: boolean): void {
  enabled = on;
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* not persistable here; the in-memory flag still applies */
  }
  // eslint-disable-next-line no-console
  console.info(`%c[strudel] diagnostics ${on ? 'ON' : 'OFF'}`, 'color:#059669;font-weight:bold');
}

export function isDebugEnabled(): boolean {
  return enabled;
}

/** Colour per subsystem, so a busy console stays scannable. */
const TAG_COLOURS: Record<string, string> = {
  ai: '#7c3aed',
  worker: '#0891b2',
  gemini: '#d97706',
  device: '#059669',
  audio: '#db2777',
  cache: '#4f46e5',
  parse: '#65a30d',
};

function stamp(tag: string): [string, string] {
  const colour = TAG_COLOURS[tag] ?? '#6b7280';
  return [
    `%c${tag}`,
    `background:${colour};color:#fff;padding:1px 6px;border-radius:4px;font-weight:600`,
  ];
}

export function log(tag: string, message: string, detail?: unknown): void {
  if (!enabled) return;
  const [fmt, style] = stamp(tag);
  if (detail === undefined) console.log(`${fmt} ${message}`, style);
  else console.log(`${fmt} ${message}`, style, detail);
}

export function warn(tag: string, message: string, detail?: unknown): void {
  if (!enabled) return;
  const [fmt, style] = stamp(tag);
  console.warn(`${fmt} ${message}`, style, detail ?? '');
}

/** Errors are ALWAYS shown — a silent failure is the thing we are fixing. */
export function error(tag: string, message: string, detail?: unknown): void {
  const [fmt, style] = stamp(tag);
  console.error(`${fmt} ${message}`, style, detail ?? '');
}

/** Collapsed group; the callback still runs when diagnostics are off. */
export function group(tag: string, title: string, body: () => void): void {
  if (!enabled) {
    body();
    return;
  }
  const [fmt, style] = stamp(tag);
  console.groupCollapsed(`${fmt} ${title}`, style);
  try {
    body();
  } finally {
    console.groupEnd();
  }
}

export interface Timer {
  /** Milliseconds since the timer started. */
  elapsed(): number;
  /** Logs a labelled checkpoint without ending the timer. */
  mark(label: string, detail?: unknown): void;
  /** Logs the total and returns it. */
  end(label?: string, detail?: unknown): number;
}

export function timer(tag: string, label: string): Timer {
  const t0 = now();
  let last = t0;
  log(tag, `▶ ${label}`);
  return {
    elapsed: () => now() - t0,
    mark(mLabel, detail) {
      const at = now();
      log(tag, `  ├ ${mLabel} (+${fmtMs(at - last)})`, detail);
      last = at;
    },
    end(eLabel, detail) {
      const total = now() - t0;
      log(tag, `■ ${eLabel ?? label} in ${fmtMs(total)}`, detail);
      return total;
    },
  };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Truncated preview of a prompt or completion, for logging. */
export function preview(text: string, max = 400): string {
  if (typeof text !== 'string') return String(text);
  const clean = text.replace(/\n{3,}/g, '\n\n');
  return clean.length <= max ? clean : `${clean.slice(0, max)}\n…(+${clean.length - max} chars)`;
}

/**
 * Very rough token estimate. Mini-notation and escaped JSON tokenize far worse
 * than prose (~2.5–3 chars/token), so this errs on the high side deliberately —
 * it is used to warn about budget, where over-estimating is the safe direction.
 */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 3);
}

// ---------------------------------------------------------------------------
// Cache & storage inspection
// ---------------------------------------------------------------------------

export interface CacheReport {
  name: string;
  entries: number;
  bytes: number | null;
  sample: string[];
}

/**
 * Lists Cache Storage contents. Sizes come from `content-length` where the
 * cached response exposes it; opaque responses report null rather than a guess.
 */
export async function inspectCaches(): Promise<CacheReport[]> {
  if (typeof caches === 'undefined') return [];
  const names = await caches.keys();
  const reports: CacheReport[] = [];

  for (const name of names) {
    try {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      let bytes = 0;
      let measurable = false;

      for (const req of requests) {
        const res = await cache.match(req);
        const len = res?.headers.get('content-length');
        if (len) {
          bytes += Number(len);
          measurable = true;
        }
      }

      reports.push({
        name,
        entries: requests.length,
        bytes: measurable ? bytes : null,
        sample: requests.slice(0, 3).map((r) => r.url.split('/').pop() || r.url),
      });
    } catch {
      reports.push({ name, entries: -1, bytes: null, sample: [] });
    }
  }
  return reports;
}

export async function storageEstimate(): Promise<{
  usage: number;
  quota: number;
  free: number;
  persisted: boolean | null;
} | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    let persisted: boolean | null = null;
    try {
      persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    } catch {
      persisted = null;
    }
    return { usage, quota, free: Math.max(0, quota - usage), persisted };
  } catch {
    return null;
  }
}

/**
 * In-memory session trace.
 *
 * Records the whole user journey — boot, device probe, engine and model
 * choices, cache hits, downloads, prompts, raw model replies, parse outcomes,
 * evaluation, playback — so it can be exported as one block of text and handed
 * to someone who was not sitting at the machine.
 *
 * This records ALWAYS, regardless of whether verbose console output is on.
 * Console printing is a separate decision (see diagnostics.ts): a quiet console
 * is a UI choice, but a user who hits a bug should never be told "reproduce it
 * again with logging turned on".
 *
 * The buffer is bounded and every value is truncated, so a long session cannot
 * grow without limit.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'event';

export interface LogEntry {
  /** Milliseconds since the session started. */
  t: number;
  level: LogLevel;
  tag: string;
  msg: string;
  detail?: string;
}

const MAX_ENTRIES = 3000;
const MAX_DETAIL_CHARS = 4000;

const started = Date.now();
const entries: LogEntry[] = [];
let dropped = 0;

/**
 * Optional sink for environments that cannot own the canonical trace.
 *
 * The Web Worker has its own module instance, so anything it records would be
 * invisible to an export taken on the main thread. The worker installs a
 * forwarder that posts each entry across; the manager replays them into the
 * real buffer.
 */
type Forwarder = (entry: LogEntry) => void;
let forwarder: Forwarder | null = null;

export function setForwarder(fn: Forwarder | null): void {
  forwarder = fn;
}

/** Replays an entry captured elsewhere, preserving its original tag. */
export function ingest(entry: LogEntry): void {
  if (entries.length >= MAX_ENTRIES) {
    entries.shift();
    dropped++;
  }
  entries.push(entry);
}

/** Depth- and size-limited stringify that cannot throw on cycles. */
function safeDetail(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return clamp(value);
  try {
    const seen = new WeakSet();
    const json = JSON.stringify(
      value,
      (_k, v) => {
        if (v instanceof Error) return { name: v.name, message: v.message };
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[circular]';
          seen.add(v);
        }
        if (typeof v === 'function') return '[function]';
        if (typeof v === 'bigint') return String(v);
        return v;
      },
      1,
    );
    return clamp(json ?? String(value));
  } catch {
    return clamp(String(value));
  }
}

function clamp(s: string): string {
  return s.length <= MAX_DETAIL_CHARS
    ? s
    : `${s.slice(0, MAX_DETAIL_CHARS)}\n…(+${s.length - MAX_DETAIL_CHARS} chars truncated)`;
}

export function record(level: LogLevel, tag: string, msg: string, detail?: unknown): void {
  const entry: LogEntry = {
    t: Date.now() - started,
    level,
    tag,
    msg,
    detail: safeDetail(detail),
  };
  if (forwarder) {
    forwarder(entry);
    return;
  }
  ingest(entry);
}

export function getEntries(): readonly LogEntry[] {
  return entries;
}

export function clearTrace(): void {
  entries.length = 0;
  dropped = 0;
}

function ts(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(
    Math.floor(ms % 1000),
  ).padStart(3, '0')}`;
}

const LEVEL_MARK: Record<LogLevel, string> = {
  info: '  ',
  event: '▶ ',
  warn: '! ',
  error: '✗ ',
};

/**
 * Environment snapshot, so a pasted trace is self-describing.
 *
 * Every probe is individually guarded. This runs at exactly the moment
 * something has already gone wrong, and a throw here would destroy the trace
 * the user is trying to send — the one artefact that explains the failure.
 */
export async function environmentReport(): Promise<string> {
  const lines: string[] = [];
  const add = (label: string, get: () => unknown) => {
    try {
      const v = get();
      lines.push(`${label.padEnd(15)}${v === undefined || v === null ? '(not reported)' : String(v)}`);
    } catch (err) {
      lines.push(`${label.padEnd(15)}(unavailable: ${(err as Error)?.message ?? 'error'})`);
    }
  };

  const g = globalThis as any;

  add('url', () => g.location?.href);
  add('userAgent', () => g.navigator?.userAgent);
  add('language', () => g.navigator?.language);
  add('platform', () => g.navigator?.platform);
  add('screen', () => `${g.screen?.width}x${g.screen?.height} @${g.devicePixelRatio}x`);
  add('viewport', () => `${g.innerWidth}x${g.innerHeight}`);
  add('online', () => g.navigator?.onLine);
  add('deviceMemory', () => g.navigator?.deviceMemory);
  add('cpuThreads', () => g.navigator?.hardwareConcurrency);
  add('touchPoints', () => g.navigator?.maxTouchPoints);
  add('webgpu', () => (g.navigator && 'gpu' in g.navigator ? 'navigator.gpu present' : 'ABSENT'));
  add('LanguageModel', () => (typeof self !== 'undefined' && 'LanguageModel' in self ? 'present' : 'absent'));
  add('connection', () => {
    const c = g.navigator?.connection;
    return c ? `${c.effectiveType ?? '?'} saveData=${c.saveData ?? '?'}` : undefined;
  });

  try {
    if (g.navigator?.storage?.estimate) {
      const { usage = 0, quota = 0 } = await g.navigator.storage.estimate();
      const persisted = g.navigator.storage.persisted ? await g.navigator.storage.persisted() : null;
      lines.push(
        `${'storage'.padEnd(15)}${(usage / 1048576).toFixed(0)} MB used / ` +
          `${(quota / 1048576).toFixed(0)} MB quota, persisted=${persisted}`,
      );
    }
  } catch (err) {
    lines.push(`${'storage'.padEnd(15)}(unavailable: ${(err as Error)?.message})`);
  }

  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      lines.push(`${'caches'.padEnd(15)}${names.length ? names.join(', ') : '(none)'}`);
    }
  } catch (err) {
    lines.push(`${'caches'.padEnd(15)}(unavailable: ${(err as Error)?.message})`);
  }

  try {
    const regs = await g.navigator?.serviceWorker?.getRegistrations?.();
    if (regs) lines.push(`${'serviceWorker'.padEnd(15)}${regs.length} registration(s)`);
  } catch {
    /* not available in every context */
  }

  try {
    for (const key of ['strudel_ai_engine', 'strudel_ai_model', 'strudel_theme', 'strudel_debug']) {
      lines.push(`${key.padEnd(15)}${localStorage.getItem(key) ?? '(unset)'}`);
    }
    lines.push(`${'gemini key'.padEnd(15)}${localStorage.getItem('strudel_gemini_api_key') ? 'STORED (not shown)' : 'not set'}`);
  } catch {
    lines.push(`${'localStorage'.padEnd(15)}(unavailable)`);
  }

  return lines.join('\n');
}

/**
 * The whole session as one pasteable block.
 */
export async function formatTrace(): Promise<string> {
  let env: string;
  try {
    env = await environmentReport();
  } catch (err) {
    env = `(environment report failed: ${(err as Error)?.message})`;
  }
  const body = entries
    .map((e) => {
      const head = `${ts(e.t)} ${LEVEL_MARK[e.level]}[${e.tag}] ${e.msg}`;
      if (!e.detail) return head;
      const indented = e.detail
        .split('\n')
        .map((l) => `                  ${l}`)
        .join('\n');
      return `${head}\n${indented}`;
    })
    .join('\n');

  return [
    '===== STRUDEL AI SESSION TRACE =====',
    `captured       ${new Date().toISOString()}`,
    `sessionLength  ${ts(Date.now() - started)}`,
    `entries        ${entries.length}${dropped ? ` (+${dropped} older entries dropped)` : ''}`,
    '',
    '----- ENVIRONMENT -----',
    env,
    '',
    '----- TIMELINE -----',
    body || '(nothing recorded yet)',
    '===== END OF TRACE =====',
  ].join('\n');
}

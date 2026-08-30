/**
 * `window.strudel` — an inspection surface for the browser console.
 *
 * Everything the app knows about itself, on demand: which engine is active,
 * what the hardware probe found, what is cached, how much storage is left,
 * and which models will actually run here.
 *
 * Installed from main.tsx. Console-only; nothing in the UI depends on it.
 */

import { aiManager } from './aiManager';
import { probeDevice, assessAllModels } from './deviceProbe';
import { WEBGPU_MODELS, formatSize } from './models';
import { hasApiKey, maskApiKey, getApiKey } from './apiKeyStore';
import { AI_ENGINE_LABELS } from '../types';
import {
  setDebug,
  isDebugEnabled,
  inspectCaches,
  storageEstimate,
  fmtBytes,
  event,
} from './diagnostics';
import { formatTrace, clearTrace, getEntries } from './sessionLog';

/* eslint-disable no-console */

async function cache() {
  const [caches_, storage] = await Promise.all([inspectCaches(), storageEstimate()]);

  console.group('%c📦 Cache & storage', 'font-weight:bold;font-size:13px');

  if (storage) {
    console.log(
      `Using ${fmtBytes(storage.usage)} of ~${fmtBytes(storage.quota)} ` +
        `(${fmtBytes(storage.free)} free)`,
    );
    console.log(
      `Persistent storage: ${
        storage.persisted === null
          ? 'unknown'
          : storage.persisted
            ? 'GRANTED — weights should survive'
            : 'NOT granted — the browser may evict cached weights'
      }`,
    );
  } else {
    console.log('This browser does not report storage usage.');
  }

  if (caches_.length === 0) {
    console.log('No caches yet. The app shell caches on first load; model weights on first use.');
  } else {
    console.table(
      caches_.map((c) => ({
        cache: c.name,
        entries: c.entries,
        size: c.bytes === null ? '(opaque)' : fmtBytes(c.bytes),
        sample: c.sample.join(', '),
      })),
    );
    const modelCaches = caches_.filter((c) => /webllm|mlc|model/i.test(c.name));
    console.log(
      modelCaches.length
        ? `${modelCaches.length} model cache(s) present — a local model has been downloaded.`
        : 'No model weights cached yet.',
    );
  }
  console.groupEnd();
}

async function device() {
  const profile = await probeDevice();
  console.group('%c🖥  Device capabilities', 'font-weight:bold;font-size:13px');
  console.log('Tier:', profile.tier);
  console.table({
    'WebGPU adapter': profile.tier !== 'no-webgpu' && profile.tier !== 'no-adapter' ? 'yes' : 'NO',
    'shader-f16': profile.hasF16 ? 'yes' : 'NO — rules out every q4f16_1 model',
    'GPU vendor': profile.gpuVendor || '(not reported)',
    'max buffer': profile.maxBufferSize ? fmtBytes(profile.maxBufferSize) : '(n/a)',
    'max storage binding': profile.maxStorageBufferBindingSize
      ? fmtBytes(profile.maxStorageBufferBindingSize)
      : '(n/a)',
    'device memory': profile.deviceMemoryGiB ? `${profile.deviceMemoryGiB} GB` : '(Chromium only)',
    'CPU threads': profile.hardwareConcurrency ?? '(unknown)',
    'free storage': profile.storageFreeBytes !== null ? fmtBytes(profile.storageFreeBytes) : '(unknown)',
    'metered connection': profile.isMetered ? 'yes' : 'no',
    mobile: profile.isMobile ? `yes (${profile.isIOS ? 'iOS' : 'Android'})` : 'no',
  });
  console.groupEnd();
  return profile;
}

async function models() {
  const profile = await probeDevice();
  const rows = assessAllModels(profile);
  console.group('%c🧠 Local models on this device', 'font-weight:bold;font-size:13px');
  console.table(
    rows.map(({ model, availability }) => ({
      model: model.name,
      size: formatSize(model.vramMB),
      f16: model.needsF16 ? 'required' : 'not needed',
      status: availability.recommended
        ? '★ recommended'
        : availability.usable
          ? 'usable'
          : 'unavailable',
      note: availability.blockedReason ?? availability.warnings[0] ?? '',
    })),
  );
  console.log(`Currently selected: ${aiManager.getSelectedModelId()}`);
  console.groupEnd();
  return rows;
}

async function engines() {
  const caps = await aiManager.refreshCapabilities();
  console.group('%c⚙️  AI engines', 'font-weight:bold;font-size:13px');
  console.log(`Active: ${AI_ENGINE_LABELS[aiManager.getActiveEngine()]}`);
  console.table({
    'Built-in pattern rules': 'always available',
    'Local model (WebGPU)': caps.webgpu ? 'available' : 'no usable GPU adapter',
    'Chrome built-in AI': caps.chromeBuiltIn ? 'available' : caps.chromeBuiltInReason ?? 'unavailable',
    'Gemini (your key)': caps.hasGeminiKey ? 'key stored' : 'NO KEY — add one in the engine picker',
  });
  console.groupEnd();
  return caps;
}

function key() {
  const k = getApiKey();
  console.log(
    hasApiKey()
      ? `Gemini key stored: ${maskApiKey(k!)}  (open the engine picker to change or remove it)`
      : 'No Gemini key stored. Open the AI engine picker (header) → "Gemini, with your API key".',
  );
}

function status() {
  const p = aiManager.getProgress();
  console.group('%c📡 Current status', 'font-weight:bold;font-size:13px');
  console.log('Engine:', AI_ENGINE_LABELS[aiManager.getActiveEngine()]);
  console.log('State :', p.status);
  console.log('Text  :', p.text);
  if (p.status === 'downloading') console.log('Progress:', `${Math.round(p.progress * 100)}%`);
  if (p.errorMessage) console.log('Error :', p.errorMessage);
  if (p.warnings?.length) console.log('Warnings:', p.warnings);
  console.groupEnd();
}

async function report() {
  console.group('%c🔎 Strudel AI — full report', 'font-weight:bold;font-size:14px');
  await engines();
  await device();
  await models();
  await cache();
  status();
  console.groupEnd();
}

/** The whole session as one pasteable block. */
async function dump(): Promise<string> {
  const text = await formatTrace();
  console.log(text);
  console.log(
    '%c↑ Select all of the above and paste it into your bug report. ' +
      'strudel.copy() puts it on the clipboard instead.',
    'color:#059669;font-weight:bold',
  );
  return text;
}

/**
 * Copies the trace to the clipboard.
 *
 * Three ways, because the first one does not work where this is actually used.
 * `navigator.clipboard.writeText` needs transient user activation, and typing
 * `strudel.copy()` into DevTools is not activation — the very first thing in
 * the session trace that prompted this work was "Clipboard blocked (needs a
 * user gesture or permission)", from a user who was trying to send us that
 * trace.
 */
async function copy(): Promise<void> {
  const text = await formatTrace();
  const ok = (how: string) =>
    console.log(
      `%c✓ Session trace copied ${how} — ${getEntries().length} entries, ${text.length} chars. Paste it anywhere.`,
      'color:#059669;font-weight:bold',
    );

  try {
    await navigator.clipboard.writeText(text);
    ok('');
    return;
  } catch {
    /* no transient activation — fall through */
  }

  // The old synchronous path. Needs the document focused but not a gesture,
  // so it succeeds whenever the page itself has focus.
  try {
    window.focus();
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(ta);
    if (copied) {
      ok('(via the page)');
      return;
    }
  } catch {
    /* fall through to the armed copy handler */
  }

  // Last resort: arm the next ⌘C / Ctrl+C anywhere on the page.
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData('text/plain', text);
    e.preventDefault();
    document.removeEventListener('copy', onCopy, true);
    ok('(via your keyboard)');
  };
  document.addEventListener('copy', onCopy, true);
  console.log(
    '%cThe clipboard needs a keypress from you.\n' +
      'Click anywhere on the page, then press ⌘C (Ctrl+C on Windows) — the trace will be copied.\n' +
      'Or run strudel.save() to download it as a file, or strudel.dump() to print it here.',
    'color:#d97706;font-weight:bold',
  );
}

/** Saves the trace as a .txt file. */
async function save(): Promise<void> {
  const text = await formatTrace();
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `strudel-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next turn of the event loop so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  console.log('%c✓ Trace saved to your downloads.', 'color:#059669;font-weight:bold');
}

function reset(): void {
  clearTrace();
  console.log('Session trace cleared. Reproduce the problem now, then run strudel.copy().');
}

function help() {
  console.log(
    `%cStrudel AI console

%cstrudel.report()%c    everything below, in one go
%cstrudel.engines()%c   which engines are available and why
%cstrudel.device()%c    GPU, memory, storage, mobile detection
%cstrudel.models()%c    which local models will run here, and which is recommended
%cstrudel.cache()%c     what is cached and how much storage is left
%cstrudel.status()%c    what the active engine is doing right now
%cstrudel.key()%c       whether a Gemini key is stored (masked)
%cstrudel.debug(true)%c verbose logging of every AI call (persists across reloads)
%cstrudel.cancel()%c    abort the in-flight generation or download

%cREPORTING A PROBLEM%c
%cstrudel.copy()%c       copy the whole session trace to the clipboard  ← use this
%cstrudel.dump()%c       print the trace instead
%cstrudel.save()%c       download the trace as a .txt file
%cstrudel.reset()%c      clear the trace, then reproduce the problem cleanly

The trace is recorded ALWAYS, whether or not verbose logging is on, so you can
capture a problem after it happens. Verbose console output is currently %c${isDebugEnabled() ? 'ON' : 'OFF'}%c.`,
    'font-weight:bold;font-size:13px',
    ...Array(9).fill(['color:#059669;font-weight:600', 'color:inherit']).flat(),
    'font-weight:bold', 'color:inherit',
    ...Array(4).fill(['color:#059669;font-weight:600', 'color:inherit']).flat(),
    isDebugEnabled() ? 'color:#059669;font-weight:bold' : 'color:#d97706;font-weight:bold',
    'color:inherit',
  );
}

export function installConsoleApi(): void {
  if (typeof window === 'undefined') return;

  const api = {
    report,
    engines,
    device,
    models,
    cache,
    status,
    key,
    help,
    debug: setDebug,
    cancel: () => aiManager.cancel(),
    dump,
    copy,
    save,
    reset,
    entries: getEntries,
  };

  (window as any).strudel = api;

  console.log(
    `%cStrudel AI Live Studio%c — %cstrudel.help()%c for diagnostics, ` +
      `%cstrudel.copy()%c to grab a full session trace for a bug report`,
    'color:#059669;font-weight:bold;font-size:13px',
    'color:inherit',
    'color:#059669;font-weight:600',
    'color:inherit',
    'color:#059669;font-weight:600',
    'color:inherit',
  );

  // Uncaught failures belong in the trace — they are exactly what a user
  // cannot describe accurately after the fact.
  window.addEventListener('error', (e) => {
    event('app', `UNCAUGHT ERROR: ${e.message}`, {
      source: `${e.filename}:${e.lineno}:${e.colno}`,
      stack: e.error?.stack?.split('\n').slice(0, 4).join('\n'),
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    event('app', `UNHANDLED PROMISE REJECTION: ${(e.reason as any)?.message ?? e.reason}`, {
      stack: (e.reason as any)?.stack?.split('\n').slice(0, 4).join('\n'),
    });
  });
  window.addEventListener('online', () => event('app', 'network ONLINE'));
  window.addEventListener('offline', () => event('app', 'network OFFLINE'));

  event('app', `session started — ${location.href}`);
}

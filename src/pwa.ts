/**
 * Progressive Web App lifecycle: installation, updates, and knowing which of
 * those the browser will actually let us offer.
 *
 * Three things make this less trivial than "call registerSW()".
 *
 * 1. UPDATES MUST NOT LAND MID-SESSION.
 *    The service worker used `registerType: 'autoUpdate'`, which is
 *    `skipWaiting` + `clientsClaim`: a new worker takes control of the open
 *    page the moment it installs. The page is still running the old bundle,
 *    and its lazily imported chunks — `@strudel/transpiler`, 362 kB, loaded
 *    the first time a pattern is validated — are addressed by a content hash
 *    that the new precache no longer contains. So deploying while somebody is
 *    playing could silently downgrade their validation to structural-only.
 *    This app is used for live performance; an update is now offered and
 *    applied when the user says so.
 *
 * 2. INSTALLATION IS NOT OFFERABLE THE SAME WAY EVERYWHERE.
 *    Chromium fires `beforeinstallprompt`, which must be captured and can only
 *    be replayed inside a user gesture. Safari fires nothing at all and has no
 *    API — on iOS the only route is Share -> Add to Home Screen, so the honest
 *    thing is to say so rather than show a button that cannot work. Firefox
 *    has neither.
 *
 * 3. THE ANSWERS CHANGE AT RUNTIME.
 *    `beforeinstallprompt` can fire seconds after load, and `appinstalled`
 *    fires while the page is open. Anything rendering install state has to
 *    subscribe rather than read once.
 *
 * Everything here reports into the session trace, on the same principle as the
 * rest of the app: a user who says "it won't install" should be able to send
 * back a trace that says why.
 */

import { registerSW } from 'virtual:pwa-register';
import { event, log, warn } from './ai/diagnostics';

/** The Chromium-only event. Not in lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallRoute =
  /** Chromium captured a prompt; `promptInstall()` will work. */
  | 'prompt'
  /** iOS/iPadOS Safari: no API, show the Share-sheet instructions. */
  | 'ios-manual'
  /** Already running as an installed app. */
  | 'installed'
  /** No route we can offer (Firefox, an unsupported context, or too early). */
  | 'unavailable';

export interface PwaState {
  installRoute: InstallRoute;
  /** A new version is downloaded and waiting for the user to accept it. */
  updateReady: boolean;
  /** The app shell is cached and the app will start with no network. */
  offlineReady: boolean;
  online: boolean;
}

type Listener = (state: PwaState) => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

const state: PwaState = {
  installRoute: 'unavailable',
  updateReady: false,
  offlineReady: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
};

const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener({ ...state });
}

export function subscribeToPwa(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...state });
  return () => {
    listeners.delete(listener);
  };
}

export function getPwaState(): PwaState {
  return { ...state };
}

/**
 * True when the page is running as an installed app rather than in a tab.
 *
 * `display-mode: standalone` covers Chromium and Android; iOS Safari does not
 * report it reliably and uses the legacy `navigator.standalone` instead.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const byDisplayMode = ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'].some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches,
  );
  return byDisplayMode || (navigator as any).standalone === true;
}

/** iOS and iPadOS, including iPadOS pretending to be a Mac. */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iP(hone|od|ad)/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function recomputeInstallRoute() {
  const previous = state.installRoute;
  if (isStandalone()) state.installRoute = 'installed';
  else if (deferredPrompt) state.installRoute = 'prompt';
  else if (isIOS()) state.installRoute = 'ios-manual';
  else state.installRoute = 'unavailable';

  if (state.installRoute !== previous) {
    log('pwa', `install route: ${previous} -> ${state.installRoute}`);
    emit();
  }
}

/**
 * Shows the browser's install dialog. Chromium only, and only inside a user
 * gesture — the captured event is single-use and is discarded either way.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) {
    warn('pwa', 'install requested but no prompt was captured');
    return 'unavailable';
  }
  const prompt = deferredPrompt;
  // Consumed whatever happens: the spec allows a prompt to be used once, and
  // holding a stale one leaves a button that silently does nothing.
  deferredPrompt = null;

  try {
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    event('pwa', `install dialog ${outcome}`);
    recomputeInstallRoute();
    return outcome;
  } catch (err: any) {
    warn('pwa', `install prompt failed — ${err?.message ?? err}`);
    recomputeInstallRoute();
    return 'unavailable';
  }
}

/** Activates the waiting service worker and reloads onto the new version. */
export async function applyPendingUpdate(): Promise<void> {
  if (!applyUpdate) return;
  event('pwa', 'applying the pending update and reloading');
  await applyUpdate(true);
}

/**
 * Wires up the service worker and the install/online listeners.
 *
 * Call once, from the entry point, before React renders.
 */
export function initPwa(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Suppress Chromium's own mini-infobar so the offer appears where the rest
    // of the app's affordances are, not over the transport controls.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    event('pwa', 'browser says this is installable');
    recomputeInstallRoute();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    event('pwa', 'INSTALLED');
    recomputeInstallRoute();
  });

  const setOnline = (online: boolean) => {
    if (state.online === online) return;
    state.online = online;
    event('pwa', online ? 'back online' : 'OFFLINE — local engines only');
    emit();
  };
  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));

  // A display-mode change means the user just launched the installed copy, or
  // popped it back into a tab.
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => {
    recomputeInstallRoute();
  });

  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      state.updateReady = true;
      event('pwa', 'a new version is ready and waiting for the user to accept it');
      emit();
    },
    onOfflineReady() {
      state.offlineReady = true;
      event('pwa', 'app shell cached — this will now start with no network');
      emit();
    },
    onRegisteredSW(url, registration) {
      log('pwa', `service worker registered at ${url}`);
      if (!registration) return;
      // Check for a new deployment on an interval and whenever the window is
      // brought back to the front. Without this, a long-lived installed app
      // can sit on an old build indefinitely — nothing else triggers a check
      // once the page has loaded.
      const check = () => {
        if (navigator.onLine) void registration.update();
      };
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
    onRegisterError(err) {
      warn('pwa', `service worker registration failed — ${err?.message ?? err}`);
    },
  });

  recomputeInstallRoute();
  log(
    'pwa',
    `launch mode: ${isStandalone() ? 'installed app' : 'browser tab'}, route=${state.installRoute}`,
  );
}

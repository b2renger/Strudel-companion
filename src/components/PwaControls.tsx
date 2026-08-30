import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, WifiOff, X, Share } from 'lucide-react';
import {
  subscribeToPwa,
  promptInstall,
  applyPendingUpdate,
  type PwaState,
} from '../pwa';
import { event as logEvent } from '../ai/diagnostics';

/**
 * The install offer, the update offer and the offline indicator.
 *
 * Rendered as one fixed stack rather than threaded through the header, because
 * all three are transient and none of them belongs in the layout when they are
 * not showing. Anchored to the bottom with `env(safe-area-inset-bottom)` so it
 * clears the iPhone home indicator when the app is running installed, where
 * there is no browser chrome to sit above.
 *
 * Priority is deliberate: an update the user has not taken matters more than
 * an install they have not taken, and being offline matters more than either
 * because it changes which engines can run.
 */

const DISMISS_KEY = 'strudel_pwa_install_dismissed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    // Private mode, or storage blocked. Offering the install again is the
    // harmless direction to be wrong in.
    return false;
  }
}

function rememberDismissal() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* nothing to remember it with */
  }
}

export const PwaControls: React.FC = () => {
  const [pwa, setPwa] = useState<PwaState | null>(null);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => subscribeToPwa(setPwa), []);

  if (!pwa) return null;

  const showUpdate = pwa.updateReady;
  const showOffline = !pwa.online;
  const showInstall =
    !dismissed && (pwa.installRoute === 'prompt' || pwa.installRoute === 'ios-manual');

  if (!showUpdate && !showOffline && !showInstall) return null;

  const handleInstall = async () => {
    if (pwa.installRoute === 'ios-manual') {
      logEvent('pwa', 'showing the iOS Add to Home Screen instructions');
      setShowIosHelp(true);
      return;
    }
    logEvent('pwa', 'CLICK Install app');
    const outcome = await promptInstall();
    if (outcome === 'dismissed') {
      // Do not nag. The browser's own omnibox affordance remains.
      setDismissed(true);
      rememberDismissal();
    }
  };

  const handleDismissInstall = () => {
    logEvent('pwa', 'install offer dismissed');
    setDismissed(true);
    rememberDismissal();
  };

  return (
    <div
      className="fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-3 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      {showOffline && (
        <div
          role="status"
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-mono text-amber-900 shadow-sm"
        >
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>Offline — local engines and playback still work; Gemini does not.</span>
        </div>
      )}

      {showUpdate && (
        <div
          role="status"
          className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11px] font-mono text-emerald-900 shadow-md"
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          <span>A new version is ready.</span>
          <button
            onClick={() => {
              logEvent('pwa', 'CLICK Reload for the new version');
              void applyPendingUpdate();
            }}
            className="min-h-8 rounded-lg bg-emerald-600 px-2.5 font-bold uppercase text-white transition-colors hover:bg-emerald-700"
          >
            Reload
          </button>
          <span className="text-emerald-700/80">Your pattern is not saved automatically.</span>
        </div>
      )}

      {showInstall && !showUpdate && (
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-gray-300 bg-[var(--app-card-1)] py-1.5 pl-3 pr-1.5 text-[11px] font-mono text-gray-800 shadow-md">
          <Download className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span className="hidden sm:inline">Install for offline use</span>
          <span className="sm:hidden">Install</span>
          <button
            onClick={handleInstall}
            className="min-h-8 rounded-lg bg-emerald-600 px-2.5 font-bold uppercase text-white transition-colors hover:bg-emerald-700"
          >
            {pwa.installRoute === 'ios-manual' ? 'How' : 'Install'}
          </button>
          <button
            onClick={handleDismissInstall}
            aria-label="Dismiss the install offer"
            className="min-h-8 rounded-lg px-1.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showIosHelp && (
        // Safari exposes no install API at all, so the only honest thing to
        // offer on iOS is the manual route.
        <div
          role="dialog"
          aria-label="Add to Home Screen"
          className="pointer-events-auto w-full max-w-sm rounded-xl border border-gray-300 bg-[var(--app-card-1)] p-3 text-[11px] font-mono text-gray-800 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold uppercase">Add to Home Screen</span>
            <button
              onClick={() => setShowIosHelp(false)}
              aria-label="Close"
              className="min-h-8 rounded-lg px-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ol className="list-decimal space-y-1 pl-4 text-gray-700">
            <li>
              Tap the Share button{' '}
              <Share className="inline h-3 w-3 align-[-2px] text-emerald-600" /> in Safari&rsquo;s
              toolbar.
            </li>
            <li>
              Scroll down and choose <strong>Add to Home Screen</strong>.
            </li>
            <li>Tap Add. The studio then opens full screen and works offline.</li>
          </ol>
          <p className="mt-2 text-[10px] text-gray-600">
            This only works in Safari — Chrome and Firefox on iOS cannot install web apps.
          </p>
        </div>
      )}
    </div>
  );
};

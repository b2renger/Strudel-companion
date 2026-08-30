import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Cpu,
  Zap,
  Cloud,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  DownloadCloud,
  X,
  HardDrive,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  Ban,
} from 'lucide-react';
import { aiManager, EngineCapabilities } from '../ai/aiManager';
import { AIEngineType, AIEngineProgress } from '../types';
// The model catalogue lives in its own module. Importing it from the worker
// dragged the whole of @mlc-ai/web-llm into the main bundle on every page load.
import { WEBGPU_MODELS, formatSize } from '../ai/models';
import { assessAllModels } from '../ai/deviceProbe';
import { getApiKey, setApiKey, clearApiKey, looksLikeApiKey } from '../ai/apiKeyStore';

interface AIEngineSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Every engine card states the same four facts, in the same order. */
interface EngineFacts {
  id: AIEngineType;
  name: string;
  icon: React.ReactNode;
  download: string;
  speed: string;
  offline: string;
  privacy: string;
  blurb: string;
}

const ENGINES: EngineFacts[] = [
  {
    id: 'instant-heuristic',
    name: 'Built-in pattern rules',
    icon: <Zap className="w-4 h-4" />,
    download: 'Nothing to download',
    speed: 'Instant',
    offline: 'Works offline',
    privacy: 'Nothing leaves your device',
    blurb:
      'Not a language model. Builds patterns from hand-written musical templates, so it is instant and always available — but it does not truly understand your words.',
  },
  {
    id: 'webgpu-gemma',
    name: 'Local model on your GPU',
    icon: <Cpu className="w-4 h-4" />,
    download: 'One download, then cached',
    speed: 'Slow — seconds to a minute',
    offline: 'Works offline once downloaded',
    privacy: 'Nothing leaves your device',
    blurb:
      'Runs a real language model in your browser using WebGPU. Best quality without an account, at the cost of a large first download.',
  },
  {
    id: 'chrome-builtin',
    name: 'Chrome built-in AI',
    icon: <Sparkles className="w-4 h-4" />,
    download: 'Managed by Chrome',
    speed: 'Fast',
    offline: 'Works offline once Chrome has it',
    privacy: 'Nothing leaves your device',
    blurb:
      'Uses Gemini Nano, built into desktop Chrome. Chrome downloads and manages the model itself. Desktop only — it does not exist on phones.',
  },
  {
    id: 'cloud-gemini',
    name: 'Gemini, with your API key',
    icon: <Cloud className="w-4 h-4" />,
    download: 'Nothing to download',
    speed: 'Fast — a second or two',
    offline: 'Needs an internet connection',
    privacy: 'Your prompt and pattern are sent to Google',
    blurb:
      'The best musical results. Uses a free API key that you create and paste in below; it is stored only in this browser.',
  },
];

export const AIEngineSelectorModal: React.FC<AIEngineSelectorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeEngine, setActiveEngine] = useState<AIEngineType>(aiManager.getActiveEngine());
  const [selectedModel, setSelectedModel] = useState<string>(aiManager.getSelectedModelId());
  const [progress, setProgress] = useState<AIEngineProgress>(aiManager.getProgress());
  const [caps, setCaps] = useState<EngineCapabilities>(aiManager.getCapabilities());
  const [keyInput, setKeyInput] = useState<string>(getApiKey() || '');
  const [showKey, setShowKey] = useState(false);
  const [keyNotice, setKeyNotice] = useState<string | null>(null);
  const [cacheNote, setCacheNote] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubEngine = aiManager.onEngineChange(setActiveEngine);
    const unsubProgress = aiManager.onProgress(setProgress);
    // Subscribe rather than snapshot: the hardware probe is async, so a
    // one-shot read at mount always saw "unsupported".
    const unsubCaps = aiManager.onCapabilities(setCaps);
    return () => {
      unsubEngine();
      unsubProgress();
      unsubCaps();
    };
  }, []);

  // Re-probe when the dialog opens, and report live storage figures.
  useEffect(() => {
    if (!isOpen) return;
    void aiManager.refreshCapabilities();
    void (async () => {
      try {
        const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) || {};
        setCacheNote(
          quota
            ? `${formatSize(usage / 1048576)} used of about ${formatSize(quota / 1048576)} available to this site.`
            : null,
        );
      } catch {
        setCacheNote(null);
      }
    })();
  }, [isOpen]);

  // Escape to close, and focus the dialog so the keyboard reaches it.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  const assessed = useMemo(
    () => (caps.device ? assessAllModels(caps.device) : []),
    [caps.device],
  );
  const currentAssessment = assessed.find((a) => a.model.id === selectedModel);
  const isBusy = progress.status === 'downloading';

  if (!isOpen) return null;

  const engineAvailability = (id: AIEngineType): { ok: boolean; reason?: string } => {
    if (id === 'instant-heuristic') return { ok: true };
    if (id === 'webgpu-gemma') {
      return caps.webgpu
        ? { ok: true }
        : { ok: false, reason: 'This device has no usable WebGPU adapter.' };
    }
    if (id === 'chrome-builtin') {
      return caps.chromeBuiltIn ? { ok: true } : { ok: false, reason: caps.chromeBuiltInReason };
    }
    return caps.hasGeminiKey
      ? { ok: true }
      : { ok: false, reason: 'Add your API key below to enable this engine.' };
  };

  /** Selecting an engine never starts a download — that needs its own click. */
  const handleSelectEngine = async (engine: AIEngineType) => {
    await aiManager.setEngine(engine);
  };

  const handleSelectModel = async (modelId: string) => {
    setSelectedModel(modelId);
    await aiManager.setModel(modelId);
  };

  const handleDownload = async () => {
    await aiManager.preloadModel();
  };

  const handleSaveKey = async () => {
    const trimmed = keyInput.trim();
    if (trimmed && !looksLikeApiKey(trimmed)) {
      setKeyNotice('That does not look like an API key. Paste the whole key.');
      return;
    }
    setApiKey(trimmed);
    setKeyNotice(trimmed ? 'Key saved in this browser.' : 'Key removed.');
    await aiManager.refreshCapabilities();
  };

  const handleForgetKey = async () => {
    clearApiKey();
    setKeyInput('');
    setKeyNotice('Key removed from this browser.');
    await aiManager.refreshCapabilities();
  };

  const handleClearCache = async () => {
    let deleted = 0;
    try {
      const keys = await caches.keys();
      for (const k of keys) {
        if (/webllm|mlc|model/i.test(k)) {
          if (await caches.delete(k)) deleted++;
        }
      }
    } catch {
      /* Cache Storage may be unavailable */
    }
    // Reports what actually happened. The old version always claimed success,
    // even when nothing had been cached.
    setCacheNote(
      deleted > 0
        ? `Removed ${deleted} cached model store${deleted === 1 ? '' : 's'}.`
        : 'No cached model weights were found to remove.',
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs font-mono">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-engine-title"
        tabIndex={-1}
        className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90dvh] outline-none"
      >
        <div className="p-4 sm:p-5 border-b border-gray-200 flex items-start justify-between gap-3 bg-gray-50/70">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="ai-engine-title" className="text-sm sm:text-base font-bold text-gray-900">
                Choose how the AI runs
              </h2>
              <p className="text-[11px] text-gray-600">
                Each option trades download size, speed and privacy differently.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close AI engine settings"
            className="p-2.5 min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 flex items-center justify-center text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Live progress, with a way out of it. */}
          {(isBusy || progress.status === 'error') && (
            <div
              className={`rounded-xl p-3.5 space-y-2 border ${
                progress.status === 'error'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-xs">
                <div
                  className={`flex items-center gap-2 font-bold min-w-0 ${
                    progress.status === 'error' ? 'text-red-900' : 'text-emerald-900'
                  }`}
                >
                  {progress.status === 'error' ? (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  ) : (
                    <DownloadCloud className="w-4 h-4 shrink-0" />
                  )}
                  <span className="truncate">{progress.text}</span>
                </div>
                {isBusy && (
                  <span className="font-bold text-emerald-700 shrink-0">
                    {Math.round(progress.progress * 100)}%
                  </span>
                )}
              </div>

              {isBusy && (
                <>
                  <div
                    role="progressbar"
                    aria-valuenow={Math.round(progress.progress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Model download progress"
                    className="w-full bg-emerald-200/60 rounded-full h-2 overflow-hidden"
                  >
                    <div
                      className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(2, progress.progress * 100)}%` }}
                    />
                  </div>
                  <button
                    onClick={() => aiManager.cancel()}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-900 hover:text-red-700 min-h-11 sm:min-h-0"
                  >
                    <Ban className="w-3.5 h-3.5" /> Cancel download
                  </button>
                </>
              )}

              {progress.errorMessage && progress.status === 'error' && (
                <p className="text-[11px] text-red-800">{progress.errorMessage}</p>
              )}
            </div>
          )}

          {(progress.warnings || []).map((w) => (
            <p key={w} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              {w}
            </p>
          ))}

          {/* Engine cards */}
          <div className="space-y-2.5">
            {ENGINES.map((engine) => {
              const avail = engineAvailability(engine.id);
              const isActive = activeEngine === engine.id;
              return (
                <button
                  key={engine.id}
                  onClick={() => handleSelectEngine(engine.id)}
                  disabled={!avail.ok}
                  aria-pressed={isActive}
                  className={`w-full text-left rounded-xl border p-3.5 transition-colors ${
                    isActive
                      ? 'border-emerald-500 bg-emerald-50/60'
                      : avail.ok
                        ? 'border-gray-200 hover:border-gray-300 bg-white'
                        : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="text-emerald-600 shrink-0">{engine.icon}</span>
                    <span className="text-sm font-bold text-gray-900">{engine.name}</span>
                    {isActive && (
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> In use
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-gray-700 mb-2">{engine.blurb}</p>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-gray-700">
                    <div><dt className="inline font-bold">Download: </dt><dd className="inline">{engine.download}</dd></div>
                    <div><dt className="inline font-bold">Speed: </dt><dd className="inline">{engine.speed}</dd></div>
                    <div><dt className="inline font-bold">Offline: </dt><dd className="inline">{engine.offline}</dd></div>
                    <div><dt className="inline font-bold">Privacy: </dt><dd className="inline">{engine.privacy}</dd></div>
                  </dl>

                  {!avail.ok && avail.reason && (
                    <p className="mt-2 text-[10px] text-amber-800 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{avail.reason}</span>
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Local model picker — shown BEFORE any download begins. */}
          {activeEngine === 'webgpu-gemma' && (
            <section className="space-y-2.5 border-t border-gray-200 pt-4">
              <h3 className="text-xs font-bold text-gray-900">Pick a model for this device</h3>
              {caps.device && (
                <p className="text-[10px] text-gray-600">
                  {caps.device.hasF16
                    ? 'Your GPU supports 16-bit shaders.'
                    : 'Your GPU has no 16-bit shader support, so most builds are unavailable here.'}
                  {caps.device.isMobile ? ' Detected a phone or tablet.' : ''}
                </p>
              )}

              {(assessed.length ? assessed : WEBGPU_MODELS.map((m) => ({ model: m, availability: { usable: true, recommended: false, warnings: [] as string[], blockedReason: undefined } }))).map(
                ({ model, availability }) => {
                  const selected = selectedModel === model.id;
                  return (
                    <button
                      key={model.id}
                      onClick={() => handleSelectModel(model.id)}
                      disabled={!availability.usable}
                      aria-pressed={selected}
                      className={`w-full text-left rounded-xl border p-3 transition-colors ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50/60'
                          : availability.usable
                            ? 'border-gray-200 hover:border-gray-300 bg-white'
                            : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-900">{model.name}</span>
                        <span className="text-[10px] text-gray-600">
                          about {formatSize(model.vramMB)}
                        </span>
                        {availability.recommended && (
                          <span className="text-[10px] font-bold text-emerald-700">
                            Best for this device
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-700 mt-1">{model.description}</p>
                      {availability.blockedReason && (
                        <p className="mt-1.5 text-[10px] text-amber-800">{availability.blockedReason}</p>
                      )}
                      {availability.warnings.map((w) => (
                        <p key={w} className="mt-1.5 text-[10px] text-amber-800 flex items-start gap-1.5">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{w}</span>
                        </p>
                      ))}
                    </button>
                  );
                },
              )}

              <button
                onClick={handleDownload}
                disabled={isBusy || currentAssessment?.availability.usable === false}
                className="w-full min-h-11 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isBusy
                  ? 'Downloading…'
                  : `Download and load this model (about ${formatSize(
                      currentAssessment?.model.vramMB ?? 0,
                    )})`}
              </button>
              <p className="text-[10px] text-gray-600">
                Downloads once and is kept in this browser. It is not sent anywhere.
              </p>
            </section>
          )}

          {/* API key */}
          {activeEngine === 'cloud-gemini' && (
            <section className="space-y-2.5 border-t border-gray-200 pt-4">
              <h3 className="text-xs font-bold text-gray-900">Your Gemini API key</h3>
              <p className="text-[10px] text-gray-700">
                Create a free key in Google AI Studio, then paste it here. It is stored only in
                this browser and sent only to Google.{' '}
                <strong>
                  Restrict the key to this site by HTTP referrer — anyone with the key can spend
                  your quota.
                </strong>
              </p>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 hover:underline min-h-11"
              >
                Get a free API key <ExternalLink className="w-3 h-3" />
              </a>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <label htmlFor="gemini-key" className="sr-only">
                    Gemini API key
                  </label>
                  <input
                    id="gemini-key"
                    type={showKey ? 'text' : 'password'}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Paste your API key"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full min-h-11 rounded-lg border border-gray-300 px-3 pr-11 text-xs text-gray-900 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-gray-500 hover:text-gray-900"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={handleSaveKey}
                  className="min-h-11 px-4 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                >
                  Save
                </button>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleForgetKey}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-700 hover:text-red-700 min-h-11"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Forget my key
                </button>
                {keyNotice && <span className="text-[11px] text-emerald-700">{keyNotice}</span>}
              </div>
              <p className="text-[10px] text-gray-600">
                The free tier allows only a handful of requests per minute. If you hit the limit,
                wait a moment or switch to a local engine.
              </p>
            </section>
          )}

          {/* Storage */}
          <section className="border-t border-gray-200 pt-4 space-y-2">
            <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" /> Storage
            </h3>
            <p className="text-[10px] text-gray-600">
              {cacheNote || 'Storage usage is not reported by this browser.'}
            </p>
            <button
              onClick={handleClearCache}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-700 hover:text-red-700 min-h-11"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete downloaded model weights
            </button>
          </section>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50/70">
          <button
            onClick={onClose}
            className="w-full min-h-11 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

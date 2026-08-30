import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Zap,
  Cloud,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  DownloadCloud,
  Layers,
  X,
  HardDrive,
  Trash2,
  RefreshCw,
  Info,
} from 'lucide-react';
import { aiManager } from '../ai/aiManager';
import { AIEngineType, AIEngineProgress } from '../types';
import { SUPPORTED_WEBGPU_MODELS } from '../workers/aiWorker';

interface AIEngineSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIEngineSelectorModal: React.FC<AIEngineSelectorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeEngine, setActiveEngine] = useState<AIEngineType>(aiManager.getActiveEngine());
  const [selectedModel, setSelectedModel] = useState<string>(aiManager.getSelectedModelId());
  const [progress, setProgress] = useState<AIEngineProgress>(aiManager.getProgress());
  const [hardware, setHardware] = useState(aiManager.getCapabilities());
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);
  const [cacheStatus, setCacheStatus] = useState<string>('Weights stored locally in CacheStorage / IndexedDB');

  useEffect(() => {
    const unsubEngine = aiManager.onEngineChange((engine) => setActiveEngine(engine));
    const unsubProgress = aiManager.onProgress((p) => setProgress(p));
    setHardware(aiManager.getCapabilities());

    return () => {
      unsubEngine();
      unsubProgress();
    };
  }, []);

  if (!isOpen) return null;

  const handleSelectEngine = async (engine: AIEngineType) => {
    setActiveEngine(engine);
    await aiManager.setEngine(engine, true);
  };

  const handleSelectModel = async (modelId: string) => {
    setSelectedModel(modelId);
    if (activeEngine === 'webgpu-gemma') {
      await aiManager.initWebGPUWorker(modelId);
    }
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        for (const k of keys) {
          if (k.includes('webllm') || k.includes('mlc') || k.includes('gemma')) {
            await caches.delete(k);
          }
        }
      }
      if (typeof indexedDB !== 'undefined') {
        // Clear webllm databases
        indexedDB.deleteDatabase('_webllm_wasm_cache');
      }
      setCacheStatus('Model weight cache cleared successfully.');
    } catch (e: any) {
      setCacheStatus('Error clearing cache: ' + e.message);
    } finally {
      setIsClearingCache(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs font-mono animate-in fade-in duration-150">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-2">
                AI Engine & Local WebGPU Runtime
              </h2>
              <p className="text-[11px] text-gray-500">
                Choose between instant on-device inference, local Gemma neural weights, or cloud models.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Progress / Download Status Banner */}
          {progress.status === 'downloading' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <DownloadCloud className="w-4 h-4 text-emerald-600 animate-bounce" />
                  <span>Downloading Model Weights to WebGPU...</span>
                </div>
                <span className="font-bold text-emerald-700">
                  {Math.round(progress.progress * 100)}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-emerald-200/60 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, progress.progress * 100)}%` }}
                />
              </div>

              <p className="text-[10px] text-emerald-700 truncate">{progress.text}</p>
            </div>
          )}

          {/* Engine Selection Grid */}
          <div className="space-y-3">
            <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block">
              Select Inference Backend
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Instant Heuristics */}
              <button
                onClick={() => handleSelectEngine('instant-heuristic')}
                className={`p-3.5 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${
                  activeEngine === 'instant-heuristic'
                    ? 'border-emerald-500 bg-emerald-50/50 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-xs text-gray-900">Instant Heuristic</span>
                  </div>
                  {activeEngine === 'instant-heuristic' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Zero download (0 MB), zero latency (0 ms), runs purely offline with algorithmic music rules.
                </p>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100">0 MB</span>
                  <span className="px-1.5 py-0.5 rounded bg-gray-100">Instant</span>
                </div>
              </button>

              {/* Option 2: Local WebGPU Gemma 2B */}
              <button
                onClick={() => handleSelectEngine('webgpu-gemma')}
                className={`p-3.5 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${
                  activeEngine === 'webgpu-gemma'
                    ? 'border-emerald-500 bg-emerald-50/50 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-xs text-gray-900">Local WebGPU Gemma</span>
                  </div>
                  {activeEngine === 'webgpu-gemma' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Real Google Gemma neural network running locally on your GPU via Web Worker.
                </p>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
                  <span className={`px-1.5 py-0.5 rounded ${hardware.webgpu ? 'bg-emerald-100' : 'bg-red-100 text-red-700'}`}>
                    {hardware.webgpu ? 'WebGPU Supported' : 'No WebGPU'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-gray-100">~1.4 GB Cached</span>
                </div>
              </button>

              {/* Option 3: Chrome Built-in AI (Nano) */}
              <button
                onClick={() => handleSelectEngine('chrome-builtin')}
                className={`p-3.5 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${
                  activeEngine === 'chrome-builtin'
                    ? 'border-cyan-500 bg-cyan-50/50 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-600" />
                    <span className="font-bold text-xs text-gray-900">Chrome Built-in AI</span>
                  </div>
                  {activeEngine === 'chrome-builtin' && (
                    <CheckCircle2 className="w-4 h-4 text-cyan-600" />
                  )}
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Native browser Prompt API (Gemini Nano). Instant on-device execution with 0 MB download.
                </p>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-cyan-700">
                  <span className={`px-1.5 py-0.5 rounded ${hardware.chromeBuiltIn ? 'bg-cyan-100' : 'bg-gray-100 text-gray-500'}`}>
                    {hardware.chromeBuiltIn ? 'Available in Chrome' : 'Requires Chrome 128+ flags'}
                  </span>
                </div>
              </button>

              {/* Option 4: Cloud Gemini API */}
              <button
                onClick={() => handleSelectEngine('cloud-gemini')}
                className={`p-3.5 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${
                  activeEngine === 'cloud-gemini'
                    ? 'border-indigo-500 bg-indigo-50/50 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-xs text-gray-900">Cloud Gemini 2.5 Flash</span>
                  </div>
                  {activeEngine === 'cloud-gemini' && (
                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  )}
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  High-capacity cloud model with multi-modal music intelligence and deep reasoning.
                </p>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-700">
                  <span className="px-1.5 py-0.5 rounded bg-indigo-100">Server Route</span>
                </div>
              </button>
            </div>
          </div>

          {/* WebGPU Model Choice (if WebGPU active) */}
          {activeEngine === 'webgpu-gemma' && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
              <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block">
                Local WebGPU Model Weights
              </label>

              <div className="space-y-2">
                {SUPPORTED_WEBGPU_MODELS.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => handleSelectModel(model.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between text-xs ${
                      selectedModel === model.id
                        ? 'border-emerald-500 bg-white shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white/60'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-gray-900 flex items-center gap-2">
                        <span>{model.name}</span>
                        <span className="px-1.5 py-0.2 rounded bg-gray-100 text-[10px] text-gray-600">
                          {model.size}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5">{model.description}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-mono text-emerald-700 font-bold">
                        {model.vram}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Cache Management */}
              <div className="pt-2 border-t border-gray-200 flex items-center justify-between text-[11px]">
                <span className="text-gray-500 truncate">{cacheStatus}</span>
                <button
                  onClick={handleClearCache}
                  disabled={isClearingCache}
                  className="px-2.5 py-1 rounded bg-gray-200 hover:bg-red-50 hover:text-red-700 text-gray-700 flex items-center gap-1 transition-colors text-[10px] font-bold"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{isClearingCache ? 'Clearing...' : 'Clear Model Cache'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Informational Box */}
          <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-blue-900">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-[11px] leading-relaxed text-blue-800">
              <p>
                <strong>Zero Audio Stutter Guarantee:</strong> All local neural network inference executes inside a dedicated Web Worker thread with WebGPU shaders. The Web Audio synthesizer clock runs uninterrupted.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50/70 flex items-center justify-between">
          <div className="text-[11px] text-gray-500">
            Active: <span className="font-bold text-gray-900 capitalize">{activeEngine.replace('-', ' ')}</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

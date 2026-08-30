import React from 'react';
import {
  Moon,
  Sun,
  Play,
  Square,
  Volume2,
  Sliders,
  Radio,
  Music,
  Activity,
  FolderOpen,
  Save,
  ExternalLink,
  Globe,
  Cpu,
  Zap,
  Sparkles,
  Cloud,
  DownloadCloud,
} from 'lucide-react';
import { aiManager } from '../ai/aiManager';


interface StudioHeaderProps {
  isPlaying: boolean;
  bpm: number;
  onTogglePlay: () => void;
  onBpmChange: (bpm: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  cutoff: number;
  onCutoffChange: (cutoff: number) => void;
  reverb: number;
  onReverbChange: (reverb: number) => void;
  currentCycle: number;
  onOpenPresets: () => void;
  onOpenGuide: () => void;
  onOpenSessions: () => void;
  onOpenExportRepl: () => void;
  onQuickSave: () => void;
  savedSessionsCount?: number;
  trackTitle?: string;
  onOpenAIEngine?: () => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  isPlaying,
  bpm,
  onTogglePlay,
  onBpmChange,
  volume,
  onVolumeChange,
  cutoff,
  onCutoffChange,
  reverb,
  onReverbChange,
  currentCycle,
  onOpenPresets,
  onOpenGuide,
  onOpenSessions,
  onOpenExportRepl,
  onQuickSave,
  savedSessionsCount = 0,
  trackTitle = 'Algorithmic Session',
  onOpenAIEngine,
}) => {
  const [isDark, setIsDark] = React.useState(false);
  const [quickSavedFeedback, setQuickSavedFeedback] = React.useState(false);
  const [activeEngine, setActiveEngine] = React.useState(aiManager.getActiveEngine());
  const [engineProgress, setEngineProgress] = React.useState(aiManager.getProgress());

  React.useEffect(() => {
    // Restore the saved choice, falling back to the OS preference. Previously
    // this only read the class off <html> — which is never set on a fresh
    // load — so dark mode reset on every reload and the system setting was
    // ignored entirely.
    let dark = false;
    try {
      const saved = localStorage.getItem('strudel_theme');
      dark = saved
        ? saved === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      dark = false;
    }
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);

    const unsubEngine = aiManager.onEngineChange((e) => setActiveEngine(e));
    const unsubProg = aiManager.onProgress((p) => setEngineProgress(p));
    return () => {
      unsubEngine();
      unsubProg();
    };
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('strudel_theme', next ? 'dark' : 'light');
    } catch {
      /* storage unavailable — the toggle still works for this session */
    }
  };

  const handleQuickSaveClick = () => {
    onQuickSave();
    setQuickSavedFeedback(true);
    setTimeout(() => setQuickSavedFeedback(false), 2000);
  };

  return (
    // `min-h-14` + `flex-wrap` instead of a fixed `h-14` with no wrap.
    //
    // The right-hand cluster alone needs roughly 280px of unshrinkable buttons,
    // which with the brand block overflowed a 390px phone by ~80px. `<body>`
    // then carried `overflow-x-hidden`, so the overflow was CLIPPED rather than
    // scrollable — on a sticky bar that never scrolls away, the theme toggle
    // and Guide button were permanently unreachable. Wrapping to a second row
    // is the fix; hiding the overflow was not.
    <header className="min-h-14 border-b border-gray-200 flex items-center flex-wrap gap-y-1.5 px-3 sm:px-6 py-1.5 justify-between bg-gray-50 text-gray-900 font-mono select-none sticky top-0 z-30 shadow-sm">
      {/* Left: Brand & Transport */}
      <div className="flex items-center gap-3 sm:gap-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 via-gray-200 to-pink-500 rounded-md flex items-center justify-center text-white dark:text-gray-900 font-extrabold text-xs shadow-md">
            S
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-gray-900 flex items-center gap-1.5 leading-none">
              STRUDEL <span className="text-emerald-600">AI</span>
              <span className="text-pink-600 text-[9px] font-mono px-1.5 py-0.5 bg-pink-500/10 border border-pink-500/30 rounded font-bold uppercase tracking-wider">
                LIVE
              </span>
            </span>
          </div>
        </div>

        <div className="h-6 w-[1px] bg-gray-200 hidden sm:block"></div>

        {/* Cycle status */}
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-gray-600">
          <span
            className={`w-2 h-2 rounded-full ${
              isPlaying
                ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#059669]'
                : 'bg-gray-300'
            }`}
          />
          <span className="text-gray-900 font-medium">
            {isPlaying ? `CYC #${currentCycle}` : 'IDLE'}
          </span>
        </div>
      </div>

      {/* Center/Right: High Density Telemetry & Modulation Knobs */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Track Title */}
        <div className="hidden md:flex flex-col">
          <span className="text-[8px] text-gray-600 uppercase tracking-wider font-semibold">
            Track
          </span>
          <span className="text-xs text-gray-800 font-medium uppercase truncate max-w-[120px]">
            {trackTitle}
          </span>
        </div>

        {/* LPF Cutoff */}
        <div className="hidden xl:flex flex-col">
          <div className="flex items-center justify-between text-[8px] text-gray-600 uppercase font-semibold">
            <span>LPF Cutoff</span>
            <span className="text-emerald-600 font-bold">
              {cutoff > 1000 ? `${(cutoff / 1000).toFixed(1)}k` : `${cutoff}`}Hz
            </span>
          </div>
          <input
            type="range"
            aria-label="Master low-pass filter cutoff"
            aria-valuetext={`${cutoff} hertz`}
            min={200}
            max={16000}
            step={100}
            value={cutoff}
            onChange={(e) => onCutoffChange(Number(e.target.value))}
            className="w-16 h-1.5 bg-gray-200 rounded-full mt-1 cursor-pointer accent-emerald-600"
          />
        </div>

        {/* Master Volume */}
        <div className="hidden lg:flex flex-col">
          <div className="flex items-center justify-between text-[8px] text-gray-600 uppercase font-semibold">
            <span>Vol</span>
            <span className="text-gray-900 font-bold">{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range"
            aria-label="Master volume"
            aria-valuetext={`${Math.round(volume * 100)} percent`}
            min={0}
            max={1.2}
            step={0.05}
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="w-14 h-1.5 bg-gray-200 rounded-full mt-1 cursor-pointer accent-pink-600"
          />
        </div>

        <div className="h-6 w-[1px] bg-gray-200 hidden sm:block"></div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1.5">
          {/* AI Engine Status & Switcher */}
          {onOpenAIEngine && (
            <button
              onClick={onOpenAIEngine}
              className={`px-2.5 py-1.5 rounded-md text-xs font-mono flex items-center gap-1.5 transition-all shadow-xs border ${
                engineProgress.status === 'downloading'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 animate-pulse'
                  : activeEngine === 'webgpu-gemma'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800'
                  : activeEngine === 'chrome-builtin'
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-800'
                  : activeEngine === 'cloud-gemini'
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-800'
                  : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-800'
              }`}
              title="Change AI Inference Engine (WebGPU Gemma, Chrome Built-in Nano, Heuristics, Cloud)" aria-label="Change AI Inference Engine (WebGPU Gemma, Chrome Built-in Nano, Heuristics, Cloud)"
            >
              {engineProgress.status === 'downloading' ? (
                <>
                  <DownloadCloud className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
                  <span className="font-bold text-[10px]">
                    {Math.round(engineProgress.progress * 100)}%
                  </span>
                </>
              ) : activeEngine === 'webgpu-gemma' ? (
                <>
                  <Cpu className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline font-bold">WebGPU</span>
                </>
              ) : activeEngine === 'chrome-builtin' ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
                  <span className="hidden sm:inline font-bold">Nano</span>
                </>
              ) : activeEngine === 'cloud-gemini' ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="hidden sm:inline font-bold">Cloud</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline font-bold">Heuristic</span>
                </>
              )}
            </button>
          )}

          {/* Quick Save Session Button */}
          <button
            onClick={handleQuickSaveClick}
            className={`px-2 py-1.5 border rounded-md text-xs flex items-center gap-1 transition-all font-mono shadow-sm uppercase ${
              quickSavedFeedback
                ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-800'
            }`}
            title="Quick save current workspace state" aria-label="Quick save current workspace state"
          >
            <Save className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline font-semibold">
              {quickSavedFeedback ? 'Saved!' : 'Save'}
            </span>
          </button>

          {/* Sessions Drawer Button */}
          <button
            id="open-sessions-btn"
            onClick={onOpenSessions}
            className="px-2.5 py-1.5 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 text-xs text-gray-800 flex items-center gap-1.5 transition-all font-mono shadow-sm"
            title="Open Saved Sessions & Variations" aria-label="Open Saved Sessions & Variations"
          >
            <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline font-semibold">Sessions</span>
            {savedSessionsCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-bold border border-emerald-500/30">
                {savedSessionsCount}
              </span>
            )}
          </button>

          {/* Send to Official Strudel REPL Button */}
          <button
            id="open-repl-export-btn"
            onClick={onOpenExportRepl}
            className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 rounded-md text-xs flex items-center gap-1.5 transition-all font-mono shadow-sm font-semibold uppercase"
            title="Send pattern to official Strudel REPL (strudel.cc)" aria-label="Send pattern to official Strudel REPL (strudel.cc)"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden md:inline">strudel.cc</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </button>

          {/* Preset Tracks */}
          <button
            id="open-presets-btn"
            onClick={onOpenPresets}
            className="px-2 py-1.5 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 text-xs text-gray-800 flex items-center gap-1.5 transition-all font-mono shadow-sm"
            title="Open Starter Track Presets" aria-label="Open Starter Track Presets"
          >
            <Music className="w-3.5 h-3.5 text-pink-600" />
            <span className="hidden lg:inline font-semibold">Presets</span>
          </button>

          {/* Notation Guide */}
          <button
            id="open-guide-btn"
            onClick={onOpenGuide}
            className="px-2 py-1.5 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 text-xs text-gray-800 flex items-center gap-1.5 transition-all font-mono shadow-sm"
            title="Mini-Notation Guide" aria-label="Mini-Notation Guide"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-600" />
            <span className="hidden xl:inline font-semibold">Guide</span>
          </button>

          {/* Dark/Light Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 text-gray-700 hover:text-gray-900 transition-colors"
            title="Toggle Theme" aria-label="Toggle Theme"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </header>
  );
};

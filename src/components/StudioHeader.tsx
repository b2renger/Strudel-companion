import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Play, Square, Volume2, Sliders, Radio, Music, Activity } from 'lucide-react';

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
  trackTitle?: string;
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
  trackTitle = 'Algorithmic Session',
}) => {
  const [isDark, setIsDark] = React.useState(false);
  React.useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);
  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  };

  return (
    <header className="h-14 border-b border-gray-200 flex items-center px-4 sm:px-6 justify-between bg-gray-50 text-gray-900 font-mono select-none sticky top-0 z-30 shadow-sm">
      {/* Left: Brand & Transport */}
      <div className="flex items-center gap-4 sm:gap-6">
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
          <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#059669]' : 'bg-gray-300'}`} />
          <span className="text-gray-900 font-medium">{isPlaying ? `CYC #${currentCycle}` : 'IDLE'}</span>
        </div>
      </div>

      {/* Center/Right: High Density Telemetry & Modulation Knobs */}
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Scale / Key info */}
        <div className="hidden md:flex flex-col">
          <span className="text-[8px] text-gray-600 uppercase tracking-wider font-semibold">Track Preset</span>
          <span className="text-xs text-gray-800 font-medium uppercase truncate max-w-[130px]">{trackTitle}</span>
        </div>

        {/* LPF Cutoff */}
        <div className="hidden xl:flex flex-col">
          <div className="flex items-center justify-between text-[8px] text-gray-600 uppercase font-semibold">
            <span>LPF Cutoff</span>
            <span className="text-emerald-600 font-bold">{cutoff > 1000 ? `${(cutoff / 1000).toFixed(1)}k` : `${cutoff}`}Hz</span>
          </div>
          <input
            type="range"
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
            min={0}
            max={1.2}
            step={0.05}
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="w-14 h-1.5 bg-gray-200 rounded-full mt-1 cursor-pointer accent-pink-600"
          />
        </div>

        {/* Engine Load */}
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-[8px] text-gray-600 uppercase font-semibold">DSP Load</span>
          <div className="w-16 h-1.5 bg-gray-200 rounded-full mt-1.5 overflow-hidden border border-gray-200">
            <div className={`h-full transition-all duration-300 ${isPlaying ? 'w-3/5 bg-gradient-to-r from-emerald-500 to-pink-500' : 'w-1/6 bg-gray-300'}`}></div>
          </div>
        </div>

        <div className="h-6 w-[1px] bg-gray-200 hidden sm:block"></div>

        {/* Presets & Guide Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-1.5 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 text-gray-700 hover:text-gray-900 transition-colors"
            title="Toggle Theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            id="open-presets-btn"
            onClick={onOpenPresets}
            className="px-2.5 py-1.5 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 hover:border-gray-200 text-xs text-gray-800 flex items-center gap-1.5 transition-all font-mono shadow-sm"
            title="Open Track Library"
          >
            <Music className="w-3 h-3 text-emerald-600" />
            <span className="hidden sm:inline font-semibold">Tracks</span>
          </button>

          <button
            id="open-guide-btn"
            onClick={onOpenGuide}
            className="px-2.5 py-1.5 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 hover:border-gray-200 text-xs text-gray-800 flex items-center gap-1.5 transition-all font-mono shadow-sm"
            title="Mini-Notation Guide"
          >
            <Radio className="w-3 h-3 text-pink-600" />
            <span className="hidden sm:inline font-semibold">Guide</span>
          </button>
        </div>
      </div>
    </header>
  );
};


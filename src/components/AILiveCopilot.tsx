import React, { useState } from 'react';
import { Sparkles, Sliders, RefreshCw, Flame, CheckCircle2, Play } from 'lucide-react';
import { AIVariation } from '../types';

interface AILiveCopilotProps {
  currentCode: string;
  onTweakCode: (instruction: string) => void;
  onApplyVariation: (variationCode: string) => void;
  onRequestVariations: (mood: string) => void;
  variations: AIVariation[];
  isTweaking: boolean;
  isLoadingVariations: boolean;
  lastTweakDiffs: string[];
}

export const AILiveCopilot: React.FC<AILiveCopilotProps> = ({
  currentCode,
  onTweakCode,
  onApplyVariation,
  onRequestVariations,
  variations,
  isTweaking,
  isLoadingVariations,
  lastTweakDiffs,
}) => {
  const [tweakInput, setTweakInput] = useState('');

  const quickTweaks = [
    { label: 'Add Delay & Reverb', prompt: 'Add lush delay and reverb to the melody layers' },
    { label: 'Half-Time Beat', prompt: 'Slow down the drum kick and snare to half-time feel' },
    { label: 'Euclidean Hi-Hats', prompt: 'Change the hi-hats to a groovy Euclidean (5,8) rhythm' },
    { label: 'Heavy Drop & Bass', prompt: 'Boost the bassline with resonant sawtooth filter and punchy kick' },
    { label: '303 Acid Sweep', prompt: 'Add acid filter modulation with high resonance to the synth' },
    { label: 'Switch to Minor Key', prompt: 'Harmonize all chords and notes into a deep emotional minor scale' },
  ];

  const handleCustomTweak = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tweakInput.trim()) return;
    onTweakCode(tweakInput.trim());
    setTweakInput('');
  };

  return (
    <div className="bg-[var(--app-card-1)] rounded-xl border border-gray-200 p-3.5 flex flex-col gap-3 font-mono select-none shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-pink-500/15 border border-pink-500/40 text-pink-600 flex items-center justify-center shadow-inner">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-900 uppercase tracking-tight">
              Live AI Copilot & Performance Tweaks
            </div>
            <p className="text-[10px] text-gray-600">
              Modulate rhythm, sound design, and harmony in real time
            </p>
          </div>
        </div>
      </div>

      {/* Natural Language Tweak Input */}
      <form onSubmit={handleCustomTweak} className="flex gap-2">
        <input
          type="text"
          value={tweakInput}
          onChange={(e) => setTweakInput(e.target.value)}
          placeholder="e.g. 'transpose up 2 semitones', 'add swing', 'double hi-hat tempo'..."
          className="flex-1 bg-[var(--app-card-1)] px-3.5 py-2 rounded-lg border border-gray-200 text-xs text-gray-900 placeholder-[#736a5d] focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
        />
        <button
          type="submit"
          disabled={isTweaking || !tweakInput.trim()}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-500/90 hover:brightness-105 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-[0_2px_10px_rgba(5,150,105,0.25)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 uppercase tracking-tight"
        >
          {isTweaking ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Tweaking...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              <span>Tweak</span>
            </>
          )}
        </button>
      </form>

      {/* Quick 1-Click Performance Tweaks */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">
          Instant Live Tweaks:
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {quickTweaks.map((tweak, idx) => (
            <button
              key={idx}
              onClick={() => onTweakCode(tweak.prompt)}
              disabled={isTweaking}
              className="p-2 rounded-lg bg-[var(--app-card-1)] hover:bg-gray-100 border border-gray-200 hover:border-emerald-500/40 text-left transition-all group disabled:opacity-50"
            >
              <div className="text-[11px] font-bold text-gray-800 group-hover:text-emerald-600 transition-colors truncate">
                {tweak.label}
              </div>
              <div className="text-[9px] text-gray-500 truncate mt-0.5">
                {tweak.prompt}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Diff highlights from recent change */}
      {lastTweakDiffs.length > 0 && (
        <div className="bg-[var(--app-card-1)] rounded-lg p-2.5 border border-gray-200 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-bold uppercase">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>AI Code Modifications:</span>
          </div>
          <ul className="text-[11px] text-gray-800 space-y-0.5 pl-4 list-disc">
            {lastTweakDiffs.map((diff, i) => (
              <li key={i}>{diff}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Live Performance Variation Generator */}
      <div className="flex flex-col gap-2 pt-2 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-900 uppercase">
            <Flame className="w-3 h-3 text-pink-600" />
            <span>DJ Variations & Transitions</span>
          </div>
          <button
            onClick={() => onRequestVariations('Dynamic & Surprising')}
            disabled={isLoadingVariations}
            className="text-[10px] text-pink-600 hover:text-pink-600/80 font-bold flex items-center gap-1 bg-pink-500/10 px-2.5 py-1 rounded-md border border-pink-500/30 hover:border-pink-500/60 transition-colors disabled:opacity-50 uppercase"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${isLoadingVariations ? 'animate-spin' : ''}`} />
            <span>Generate Variations</span>
          </button>
        </div>

        {variations.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {variations.map((v, i) => (
              <div
                key={i}
                className="bg-[var(--app-card-1)] p-2.5 rounded-lg border border-gray-200 hover:border-gray-200 flex flex-col justify-between gap-2 shadow-sm"
              >
                <div>
                  <div className="text-[11px] font-bold text-gray-900 flex items-center justify-between">
                    <span className="truncate">{v.title}</span>
                    <span className="text-[8px] uppercase px-1.5 py-0.5 rounded bg-gray-100 text-emerald-600 border border-emerald-500/20 font-bold">
                      {v.type}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1 line-clamp-2">
                    {v.description}
                  </p>
                </div>
                <button
                  onClick={() => onApplyVariation(v.code)}
                  className="w-full py-1.5 px-2 rounded-md bg-gray-100 hover:bg-pink-500/20 text-gray-800 hover:text-pink-600 border border-gray-200 hover:border-pink-500/40 text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all uppercase"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>Switch to Variation</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-3 bg-[var(--app-card-1)] rounded-lg border border-dashed border-gray-200 text-[10px] text-gray-500">
            Click "Generate Variations" to create live DJ breakdowns, drops, and fills.
          </div>
        )}
      </div>
    </div>
  );
};


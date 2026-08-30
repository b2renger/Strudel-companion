import React, { useState } from 'react';
import {
  Sparkles,
  Sliders,
  RefreshCw,
  Flame,
  CheckCircle2,
  Play,
  Save,
  Check,
  ExternalLink,
  Plus,
  Trash2,
  Layers,
  Sparkle,
} from 'lucide-react';
import { AIVariation, AIEngineProgress } from '../types';
import { openInOfficialStrudel } from '../utils/strudelExport';

interface AILiveCopilotProps {
  currentCode: string;
  onTweakCode: (instruction: string) => void;
  onApplyVariation: (variationCode: string) => void;
  onRequestVariations: (mood: string) => void;
  variations: AIVariation[];
  isTweaking: boolean;
  isLoadingVariations: boolean;
  lastTweakDiffs: string[];
  aiProgress?: AIEngineProgress;
  onSaveVariationToSession?: (variation: AIVariation) => void;
  onAddCustomVariation?: (title: string, code: string) => void;
  onDeleteVariation?: (id: string) => void;
  onClearVariations?: () => void;
  onOpenSessionsModal?: () => void;
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
  aiProgress,
  onSaveVariationToSession,
  onAddCustomVariation,
  onDeleteVariation,
  onClearVariations,
  onOpenSessionsModal,
}) => {
  const [tweakInput, setTweakInput] = useState('');
  const [savedVarIds, setSavedVarIds] = useState<Record<string, boolean>>({});
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [selectedMood, setSelectedMood] = useState('Dynamic & Surprising');

  const variationMoods = [
    { label: 'Surprise Me', mood: 'Dynamic & Surprising' },
    { label: 'Heavy Drops', mood: 'Heavy Drops & Peak Energy' },
    { label: 'Ambient Reverb', mood: 'Ambient Space & Reverb Breakdown' },
    { label: 'Polyrhythms', mood: 'Polyrhythmic Euclidean Groove' },
    { label: 'Acid 303', mood: '303 Acid Resonant Filter Sweeps' },
    { label: 'Fast DNB', mood: 'Double-Time Jungle & Fast Breaks' },
  ];

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

  const handleSaveVariation = (v: AIVariation, index: number) => {
    const key = v.id || `var-${index}`;
    if (onSaveVariationToSession) {
      onSaveVariationToSession(v);
      setSavedVarIds((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setSavedVarIds((prev) => ({ ...prev, [key]: false }));
      }, 2000);
    }
  };

  const handleCreateCustomVariation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;
    if (onAddCustomVariation) {
      onAddCustomVariation(customTitle.trim(), currentCode);
      setCustomTitle('');
      setShowAddCustom(false);
    }
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

        {onOpenSessionsModal && (
          <button
            onClick={onOpenSessionsModal}
            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200 rounded text-[10px] font-bold flex items-center gap-1 transition-colors uppercase"
            title="Open Saved Sessions Drawer"
          >
            <Save className="w-3 h-3 text-emerald-600" />
            <span className="hidden sm:inline">Sessions</span>
          </button>
        )}
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
              <span>
                {aiProgress && aiProgress.status === 'downloading' 
                  ? `Downloading Model... ${Math.round(aiProgress.progress * 100)}%` 
                  : aiProgress?.text || 'Tweaking...'}
              </span>
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

      {/* Live Performance Variation Generator & Accumulator */}
      <div className="flex flex-col gap-2 pt-2 border-t border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-900 uppercase">
            <Flame className="w-3 h-3 text-pink-600" />
            <span>DJ Variations</span>
            {variations.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-pink-500/20 text-pink-600 text-[9px] font-mono font-bold">
                {variations.length} available
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {variations.length > 0 && onClearVariations && (
              <button
                onClick={onClearVariations}
                className="text-[9px] text-gray-500 hover:text-red-500 font-bold px-1.5 py-1 rounded transition-colors uppercase"
                title="Clear all variations"
              >
                Clear
              </button>
            )}

            <button
              onClick={() => setShowAddCustom((p) => !p)}
              className="text-[10px] text-gray-700 hover:text-gray-900 font-bold flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-md border border-gray-200 transition-colors uppercase"
              title="Save current editor buffer as custom variation"
            >
              <Plus className="w-2.5 h-2.5" />
              <span>Snapshot</span>
            </button>

            <button
              onClick={() => onRequestVariations(selectedMood)}
              disabled={isLoadingVariations}
              className="text-[10px] text-pink-600 hover:text-pink-700 font-bold flex items-center gap-1.5 bg-pink-500/10 hover:bg-pink-500/20 px-2.5 py-1 rounded-md border border-pink-500/30 hover:border-pink-500/60 transition-colors disabled:opacity-50 uppercase shadow-sm"
              title="Generate new variations (accumulates in list)"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingVariations ? 'animate-spin' : ''}`} />
              <span>
                {isLoadingVariations && aiProgress && aiProgress.status === 'downloading'
                  ? `Downloading Model... ${Math.round(aiProgress.progress * 100)}%`
                  : isLoadingVariations && aiProgress
                  ? aiProgress.text || 'Generating...'
                  : variations.length > 0 ? 'Generate More (+3)' : 'Generate Variations'}
              </span>
            </button>
          </div>
        </div>

        {/* Mood & Style Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-[9px]">
          <span className="text-gray-500 font-bold uppercase shrink-0 mr-1">Style:</span>
          {variationMoods.map((m) => (
            <button
              key={m.label}
              onClick={() => setSelectedMood(m.mood)}
              className={`px-2 py-0.5 rounded-full border shrink-0 transition-all font-medium ${
                selectedMood === m.mood
                  ? 'bg-pink-500 text-white border-pink-500 shadow-xs'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Form to snapshot current buffer as custom variation */}
        {showAddCustom && (
          <form
            onSubmit={handleCreateCustomVariation}
            className="p-2.5 rounded-lg bg-gray-50/70 border border-emerald-500/30 flex items-center gap-2 animate-in slide-in-from-top-1"
          >
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Variation title (e.g. 'Chill Outro', 'Filter Jam')..."
              className="flex-1 bg-[var(--app-card-1)] border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={!customTitle.trim()}
              className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold uppercase transition-all"
            >
              Save Snapshot
            </button>
          </form>
        )}

        {variations.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-gray-200">
            {variations.map((v, i) => {
              const varKey = v.id || `var-${i}`;
              const isSaved = !!savedVarIds[varKey];
              const isActive = currentCode.trim() === v.code.trim();

              return (
                <div
                  key={varKey}
                  className={`bg-[var(--app-card-1)] p-2.5 rounded-lg border flex flex-col justify-between gap-2 shadow-sm transition-all relative group ${
                    isActive
                      ? 'border-emerald-500 ring-1 ring-emerald-500/30 bg-emerald-50/20'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div>
                    <div className="text-[11px] font-bold text-gray-900 flex items-center justify-between gap-1">
                      <span className="truncate flex items-center gap-1">
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                        {v.title}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {isActive && (
                          <span className="text-[8px] uppercase px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-700 border border-emerald-500/30 font-bold">
                            Active
                          </span>
                        )}
                        <span className="text-[8px] uppercase px-1.5 py-0.5 rounded bg-gray-100 text-emerald-600 border border-emerald-500/20 font-bold shrink-0">
                          {v.type}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1 line-clamp-2">
                      {v.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => onApplyVariation(v.code)}
                      className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all uppercase ${
                        isActive
                          ? 'bg-emerald-500 text-white border-emerald-600 shadow-xs'
                          : 'bg-gray-100 hover:bg-pink-500/20 text-gray-800 hover:text-pink-600 border-gray-200 hover:border-pink-500/40'
                      }`}
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>{isActive ? 'Live Playing' : 'Switch'}</span>
                    </button>

                    {onSaveVariationToSession && (
                      <button
                        onClick={() => handleSaveVariation(v, i)}
                        className={`p-1.5 rounded-md border text-[10px] font-bold transition-all ${
                          isSaved
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                        }`}
                        title="Save variation to current session"
                      >
                        {isSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                      </button>
                    )}

                    <button
                      onClick={() => openInOfficialStrudel(v.code)}
                      className="p-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 transition-colors"
                      title="Open variation in official strudel.cc REPL"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>

                    {onDeleteVariation && (
                      <button
                        onClick={() => onDeleteVariation(v.id || varKey)}
                        className="p-1.5 rounded-md bg-gray-100 hover:bg-red-50 text-gray-400 hover:text-red-500 border border-gray-200 transition-colors opacity-70 group-hover:opacity-100"
                        title="Delete variation"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4 px-3 bg-[var(--app-card-1)] rounded-lg border border-dashed border-gray-200 flex flex-col items-center gap-1.5">
            <span className="text-xs font-bold text-gray-700">No Variations Generated Yet</span>
            <p className="text-[10px] text-gray-500 max-w-xs">
              Click "Generate Variations" to create live DJ breakdowns, drops, polyrhythms, and filter sweeps. Regenerate as many times as you like!
            </p>
            <button
              onClick={() => onRequestVariations(selectedMood)}
              disabled={isLoadingVariations}
              className="mt-1 px-3 py-1.5 rounded-md bg-pink-500 hover:bg-pink-600 text-white text-xs font-bold uppercase flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingVariations ? 'animate-spin' : ''}`} />
              <span>
                {isLoadingVariations && aiProgress && aiProgress.status === 'downloading'
                  ? `Downloading Model... ${Math.round(aiProgress.progress * 100)}%`
                  : isLoadingVariations && aiProgress
                  ? aiProgress.text || 'Generating...'
                  : 'Generate 3 Variations'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


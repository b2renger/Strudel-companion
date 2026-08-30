import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Wand2, Compass, Loader2, ArrowRight, Lightbulb, X, Tag } from 'lucide-react';
import { INSPIRATION_PROMPTS } from '../data/presets';
import { PromptSuggestionEngine, QUICK_ADD_MODIFIERS } from './PromptSuggestionEngine';

import { AIEngineProgress } from '../types';

interface AIPromptBarProps {
  onGenerate: (prompt: string, style: string, complexity: 'Beginner' | 'Intermediate' | 'Advanced') => void;
  isLoading: boolean;
  aiProgress?: AIEngineProgress;
}

export const AIPromptBar: React.FC<AIPromptBarProps> = ({ onGenerate, isLoading, aiProgress }) => {
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('All Styles');
  const [complexity, setComplexity] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner');
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const promptBarRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() && !selectedStyle) return;
    setIsSuggestionsOpen(false);
    onGenerate(prompt || `Groovy ${selectedStyle} algorithmic pattern`, selectedStyle, complexity);
  };

  const handleSelectSuggestion = (newPrompt: string) => {
    setPrompt(newPrompt);
  };

  const handleAppendModifier = (modifier: string) => {
    setPrompt((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return modifier.replace(/^with\s+/i, '');
      if (trimmed.endsWith(',')) return `${trimmed} ${modifier}`;
      return `${trimmed}, ${modifier}`;
    });
  };

  const handleSelectInspiration = (text: string) => {
    setPrompt(text);
  };

  // Close suggestions dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (promptBarRef.current && !promptBarRef.current.contains(e.target as Node)) {
        setIsSuggestionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const styles = [
    'Lo-Fi',
    'Amapiano',
    'Acid 303',
    'Jungle / DnB',
    'Koto Zen',
    '8-Bit Chiptune',
    'Bossa Nova',
    'Synthwave',
    'Math Rock 7/8',
    'UK Garage',
    'Ambient Drone',
    'Footwork 160',
  ];

  return (
    <div ref={promptBarRef} className="relative bg-[var(--app-card-1)] rounded-xl border border-gray-200 p-3.5 flex flex-col gap-3 font-mono select-none shadow-sm">
      {/* Top Bar: Prompt Header & Complexity Level */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500/20 to-pink-500/20 border border-emerald-500/40 text-emerald-600 flex items-center justify-center shadow-inner">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-900 flex items-center gap-2 uppercase tracking-tight">
              Natural Language Algorithmic Generator
            </div>
            <p className="text-[10px] text-gray-600">
              Prompt Gemini in plain English to compose Strudel mini-notation patterns
            </p>
          </div>
        </div>

        {/* Suggestion Engine Toggle & Complexity Selector */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsSuggestionsOpen((prev) => !prev)}
            className={`px-3 py-1 rounded-md text-[10px] uppercase font-bold flex items-center gap-1.5 transition-all border shadow-sm ${
              isSuggestionsOpen
                ? 'bg-pink-500 text-white border-pink-500 shadow-[0_0_10px_rgba(219,39,119,0.4)]'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 hover:border-emerald-400'
            }`}
          >
            <Lightbulb className={`w-3 h-3 ${isSuggestionsOpen ? 'text-white fill-current' : 'text-emerald-600'}`} />
            <span>Smart Suggestions & Tokens</span>
          </button>

          <div className="flex items-center gap-1 bg-[var(--app-card-1)] p-0.5 rounded-md border border-gray-200 text-xs">
            <span className="text-gray-500 px-1 text-[9px] uppercase font-semibold">Tier:</span>
            {(['Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setComplexity(lvl)}
                className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold transition-all ${
                  complexity === lvl
                    ? lvl === 'Beginner'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : lvl === 'Intermediate'
                      ? 'bg-cyan-500 text-white shadow-sm'
                      : 'bg-pink-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title={
                  lvl === 'Beginner'
                    ? '2-3 layers, 4/4 meter, readable syntax, simple tweaking tips'
                    : lvl === 'Intermediate'
                    ? '3-4 layers, Euclidean (k,n) rhythms, alternating chords < >, filter sweeps'
                    : '4-6 polyphonic layers, Euclidean cross-rhythms, probability (?), polymeter & pro hacks'
                }
              >
                {lvl === 'Beginner' ? <><span className="sm:hidden">Beg</span><span className="hidden sm:inline">Beginner</span></> : lvl === 'Intermediate' ? <><span className="sm:hidden">Int</span><span className="hidden sm:inline">Intermediate</span></> : <><span className="sm:hidden">Adv</span><span className="hidden sm:inline">Advanced</span></>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Complexity Level Summary Hint */}
      <div className="text-[10px] text-gray-700 bg-[var(--app-card-1)] px-3 py-1.5 rounded-lg border border-gray-200 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${complexity === 'Beginner' ? 'bg-emerald-500 shadow-[0_0_6px_#00f5a0]' : complexity === 'Intermediate' ? 'bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.6)]' : 'bg-pink-500 shadow-[0_0_6px_#ff2a85]'}`} />
          <strong className="text-gray-900 uppercase font-bold">{complexity} Mode:</strong>{' '}
          {complexity === 'Beginner' && '2-3 clean layers, 4/4 beats, straightforward syntax & beginner tweak tips.'}
          {complexity === 'Intermediate' && '3-4 layers, Euclidean grooves (5,8), cycle brackets < >, & filter modulation.'}
          {complexity === 'Advanced' && '4-6 polyphonic layers, Euclidean cross-rhythms (7,16), probability (?), polymeter & pro hacks.'}
        </span>
        <span className="text-gray-500 text-[9px] uppercase tracking-wider hidden md:inline font-semibold">
          Includes inline hand-tweaking hints
        </span>
      </div>

      {/* Main Prompt Form */}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch gap-2 relative">
        <div className="relative flex-1">
          <input
            id="ai-prompt-input"
            type="text"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (!isSuggestionsOpen) {
                setIsSuggestionsOpen(true);
              }
            }}
            onFocus={() => {
              setIsSuggestionsOpen(true);
            }}
            placeholder="e.g. Dreamy lo-fi hip hop with Rhodes chords, 808 kick and vinyl swing..."
            className="w-full bg-[var(--app-card-1)] text-gray-900 placeholder-[#736a5d] px-3.5 py-2.5 pr-8 rounded-lg border border-gray-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 text-xs font-mono transition-all"
          />

          {prompt && (
            <button
              type="button"
              onClick={() => {
                setPrompt('');
                setIsSuggestionsOpen(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Autocomplete & Suggestion Engine Dropdown Panel */}
          <PromptSuggestionEngine
            currentPrompt={prompt}
            onSelectPrompt={handleSelectSuggestion}
            onAppendModifier={handleAppendModifier}
            isOpen={isSuggestionsOpen}
            onClose={() => setIsSuggestionsOpen(false)}
          />
        </div>

        <button
          id="generate-music-btn"
          type="submit"
          disabled={isLoading}
          className="px-5 py-2.5 rounded-lg font-bold text-xs bg-gradient-to-r from-emerald-500 to-emerald-500/90 text-white hover:brightness-105 flex items-center justify-center gap-2 transition-all shadow-[0_2px_12px_rgba(5,150,105,0.3)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 uppercase tracking-wide"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>
                {aiProgress && aiProgress.status === 'downloading' 
                  ? `Downloading Model... ${Math.round(aiProgress.progress * 100)}%` 
                  : aiProgress?.text || 'Synthesizing Code...'}
              </span>
            </>
          ) : (
            <>
              <Wand2 className="w-3.5 h-3.5 fill-black" />
              <span>Generate Pattern</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>

      {/* Quick Additive Modifiers Bar */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="text-gray-500 uppercase text-[9px] font-bold flex items-center gap-1 mr-0.5">
          <Tag className="w-2.5 h-2.5 text-emerald-600" /> Add Token:
        </span>
        {QUICK_ADD_MODIFIERS.slice(0, 5).map((mod, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleAppendModifier(mod.snippet)}
            className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-800 hover:text-emerald-600 border border-gray-200 hover:border-emerald-500/40 transition-colors text-[10px] font-medium"
            title={`Append: ${mod.snippet}`}
          >
            {mod.label}
          </button>
        ))}
      </div>

      {/* Style quick pills */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="text-gray-500 uppercase text-[9px] font-bold mr-1">Styles:</span>
        {styles.map((style) => (
          <button
            key={style}
            type="button"
            onClick={() => {
              setSelectedStyle(style);
              setPrompt(`A ${style.toLowerCase()} algorithmic music track with rich layered patterns`);
            }}
            className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 border border-gray-200 hover:border-emerald-300 transition-colors text-[10px]"
          >
            {style}
          </button>
        ))}
      </div>

      {/* Inspiration Prompt Ideas */}
      <div className="flex items-center gap-1.5 overflow-x-auto text-[10px] pt-1.5 border-t border-gray-200">
        <span className="text-gray-500 uppercase text-[9px] font-bold flex items-center gap-1 shrink-0">
          <Compass className="w-2.5 h-2.5 text-emerald-600" /> Presets:
        </span>
        {INSPIRATION_PROMPTS.slice(0, 4).map((idea, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSelectInspiration(idea)}
            className="px-2 py-0.5 rounded-md bg-[var(--app-card-1)] hover:bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-200 text-[10px] truncate max-w-[210px] transition-colors"
            title={idea}
          >
            "{idea}"
          </button>
        ))}
      </div>
    </div>
  );
};



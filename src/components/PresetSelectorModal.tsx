import React from 'react';
import { X, Play, Music } from 'lucide-react';
import { STARTER_PRESETS } from '../data/presets';
import { TrackPreset } from '../types';

interface PresetSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTrack: (track: TrackPreset) => void;
  currentTrackId?: string;
}

export const PresetSelectorModal: React.FC<PresetSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectTrack,
  currentTrackId,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 font-mono select-none">
      <div className="bg-[var(--app-card-1)] border border-gray-200 rounded w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-[var(--app-card-1)]">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-sm bg-orange-500/10 border border-orange-500/30 text-orange-600 flex items-center justify-center">
              <Music className="w-3 h-3" />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-900 uppercase tracking-tight">
                Strudel Algorithmic Pattern Library
              </div>
              <p className="text-[10px] text-gray-500">
                Curated live-coding patterns across genres and complexity tiers
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-gray-600 hover:text-gray-900 hover:bg-black/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tracks Grid */}
        <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 bg-gray-100">
          {STARTER_PRESETS.map((preset) => {
            const isSelected = currentTrackId === preset.id;
            return (
              <div
                key={preset.id}
                className={`bg-[var(--app-card-1)] rounded p-3 border transition-all flex flex-col justify-between gap-2.5 ${
                  isSelected
                    ? 'border-orange-500 ring-1 ring-orange-200'
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <span>{preset.title}</span>
                      {isSelected && (
                        <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-orange-500/20 text-orange-600 font-bold">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-orange-600">
                      {preset.bpm} BPM
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="px-1.5 py-0.2 rounded bg-black/5 text-gray-700 font-bold uppercase">
                      {preset.genre}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                        preset.complexity === 'Beginner'
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                          : preset.complexity === 'Intermediate'
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                          : 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                      }`}
                    >
                      {preset.complexity}
                    </span>
                  </div>

                  <p className="text-[11px] text-gray-700 leading-relaxed">
                    {preset.description}
                  </p>

                  {preset.theoryNotes && (
                    <div className="text-[10px] text-gray-600 bg-black/40 p-1.5 rounded border border-gray-100">
                      <span className="text-orange-600 font-bold uppercase mr-1">Theory:</span>
                      {preset.theoryNotes}
                    </div>
                  )}

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {preset.tags.map((tag, t) => (
                      <span
                        key={t}
                        className="text-[9px] px-1 py-0.2 rounded bg-black/5 text-gray-500 border border-gray-100"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Load Button */}
                <button
                  onClick={() => {
                    onSelectTrack(preset);
                    onClose();
                  }}
                  className={`w-full py-1.5 px-2.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 uppercase transition-all ${
                    isSelected
                      ? 'bg-black/5 text-gray-700 hover:bg-black/10 border border-gray-200'
                      : 'bg-orange-500 hover:bg-orange-500/90 text-white shadow-sm'
                  }`}
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>{isSelected ? 'Reload Track' : 'Load Pattern'}</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-200 bg-[var(--app-card-1)] flex items-center justify-between text-[10px] text-gray-500">
          <span>Prompt Gemini AI anytime in the bottom prompt bar to generate custom patterns.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-black/5 hover:bg-black/10 text-gray-700 font-bold uppercase transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};


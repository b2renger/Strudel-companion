import React, { useState } from 'react';
import { X, Plus, BookOpen, Volume2 } from 'lucide-react';
import { NOTATION_DICTIONARY } from '../data/presets';
import { NotationSymbol } from '../types';
import { audioEngine } from '../engine/audioEngine';

interface NotationGuideProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertSnippet: (snippet: string) => void;
}

export const NotationGuide: React.FC<NotationGuideProps> = ({
  isOpen,
  onClose,
  onInsertSnippet,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [playingExample, setPlayingExample] = useState<string | null>(null);

  if (!isOpen) return null;

  const categories = ['All', 'Rhythm', 'Grouping', 'Speed', 'Variation', 'Effects'];

  const filteredSymbols =
    selectedCategory === 'All'
      ? NOTATION_DICTIONARY
      : NOTATION_DICTIONARY.filter((s) => s.category === selectedCategory);

  const handlePreview = (item: NotationSymbol) => {
    setPlayingExample(item.symbol);
    audioEngine.evaluate(item.example);
    audioEngine.play();

    // Stop after 3 seconds so it's a brief taste
    setTimeout(() => {
      setPlayingExample(null);
    }, 3200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 font-mono select-none">
      <div className="bg-[var(--app-card-1)] border border-gray-200 rounded-2xl w-full max-w-3xl max-h-[85dvh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 flex items-center justify-center shadow-inner">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-900 uppercase tracking-tight">
                Strudel & TidalCycles Mini-Notation Reference
              </div>
              <p className="text-[10px] text-gray-600">
                Live coding algorithmic rhythm, subdivision, and pattern syntax
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Pills */}
        <div className="px-5 py-2.5 border-b border-gray-200 bg-[var(--app-card-1)] flex items-center gap-2 overflow-x-auto text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-md text-[10px] uppercase font-bold transition-all whitespace-nowrap shadow-sm ${
                selectedCategory === cat
                  ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(5,150,105,0.3)]'
                  : 'bg-gray-100 text-gray-700 hover:text-gray-900 border border-gray-200 hover:border-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Symbols Grid */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1 bg-[var(--app-card-1)]">
          {filteredSymbols.map((item, idx) => (
            <div
              key={idx}
              className="bg-[var(--app-card-1)] rounded-xl p-3.5 border border-gray-200 hover:border-gray-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
            >
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-pink-600 px-2 py-0.5 rounded-md bg-pink-500/15 border border-pink-500/40 shadow-sm">
                    {item.symbol}
                  </span>
                  <span className="text-xs font-bold text-gray-900">
                    {item.title}
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-gray-100 text-emerald-600 border border-emerald-500/20 font-semibold">
                    {item.category}
                  </span>
                </div>

                <p className="text-[11px] text-gray-800 leading-relaxed">
                  {item.description}
                </p>

                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[9px] text-gray-500 uppercase font-bold">Syntax:</span>
                  <code className="text-[10px] text-emerald-600 bg-[var(--app-card-1)] px-2 py-0.5 rounded border border-gray-200 font-bold">
                    {item.example}
                  </code>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handlePreview(item)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all uppercase ${
                    playingExample === item.symbol
                      ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(5,150,105,0.4)]'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200 hover:border-emerald-500/40'
                  }`}
                  title="Audition rhythm" aria-label="Audition rhythm"
                >
                  <Volume2 className="w-3 h-3" />
                  <span>{playingExample === item.symbol ? 'Playing' : 'Audition'}</span>
                </button>

                <button
                  onClick={() => {
                    onInsertSnippet(item.example);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-pink-500/15 hover:bg-pink-500/25 text-pink-600 border border-pink-500/40 flex items-center gap-1.5 transition-all uppercase shadow-sm active:scale-95"
                >
                  <Plus className="w-3 h-3" />
                  <span>Insert</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-[10px] text-gray-500">
          <span>Strudel TidalCycles mini-notation is evaluated cyclically in real-time.</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold uppercase transition-colors border border-gray-200"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};


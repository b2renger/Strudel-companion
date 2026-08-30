import React from 'react';
import { BookOpen, Sparkles, Lightbulb, Music } from 'lucide-react';
import { AIExplanationResult } from '../types';

interface LineByLineBreakdownProps {
  explanation: AIExplanationResult | null;
  isLoading: boolean;
  onExplainCode: () => void;
  onInsertSymbol?: (symbol: string) => void;
}

export const LineByLineBreakdown: React.FC<LineByLineBreakdownProps> = ({
  explanation,
  isLoading,
  onExplainCode,
}) => {
  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'Drums':
        return 'bg-orange-500/20 text-orange-600 border-orange-500/40';
      case 'Bass':
        return 'bg-emerald-500/20 text-emerald-600 border-emerald-500/40';
      case 'Harmony':
        return 'bg-indigo-500/20 text-indigo-600 border-indigo-500/40';
      case 'Melody':
        return 'bg-purple-500/20 text-purple-600 border-purple-500/40';
      default:
        return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200';
    }
  };

  return (
    <div className="bg-[var(--app-card-1)] rounded border border-gray-200 p-3 flex flex-col gap-3 font-mono select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-sm bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
            <BookOpen className="w-3 h-3" />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-900 uppercase tracking-tight">
              Code Breakdown & Music Theory
            </div>
            <p className="text-[10px] text-gray-500">
              Dissect Strudel AST logic and mini-notation syntax
            </p>
          </div>
        </div>

        <button
          onClick={onExplainCode}
          disabled={isLoading}
          className="px-2.5 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 uppercase"
        >
          <Sparkles className="w-3 h-3" />
          <span>{isLoading ? 'Analyzing...' : 'Explain Code'}</span>
        </button>
      </div>

      {explanation ? (
        <div className="flex flex-col gap-3">
          {/* Summary */}
          <div className="bg-gray-100 p-2.5 rounded border border-gray-100 text-xs text-gray-700 leading-relaxed">
            <span className="text-orange-600 font-bold mr-1.5 uppercase text-[10px]">Overview:</span>
            {explanation.summary}
          </div>

          {/* Music Theory Insight */}
          {explanation.musicTheoryTip && (
            <div className="bg-gray-100 border border-orange-500/30 rounded p-2.5 flex items-start gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <div className="text-[10px] font-bold text-orange-600 uppercase">Music Theory Note</div>
                <div className="text-[11px] text-gray-700 mt-0.5">
                  {explanation.musicTheoryTip}
                </div>
              </div>
            </div>
          )}

          {/* Line by Line Breakdown */}
          {explanation.lineByLine && explanation.lineByLine.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">
                AST Line Breakdown:
              </span>
              <div className="space-y-1.5">
                {explanation.lineByLine.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-100 p-2 rounded border border-gray-100 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-[11px] text-orange-600 font-bold bg-black/5 px-1.5 py-0.5 rounded border border-gray-100 truncate">
                        {item.line}
                      </code>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 uppercase ${getRoleBadge(
                          item.role
                        )}`}
                      >
                        {item.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                      {item.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mini-notation symbols explained */}
          {explanation.miniNotationGuide && explanation.miniNotationGuide.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-gray-100">
              <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">
                Symbols Active in Pattern:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {explanation.miniNotationGuide.map((guide, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-100 p-2 rounded border border-gray-100 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-cyan-300">
                        {guide.symbol} ({guide.title})
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-600">
                      {guide.explanation}
                    </p>
                    <code className="text-[9px] text-orange-600 bg-black/5 px-1 py-0.5 rounded mt-0.5">
                      {guide.example}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-6 bg-gray-100 rounded border border-dashed border-gray-100 flex flex-col items-center gap-2 p-3">
          <Music className="w-6 h-6 text-gray-400" />
          <p className="text-[10px] text-gray-500 max-w-sm">
            Click <strong className="text-cyan-400">"Explain Code"</strong> to receive an instant AI breakdown of every layer, chord progression, and mini-notation rhythm!
          </p>
        </div>
      )}
    </div>
  );
};


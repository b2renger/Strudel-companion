import React from 'react';
import { StrudelToken, ParseResult } from '../utils/strudelTokenParser';
import { Sparkles, Edit3, Volume2, Music, Clock, Sliders, Shuffle, Grid, Play, Radio } from 'lucide-react';

interface InteractiveCodeHighlighterProps {
  code: string;
  parsedData: ParseResult;
  onSelectToken: (token: StrudelToken) => void;
  onSwitchToRawEdit: () => void;
  onEvaluate: () => void;
  fontSize: number;
  isEvalFlashing: boolean;
}

interface CodeSegment {
  text: string;
  isToken: boolean;
  token?: StrudelToken;
  type:
    | 'token'
    | 'keyword'
    | 'function'
    | 'method'
    | 'number'
    | 'string-quote'
    | 'comment'
    | 'punctuation'
    | 'plain';
}

export const InteractiveCodeHighlighter: React.FC<InteractiveCodeHighlighterProps> = ({
  code,
  parsedData,
  onSelectToken,
  onSwitchToRawEdit,
  onEvaluate,
  fontSize,
  isEvalFlashing,
}) => {
  // Build line-by-line interactive segments using character indices matching parsed tokens
  const lines = code.split('\n');

  // Map tokens by their exact character ranges
  const tokens = parsedData.allTokens;

  // Function to build interactive segments for a single line
  const renderLineSegments = (lineText: string, lineStartIndex: number, lineNum: number) => {
    const lineEndIndex = lineStartIndex + lineText.length;

    // Handle comments
    const commentIdx = lineText.indexOf('//');
    let codePart = lineText;
    let commentPart = '';
    if (commentIdx !== -1) {
      codePart = lineText.substring(0, commentIdx);
      commentPart = lineText.substring(commentIdx);
    }

    // Find tokens that fall inside this line
    const lineTokens = tokens.filter(
      (t) => t.startIndex >= lineStartIndex && t.endIndex <= lineEndIndex && t.startIndex < lineStartIndex + (commentIdx !== -1 ? commentIdx : lineText.length)
    );

    // If no tokens in this code segment, render with basic syntax highlight
    if (lineTokens.length === 0 && commentPart.length === 0) {
      return <span>{renderSyntaxColoredText(lineText)}</span>;
    }

    const segments: React.ReactNode[] = [];
    let currentIdx = lineStartIndex;

    // Sort tokens by startIndex
    const sortedLineTokens = [...lineTokens].sort((a, b) => a.startIndex - b.startIndex);

    sortedLineTokens.forEach((tok, i) => {
      // Add plain/syntax text before token
      if (tok.startIndex > currentIdx) {
        const textBefore = code.substring(currentIdx, tok.startIndex);
        segments.push(
          <span key={`before-${tok.id}-${i}`}>
            {renderSyntaxColoredText(textBefore)}
          </span>
        );
      }

      // Render interactive clickable token badge
      segments.push(
        <button
          key={tok.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectToken(tok);
          }}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 my-0.5 rounded font-mono font-bold text-left transition-all active:scale-95 cursor-pointer shadow-sm mx-0.5 ${getTokenHighlightClass(
            tok.type
          )}`}
          title={`Tap to edit ${tok.type}: "${tok.raw}"`}
        >
          {getTokenIcon(tok.type)}
          <span>{tok.raw}</span>
        </button>
      );

      currentIdx = tok.endIndex;
    });

    // Remainder of code part before comment
    const codePartEndIdx = lineStartIndex + codePart.length;
    if (currentIdx < codePartEndIdx) {
      const restText = code.substring(currentIdx, codePartEndIdx);
      segments.push(
        <span key={`after-${lineNum}`}>
          {renderSyntaxColoredText(restText)}
        </span>
      );
    }

    // Add comment part if present
    if (commentPart.length > 0) {
      segments.push(
        <span key={`comment-${lineNum}`} className="text-gray-500 italic">
          {commentPart}
        </span>
      );
    }

    return segments;
  };

  // Helper for syntax colors on non-token text
  const renderSyntaxColoredText = (text: string) => {
    // Basic syntax coloring for keywords, methods, punctuation
    const parts = text.split(/(\b(?:stack|s|note|pure|slow|fast|rev|jux|room|lpf|decay|delay|gain)\b|[(){}\[\],;"']|\.[a-zA-Z0-9_]+)/g);

    return parts.map((part, idx) => {
      if (!part) return null;
      if (part === 'stack' || part === 's' || part === 'note') {
        return (
          <span key={idx} className="text-pink-400 font-bold">
            {part}
          </span>
        );
      }
      if (part.startsWith('.')) {
        return (
          <span key={idx} className="text-purple-300 font-semibold">
            {part}
          </span>
        );
      }
      if (part === '"' || part === "'") {
        return (
          <span key={idx} className="text-amber-300 font-bold">
            {part}
          </span>
        );
      }
      if (['(', ')', '[', ']', '{', '}', ',', ';'].includes(part)) {
        return (
          <span key={idx} className="text-gray-500 font-bold">
            {part}
          </span>
        );
      }
      return (
        <span key={idx} className="text-gray-800">
          {part}
        </span>
      );
    });
  };

  // Token styling classes
  const getTokenHighlightClass = (type: string) => {
    switch (type) {
      case 'sample':
        return 'bg-pink-500/20 text-pink-600 border border-pink-500/60 hover:bg-pink-500/35 ring-1 ring-pink-500/30 shadow-[0_0_8px_rgba(219,39,119,0.15)]';
      case 'synth':
        return 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/60 hover:bg-emerald-500/35 ring-1 ring-emerald-500/30 shadow-[0_0_8px_rgba(5,150,105,0.15)]';
      case 'note':
        return 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/60 hover:bg-emerald-500/35 ring-1 ring-emerald-500/30';
      case 'chord':
        return 'bg-gray-100 text-gray-900 border border-gray-200 hover:bg-gray-200 ring-1 ring-gray-200';
      case 'subdivision':
        return 'bg-gray-100 text-gray-900 border border-gray-200 hover:bg-gray-200 ring-1 ring-gray-200';
      case 'euclidean':
        return 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/60 hover:bg-emerald-500/35 ring-1 ring-emerald-500/30';
      case 'cycle_bracket':
        return 'bg-pink-500/10 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/30 hover:bg-pink-500/20 ring-1 ring-pink-500/30';
      case 'rest':
        return 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200';
      case 'param':
        return 'bg-pink-500/20 text-pink-600 border border-pink-500/60 hover:bg-pink-500/35 ring-1 ring-pink-500/30';
      case 'method':
        return 'bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100';
      default:
        return 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100';
    }
  };

  const getTokenIcon = (type: string) => {
    switch (type) {
      case 'sample':
        return <Volume2 className="w-2.5 h-2.5 inline shrink-0 opacity-90 text-pink-600" />;
      case 'synth':
        return <Radio className="w-2.5 h-2.5 inline shrink-0 opacity-90 text-emerald-600" />;
      case 'note':
        return <Music className="w-2.5 h-2.5 inline shrink-0 opacity-90 text-emerald-600" />;
      case 'chord':
        return <Grid className="w-2.5 h-2.5 inline shrink-0 opacity-90 text-gray-900" />;
      case 'subdivision':
        return <Clock className="w-2.5 h-2.5 inline shrink-0 opacity-90 text-gray-800" />;
      case 'euclidean':
        return <Shuffle className="w-2.5 h-2.5 inline shrink-0 opacity-90 text-emerald-600" />;
      case 'param':
      case 'method':
        return <Sliders className="w-2.5 h-2.5 inline shrink-0 opacity-90 text-pink-600" />;
      default:
        return null;
    }
  };

  // Calculate cumulative character offsets for each line
  let lineOffset = 0;
  const lineStartIndices: number[] = [];
  lines.forEach((l) => {
    lineStartIndices.push(lineOffset);
    lineOffset += l.length + 1; // +1 for newline
  });

  return (
    <div className="flex flex-col bg-[var(--app-card-1)] flex-1 overflow-hidden font-mono select-none">
      {/* Interactive Helper Banner */}
      <div className="bg-gray-50 border-b border-gray-200 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-gray-900 text-[11px]">
          <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Interactive Code Highlighter:</span>
          </span>
          <span className="text-gray-600 text-[10px] hidden sm:inline">
            Tap any highlighted note, sound, subdivision, or effect to change it
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Switch to Raw Keyboard Mode */}
          <button
            onClick={onSwitchToRawEdit}
            className="px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-200 hover:border-emerald-500/40 text-[10px] font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
            title="Switch to direct keyboard text editing"
          >
            <Edit3 className="w-3 h-3 text-emerald-600" />
            <span>Keyboard Edit Mode</span>
          </button>
        </div>
      </div>

      {/* Interactive Code Lines Display */}
      <div
        className="flex-1 overflow-auto p-3.5 scrollbar-thin scrollbar-thumb-[#e8decb]/10"
        style={{ fontSize: `${fontSize}px`, lineHeight: `${fontSize * 1.8}px` }}
      >
        <div className="flex flex-col gap-0.5">
          {lines.map((lineText, lineIdx) => {
            const lineStartIdx = lineStartIndices[lineIdx];
            return (
              <div
                key={lineIdx}
                className="flex items-start group hover:bg-gray-50 rounded px-1 -mx-1 transition-colors"
              >
                {/* Line Number */}
                <div
                  className={`w-7 shrink-0 text-right pr-3 select-none text-[10px] font-mono leading-[${fontSize * 1.8}px] pt-0.5 ${
                    isEvalFlashing ? 'text-emerald-600 font-bold' : 'text-gray-500 group-hover:text-gray-600'
                  }`}
                >
                  {lineIdx + 1}
                </div>

                {/* Line Code Content with Clickable Highlights */}
                <div className="flex-1 font-mono whitespace-pre-wrap break-all text-gray-900 flex flex-wrap items-center">
                  {lineText.trim().length === 0 ? (
                    <span className="opacity-0 select-none">&nbsp;</span>
                  ) : (
                    renderLineSegments(lineText, lineStartIdx, lineIdx + 1)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend / Token Guide Footer for Mobile */}
      <div className="bg-gray-50 border-t border-gray-200 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[9px] text-gray-600">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-gray-500 uppercase font-bold">Highlights:</span>
          <span className="flex items-center gap-1 text-pink-600 font-medium">
            <span className="w-2 h-2 rounded bg-pink-500/40 border border-pink-500" /> Drums/Sounds
          </span>
          <span className="flex items-center gap-1 text-emerald-600 font-medium">
            <span className="w-2 h-2 rounded bg-emerald-500/40 border border-emerald-500" /> Notes/Pitch
          </span>
          <span className="flex items-center gap-1 text-gray-900 font-medium">
            <span className="w-2 h-2 rounded bg-indigo-100 border border-indigo-300" /> Subdivisions
          </span>
          <span className="flex items-center gap-1 text-pink-600 font-medium">
            <span className="w-2 h-2 rounded bg-pink-100 border border-pink-300" /> Effects/Params
          </span>
        </div>

        <button
          onClick={onEvaluate}
          className="px-3 py-1 rounded-md bg-gradient-to-r from-emerald-500 to-emerald-500/90 text-white font-bold text-[10px] flex items-center gap-1 uppercase active:scale-95 shadow-[0_0_10px_rgba(5,150,105,0.3)] ml-auto hover:brightness-105"
        >
          <Play className="w-2.5 h-2.5 fill-black" />
          <span>Eval</span>
        </button>
      </div>
    </div>
  );
};

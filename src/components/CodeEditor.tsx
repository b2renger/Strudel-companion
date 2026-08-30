import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { AIEngineProgress } from '../types';
import {
  Play,
  Square,
  Copy,
  Check,
  Sparkles,
  RotateCcw,
  Pin,
  PinOff,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Code2,
  Sliders,
  Zap,
  Layers,
  Plus,
  Music,
  Volume2,
  Clock,
  Shuffle,
  Grid,
  Edit3,
  Globe,
  ExternalLink,
  X,
  Trash2,
} from 'lucide-react';
import { audioEngine, EvalEvent } from '../engine/audioEngine';
import {
  parseStrudelCodeToTokens,
  replaceTokenInCode,
  insertBlockBehindTokenInCode,
  insertBlockAtLineInCode,
  removeBlockInCode,
  removeLayerInCode,
  StrudelToken,
  ParsedCodeLayer,
} from '../utils/strudelTokenParser';
import { TokenInspectorModal } from './TokenInspectorModal';
import { InteractiveCodeHighlighter } from './InteractiveCodeHighlighter';
import { AddBlockModal } from './AddBlockModal';

interface CodeEditorProps {
  code: string;
  onChange: (newCode: string) => void;
  onEvaluate: (codeOverride?: string) => void;
  onHush: () => void;
  isPlaying: boolean;
  errorMessage: string | null;
  onFixWithAI?: () => void;
  isFixing?: boolean;
  aiProgress?: AIEngineProgress;
  onOpenExportRepl?: () => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  onChange,
  onEvaluate,
  onHush,
  isPlaying,
  errorMessage,
  onFixWithAI,
  isFixing = false,
  aiProgress,
  onOpenExportRepl,
}) => {
  const [copied, setCopied] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isPinnedSticky, setIsPinnedSticky] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [fontSize, setFontSize] = useState<number>(13); // px
  const [activeQuickTab, setActiveQuickTab] = useState<'symbols' | 'methods' | 'tools'>('symbols');
  const [editorViewMode, setEditorViewMode] = useState<'code' | 'highlighted' | 'visual'>('code');
  const [autoEvalEnabled, setAutoEvalEnabled] = useState<boolean>(false);
  const [lastEvaluatedCode, setLastEvaluatedCode] = useState<string>(typeof code === 'string' ? code : '');

  // Token Inspector Modal State
  const [selectedToken, setSelectedToken] = useState<StrudelToken | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(false);

  // Add Block of Choice Modal State
  const [isAddBlockOpen, setIsAddBlockOpen] = useState<boolean>(false);
  const [addBlockTargetToken, setAddBlockTargetToken] = useState<StrudelToken | null>(null);
  const [addBlockTargetLine, setAddBlockTargetLine] = useState<number | undefined>(undefined);

  // Eval Visual Feedback States
  const [isEvalFlashing, setIsEvalFlashing] = useState(false);
  const [lastEvalEvent, setLastEvalEvent] = useState<EvalEvent | null>(null);

  // Mobile & Desktop Undo / Redo History Stack (Safe Unified State)
  const historyRef = useRef<{ stack: string[]; index: number }>({
    stack: [typeof code === 'string' ? code : ''],
    index: 0,
  });

  const [historyState, setHistoryState] = useState<{ stack: string[]; index: number }>(() => ({
    stack: [typeof code === 'string' ? code : ''],
    index: 0,
  }));
  const isHistoryAction = useRef<boolean>(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoEvalTimerRef = useRef<NodeJS.Timeout | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const safeCode = typeof code === 'string' ? code : '';
  const hasUnappliedChanges = lastEvaluatedCode.trim() !== safeCode.trim();

  // Parse code into interactive layers & tokens
  const parsedData = useMemo(() => {
    return parseStrudelCodeToTokens(safeCode);
  }, [safeCode]);

  // Subscribe to Audio Engine evaluation events for synchronized visual feedback
  useEffect(() => {
    const unsubscribe = audioEngine.subscribeEval((ev: EvalEvent) => {
      setLastEvalEvent(ev);
      if (ev.success) {
        setLastEvaluatedCode(ev.code || safeCode);
        setIsEvalFlashing(true);
        const timer = setTimeout(() => {
          setIsEvalFlashing(false);
        }, 1600);
        return () => clearTimeout(timer);
      }
    });
    return unsubscribe;
  }, [safeCode]);

  // Safe direct evaluation function ensuring current buffer is used
  const triggerSafeEvaluate = useCallback((codeToEval?: string) => {
    const target = typeof codeToEval === 'string' ? codeToEval : (textareaRef.current?.value ?? code);
    setLastEvaluatedCode(target);
    onEvaluate(target);
  }, [code, onEvaluate]);

  // Auto-eval on typing if enabled
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    onChange(newText);

    if (autoEvalEnabled) {
      if (autoEvalTimerRef.current) {
        clearTimeout(autoEvalTimerRef.current);
      }
      autoEvalTimerRef.current = setTimeout(() => {
        triggerSafeEvaluate(newText);
      }, 400);
    }
  };

  // Flush any pending text into history stack immediately
  const flushPendingHistory = useCallback((currentText: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const { stack, index } = historyRef.current;
    if (stack[index] !== currentText) {
      const past = stack.slice(0, index + 1);
      const nextStack = [...past, currentText];
      if (nextStack.length > 80) nextStack.shift();
      const nextIndex = nextStack.length - 1;
      historyRef.current = { stack: nextStack, index: nextIndex };
      setHistoryState({ stack: nextStack, index: nextIndex });
    }
  }, []);

  // Update undo stack safely when code changes
  useEffect(() => {
    const currentCode = typeof code === 'string' ? code : '';

    if (isHistoryAction.current) {
      isHistoryAction.current = false;
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const currentPresent = historyRef.current.stack[historyRef.current.index];
      if (currentPresent === currentCode) {
        return;
      }
      const past = historyRef.current.stack.slice(0, historyRef.current.index + 1);
      const nextStack = [...past, currentCode];
      if (nextStack.length > 80) {
        nextStack.shift();
      }
      const nextIndex = nextStack.length - 1;
      historyRef.current = { stack: nextStack, index: nextIndex };
      setHistoryState({ stack: nextStack, index: nextIndex });
    }, 200);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [code]);

  const handleUndo = useCallback(() => {
    const currentText = typeof code === 'string' ? code : '';
    // Ensure current uncommitted changes are committed first
    flushPendingHistory(currentText);

    const { stack, index } = historyRef.current;
    if (index <= 0) return;
    const targetIndex = index - 1;
    const targetCode = stack[targetIndex];
    if (typeof targetCode !== 'string') return;

    historyRef.current.index = targetIndex;
    isHistoryAction.current = true;
    setHistoryState({ stack, index: targetIndex });
    onChange(targetCode);
  }, [code, flushPendingHistory, onChange]);

  const handleRedo = useCallback(() => {
    const currentText = typeof code === 'string' ? code : '';
    flushPendingHistory(currentText);

    const { stack, index } = historyRef.current;
    if (index >= stack.length - 1) return;
    const targetIndex = index + 1;
    const targetCode = stack[targetIndex];
    if (typeof targetCode !== 'string') return;

    historyRef.current.index = targetIndex;
    isHistoryAction.current = true;
    setHistoryState({ stack, index: targetIndex });
    onChange(targetCode);
  }, [code, flushPendingHistory, onChange]);

  const canUndo = historyState.index > 0;
  const canRedo = historyState.index < historyState.stack.length - 1;

  const lines = safeCode.split('\n');

  // Synchronize line numbers scroll with textarea
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter or Cmd+Enter -> Run & Evaluate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      triggerSafeEvaluate(e.currentTarget.value);
    }
    // Ctrl+. or Cmd+. -> Stop / Hush
    if ((e.ctrlKey || e.metaKey) && e.key === '.') {
      e.preventDefault();
      onHush();
    }
    // Ctrl+Z -> Undo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    }
    // Ctrl+Shift+Z or Ctrl+Y -> Redo
    if (
      ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) ||
      ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
    ) {
      e.preventDefault();
      handleRedo();
    }
    // Tab key indentation support
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (e.shiftKey) {
        handleUnindent();
      } else {
        const newCode = code.substring(0, start) + '  ' + code.substring(end);
        onChange(newCode);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        }, 0);
      }
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Open Token Inspector
  const handleOpenTokenInspector = (token: StrudelToken) => {
    setSelectedToken(token);
    setIsInspectorOpen(true);
  };

  // Apply Modified Token Value
  const handleApplyTokenValue = (token: StrudelToken, newValue: string, autoEval: boolean) => {
    const updatedCode = replaceTokenInCode(code, token, newValue);
    onChange(updatedCode);
    setIsInspectorOpen(false);
    setSelectedToken(null);

    if (autoEval) {
      triggerSafeEvaluate(updatedCode);
    }
  };

  // Open Add Block Modal behind any token or at line
  const handleOpenAddBlock = useCallback((token: StrudelToken | null, lineNumber?: number) => {
    setAddBlockTargetToken(token);
    setAddBlockTargetLine(lineNumber);
    setIsAddBlockOpen(true);
  }, []);

  // Insert Block of Choice and automatically synchronize buffer & audio engine
  const handleInsertBlock = useCallback((blockCode: string, autoEval = true) => {
    let updatedCode = code;
    if (addBlockTargetToken) {
      updatedCode = insertBlockBehindTokenInCode(code, addBlockTargetToken, blockCode);
    } else if (typeof addBlockTargetLine === 'number') {
      updatedCode = insertBlockAtLineInCode(code, addBlockTargetLine, blockCode);
    } else {
      updatedCode = code + '\n' + blockCode;
    }

    onChange(updatedCode);

    if (autoEval) {
      triggerSafeEvaluate(updatedCode);
    }
  }, [code, addBlockTargetToken, addBlockTargetLine, onChange, triggerSafeEvaluate]);

  // Remove Selected Block / Token
  const handleRemoveToken = useCallback((token: StrudelToken, autoEval = true) => {
    const updatedCode = removeBlockInCode(code, token);
    onChange(updatedCode);
    setIsInspectorOpen(false);
    setSelectedToken(null);

    if (autoEval) {
      triggerSafeEvaluate(updatedCode);
    }
  }, [code, onChange, triggerSafeEvaluate]);

  // Remove Entire Layer / Track
  const handleRemoveLayer = useCallback((lineNumber: number, autoEval = true) => {
    const updatedCode = removeLayerInCode(code, lineNumber);
    onChange(updatedCode);

    if (autoEval) {
      triggerSafeEvaluate(updatedCode);
    }
  }, [code, onChange, triggerSafeEvaluate]);

  // Smart Snippet Insert or Wrap Selected Text
  const insertOrWrapSnippet = (snippet: string, isWrapper = false, wrapPair: [string, string] = ['', '']) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(code + '\n' + snippet);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = code.substring(start, end);

    let newCode = '';
    let newCursorPos = start;

    if (isWrapper && selectedText.length > 0) {
      const wrapped = `${wrapPair[0]}${selectedText}${wrapPair[1]}`;
      newCode = code.substring(0, start) + wrapped + code.substring(end);
      newCursorPos = start + wrapped.length;
    } else {
      newCode = code.substring(0, start) + snippet + code.substring(end);
      if (snippet === '""' || snippet === '[]' || snippet === '<>' || snippet === '()') {
        newCursorPos = start + 1;
      } else if (snippet.includes('("")')) {
        newCursorPos = start + snippet.indexOf('("")') + 2;
      } else {
        newCursorPos = start + snippet.length;
      }
    }

    onChange(newCode);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = newCursorPos;
    }, 10);
  };

  // Mobile Text Utilities
  const handleIndent = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newCode = code.substring(0, start) + '  ' + code.substring(end);
    onChange(newCode);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + 2;
    }, 10);
  };

  const handleUnindent = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    if (start >= 2 && code.substring(start - 2, start) === '  ') {
      const newCode = code.substring(0, start - 2) + code.substring(start);
      onChange(newCode);
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start - 2;
      }, 10);
    }
  };

  const handleToggleComment = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lastNewline = code.lastIndexOf('\n', start - 1);
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
    const currentLine = code.substring(lineStart);
    const lineEnd = currentLine.indexOf('\n') === -1 ? code.length : lineStart + currentLine.indexOf('\n');
    const targetLineText = code.substring(lineStart, lineEnd);

    let newLineText = '';
    if (targetLineText.trimStart().startsWith('//')) {
      newLineText = targetLineText.replace(/\/\/\s?/, '');
    } else {
      newLineText = '// ' + targetLineText;
    }

    const newCode = code.substring(0, lineStart) + newLineText + code.substring(lineEnd);
    onChange(newCode);
    setTimeout(() => {
      textarea.focus();
    }, 10);
  };

  const handleDuplicateLine = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lastNewline = code.lastIndexOf('\n', start - 1);
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
    const nextNewline = code.indexOf('\n', start);
    const lineEnd = nextNewline === -1 ? code.length : nextNewline;
    const currentLine = code.substring(lineStart, lineEnd);

    const newCode = code.substring(0, lineEnd) + '\n' + currentLine + code.substring(lineEnd);
    onChange(newCode);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = lineEnd + 1 + currentLine.length;
    }, 10);
  };

  const handleSelectAll = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.select();
  };

  // Add Layer Helper for Visual Mode
  const handleAddNewLayer = (type: 'drums' | 'bass' | 'melody' | 'chords') => {
    let newLayerCode = '';
    if (type === 'drums') {
      newLayerCode = 's("bd [~ bd] sd [~ sd], hh*8").gain(0.85)';
    } else if (type === 'bass') {
      newLayerCode = 'note("<c2 eb2 f2 g2>").s("sawtooth").lpf(800).decay(0.3)';
    } else if (type === 'chords') {
      newLayerCode = 'note("<[c3 e3 g3 b3] [a2 c3 e3 g3]>").s("triangle").room(0.5)';
    } else {
      newLayerCode = 'note("<c4 eb4 g4 bb4>").s("sawtooth").delay(0.25).decay(0.4)';
    }

    let updated = '';
    if (code.includes('stack(')) {
      const lastCloseParen = code.lastIndexOf(')');
      if (lastCloseParen !== -1) {
        const before = code.substring(0, lastCloseParen).trimEnd();
        const needsComma = !before.endsWith(',');
        updated = before + (needsComma ? ',\n  ' : '\n  ') + newLayerCode + '\n' + code.substring(lastCloseParen);
      } else {
        updated = code + '\n' + newLayerCode;
      }
    } else {
      updated = `stack(\n  ${code.trim()},\n  ${newLayerCode}\n)`;
    }

    onChange(updated);
    onEvaluate(updated);
  };

  const showStickyTopBar = isFocused || isPinnedSticky;

  // Helper styling for token badges in visual mode & quick-pick strip
  const getTokenStyle = (type: string) => {
    switch (type) {
      case 'sample':
        return 'bg-pink-500/10 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 border-pink-500/30 hover:bg-pink-500/20';
      case 'note':
        return 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20';
      case 'chord':
        return 'bg-gray-100 text-gray-900 border-gray-200 hover:bg-gray-200';
      case 'subdivision':
        return 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20';
      case 'euclidean':
        return 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20';
      case 'rest':
        return 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200';
      case 'param':
        return 'bg-pink-500/10 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 border-pink-500/30 hover:bg-pink-500/20';
      case 'method':
        return 'bg-gray-100 text-gray-900 border-gray-200 hover:bg-gray-200';
      case 'cycle_bracket':
        return 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20';
      default:
        return 'bg-gray-100 text-gray-900 border-gray-200 hover:bg-gray-200';
    }
  };

  const getRoleHeaderStyle = (role: string) => {
    switch (role) {
      case 'drums':
        return {
          border: 'border-pink-500/40',
          badge: 'bg-pink-500/20 text-pink-600',
          icon: <Volume2 className="w-3.5 h-3.5" />,
          title: 'Drums / Percussion',
        };
      case 'bass':
        return {
          border: 'border-emerald-500/40',
          badge: 'bg-emerald-500/20 text-emerald-600',
          icon: <Music className="w-3.5 h-3.5" />,
          title: 'Bass Voice',
        };
      case 'chords':
        return {
          border: 'border-cyan-500/40',
          badge: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400',
          icon: <Grid className="w-3.5 h-3.5" />,
          title: 'Harmony / Chords',
        };
      case 'melody':
        return {
          border: 'border-pink-500/40',
          badge: 'bg-pink-500/20 text-pink-600',
          icon: <Sparkles className="w-3.5 h-3.5" />,
          title: 'Lead / Melody',
        };
      default:
        return {
          border: 'border-gray-200',
          badge: 'bg-gray-100 text-gray-900',
          icon: <Layers className="w-3.5 h-3.5" />,
          title: 'Pattern Track',
        };
    }
  };

  return (
    <div
      className={`bg-[var(--app-card-1)] rounded-xl border transition-all duration-300 overflow-hidden flex flex-col font-mono select-none relative ${
        isMaximized
          ? 'fixed inset-2 z-50 shadow-2xl bg-[var(--app-card-1)] border-emerald-500/50'
          : isEvalFlashing
          ? 'border-emerald-500 shadow-[0_0_24px_rgba(5,150,105,0.35)] ring-2 ring-emerald-500/80'
          : 'border-gray-200'
      }`}
    >
      {/* Sticky Floating Fast Eval Bar (Active when editor is focused or pinned) */}
      {showStickyTopBar && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-gray-50/95 backdrop-blur-md border border-emerald-500/60 rounded-full px-3 py-1.5 shadow-[0_4px_24px_rgba(5,150,105,0.25)] flex items-center gap-2.5 animate-in slide-in-from-top-3 duration-200 text-xs">
          <div className="flex items-center gap-1.5 pl-1">
            <span
              className={`w-2 h-2 rounded-full ${
                isEvalFlashing ? 'bg-emerald-500 animate-ping' : isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-[#a89f91]'
              }`}
            />
            <span className="text-[10px] font-bold text-gray-900 uppercase tracking-tight hidden sm:inline">
              {isEvalFlashing ? '✓ Live Buffer Synced' : isPlaying ? 'Live Strudel Stream' : 'Live Coding Editor'}
            </span>
          </div>

          <div className="h-3.5 w-px bg-gray-200" />

          {/* Quick Eval Action with Applied Visual Feedback */}
          <button
            onClick={() => triggerSafeEvaluate()}
            className={`px-3 py-1 rounded-full font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 uppercase tracking-tight ${
              isEvalFlashing
                ? 'bg-emerald-500 text-white ring-2 ring-emerald-500 scale-105'
                : 'bg-emerald-500 hover:bg-emerald-500/90 text-white'
            }`}
            title="Evaluate pattern (Ctrl+Enter)"
          >
            {isEvalFlashing ? (
              <>
                <Check className="w-3 h-3 text-white stroke-[3]" />
                <span>APPLIED!</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-black" />
                <span>EVAL (Ctrl+Enter)</span>
              </>
            )}
          </button>

          {/* Stop / Hush Action */}
          <button
            onClick={onHush}
            className="px-2.5 py-1 rounded-full bg-gray-100 hover:bg-pink-500/20 text-gray-900 hover:text-pink-600 border border-gray-200 hover:border-pink-500/40 text-[10px] font-bold flex items-center gap-1 transition-all uppercase"
            title="Stop audio (Ctrl+.)"
          >
            <Square className="w-2.5 h-2.5 fill-current" />
            <span>Hush</span>
          </button>

          <div className="h-3.5 w-px bg-gray-200" />

          {/* Pin Sticky Button */}
          <button
            onClick={() => setIsPinnedSticky((p) => !p)}
            className={`p-1 rounded-full text-[10px] transition-colors ${
              isPinnedSticky ? 'text-emerald-600 bg-emerald-500/20' : 'text-gray-600 hover:text-gray-900'
            }`}
            title={isPinnedSticky ? 'Unpin top bar' : 'Pin top eval bar permanently'}
          >
            {isPinnedSticky ? <Pin className="w-3 h-3 fill-current" /> : <PinOff className="w-3 h-3" />}
          </button>
        </div>
      )}

      {/* Editor Main Header Toolbar */}
      <div className="h-10 px-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2 text-xs">
        {/* Left: View Mode Switcher [Highlighting | Text Code | Visual Nodes] */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-[var(--app-card-1)] p-0.5 rounded-lg border border-gray-200">
            <button
              onClick={() => setEditorViewMode('code')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase flex items-center gap-1 transition-all ${
                editorViewMode === 'code'
                  ? 'bg-pink-500 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Raw text keyboard editor"
            >
              <Code2 className="w-3 h-3" />
              <span>Editor</span>
            </button>

            <button
              onClick={() => setEditorViewMode('highlighted')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase flex items-center gap-1 transition-all ${
                editorViewMode === 'highlighted'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Interactive syntax-highlighted code with touch-to-edit chips"
            >
              <Sparkles className="w-3 h-3" />
              <span>Highlighter</span>
              <span className="bg-black/20 text-current text-[8px] px-1 py-0.2 rounded ml-0.5 hidden sm:inline">
                Touch
              </span>
            </button>

            <button
              onClick={() => setEditorViewMode('visual')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase flex items-center gap-1 transition-all ${
                editorViewMode === 'visual'
                  ? 'bg-cyan-500 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Visual track lane nodes"
            >
              <Layers className="w-3 h-3" />
              <span className="hidden sm:inline">Tracks</span>
            </button>
          </div>

          {/* Auto-Eval on Edit Toggle */}
          <button
            onClick={() => setAutoEvalEnabled((p) => !p)}
            className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase flex items-center gap-1 border transition-all ${
              autoEvalEnabled
                ? 'bg-emerald-500 text-white border-emerald-600 shadow-xs'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-200'
            }`}
            title="Auto-evaluate on every edit (debounced)"
          >
            <Zap className={`w-2.5 h-2.5 ${autoEvalEnabled ? 'fill-current animate-pulse' : ''}`} />
            <span>Auto-Eval: {autoEvalEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {/* Buffer Modified Warning or Live Sync Badge */}
          {hasUnappliedChanges ? (
            <span
              onClick={() => triggerSafeEvaluate()}
              className="cursor-pointer text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-amber-500/20 text-amber-700 border border-amber-500/40 hidden md:flex items-center gap-1 animate-pulse"
              title="Click to evaluate pending changes"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>Press EVAL to apply</span>
            </span>
          ) : lastEvalEvent && lastEvalEvent.success ? (
            <span
              className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase transition-all duration-300 hidden md:flex items-center gap-1 ${
                isEvalFlashing
                  ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(5,150,105,0.5)] scale-105'
                  : 'bg-gray-100 text-gray-600 border border-gray-200'
              }`}
            >
              <Zap className={`w-2.5 h-2.5 ${isEvalFlashing ? 'text-white fill-current' : 'text-emerald-600'}`} />
              <span>{isEvalFlashing ? '✓ Applied Live' : `Cyc #${lastEvalEvent.cycle}`}</span>
            </span>
          ) : null}
        </div>

        {/* Right Action Controls: Undo, Redo, Font Size, Maximize, Copy, Eval */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Quick Undo / Redo Buttons for Touch / Mobile */}
          <div className="flex items-center bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-1.5 text-gray-900 hover:text-emerald-600 hover:bg-gray-200 disabled:opacity-25 transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3 h-3" />
            </button>
            <div className="w-px h-3 bg-gray-200" />
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="p-1.5 text-gray-900 hover:text-emerald-600 hover:bg-gray-200 disabled:opacity-25 transition-colors"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-3 h-3" />
            </button>
          </div>

          {/* Font Size Adjusters */}
          <div className="hidden sm:flex items-center bg-gray-100 rounded-lg border border-gray-200 overflow-hidden text-[10px]">
            <button
              onClick={() => setFontSize((s) => Math.max(11, s - 1))}
              className="px-1.5 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors"
              title="Decrease Font Size"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="px-1 text-gray-600 font-mono text-[9px]">{fontSize}px</span>
            <button
              onClick={() => setFontSize((s) => Math.min(18, s + 1))}
              className="px-1.5 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors"
              title="Increase Font Size"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>

          {/* Maximize Toggle */}
          <button
            onClick={() => setIsMaximized((m) => !m)}
            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 border border-gray-200 transition-colors"
            title={isMaximized ? 'Restore view' : 'Maximize editor'}
          >
            {isMaximized ? <Minimize2 className="w-3 h-3 text-emerald-600" /> : <Maximize2 className="w-3 h-3 text-gray-900" />}
          </button>

          {/* Export to strudel.cc REPL */}
          {onOpenExportRepl && (
            <button
              onClick={onOpenExportRepl}
              className="px-2 py-1 rounded-lg text-[11px] font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 border border-emerald-500/30 flex items-center gap-1 transition-colors"
              title="Send code pattern to official strudel.cc editor"
            >
              <Globe className="w-3 h-3 text-emerald-600" />
              <span className="hidden sm:inline font-semibold">strudel.cc</span>
            </button>
          )}

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="px-2 py-1 rounded-lg text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-200 flex items-center gap-1 transition-colors"
            title="Copy Strudel Code"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-gray-900" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* EVAL Primary Button with Instant Visual Feedback */}
          <button
            id="editor-eval-btn"
            onClick={() => triggerSafeEvaluate()}
            className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 uppercase ${
              isEvalFlashing
                ? 'bg-emerald-500 text-white ring-2 ring-emerald-500 shadow-[0_0_16px_rgba(5,150,105,0.6)] scale-105'
                : hasUnappliedChanges
                ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                : 'bg-emerald-500 hover:bg-emerald-500/90 text-white'
            }`}
            title="Evaluate pattern (Ctrl+Enter)"
          >
            {isEvalFlashing ? (
              <>
                <Check className="w-3 h-3 text-white stroke-[3]" />
                <span>APPLIED!</span>
              </>
            ) : hasUnappliedChanges ? (
              <>
                <Play className="w-2.5 h-2.5 fill-current" />
                <span>APPLY CHANGES</span>
              </>
            ) : (
              <>
                <Play className="w-2.5 h-2.5 fill-black" />
                <span>EVAL (Ctrl+Enter)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* PARSED TOKEN QUICK-PICK STRIP (Touch any parsed note, sample, subdivision in real-time) */}
      <div className="bg-[var(--app-card-1)] border-b border-gray-200 px-3 py-1.5 flex items-center justify-between gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 no-scrollbar">
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 shrink-0 text-[10px] text-gray-900 font-bold uppercase">
            <Zap className="w-3 h-3 text-emerald-600" />
            <span>Quick Tokens:</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 py-0.5">
            {parsedData.allTokens.length > 0 ? (
              parsedData.allTokens.map((token) => (
                <button
                  key={token.id}
                  onClick={() => handleOpenTokenInspector(token)}
                  className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono font-bold transition-all active:scale-95 shrink-0 shadow-sm ${getTokenStyle(
                    token.type
                  )}`}
                  title={`Inspect & modify ${token.raw} (${token.type})`}
                >
                  {token.raw}
                </button>
              ))
            ) : (
              <span className="text-[10px] text-gray-600">No active tokens parsed</span>
            )}
          </div>
        </div>

        <button
          onClick={() => handleOpenAddBlock(null)}
          className="px-2 py-0.5 rounded-lg bg-pink-500/15 hover:bg-pink-500 text-pink-700 hover:text-white border border-pink-500/30 text-[10px] font-bold uppercase transition-all flex items-center gap-1 shrink-0 active:scale-95 shadow-2xs"
          title="Add block of choice behind any block or layer"
        >
          <Plus className="w-3 h-3 stroke-[2.5]" />
          <span>+ Add Block</span>
        </button>
      </div>

      {/* VIEW MODE 1: INTERACTIVE CODE HIGHLIGHTER (MOBILE TOUCH EXCELLENCE) */}
      {editorViewMode === 'highlighted' && (
        <InteractiveCodeHighlighter
          code={code}
          parsedData={parsedData}
          onSelectToken={handleOpenTokenInspector}
          onOpenAddBlock={handleOpenAddBlock}
          onRemoveToken={handleRemoveToken}
          onSwitchToRawEdit={() => setEditorViewMode('code')}
          onEvaluate={onEvaluate}
          fontSize={fontSize}
          isEvalFlashing={isEvalFlashing}
        />
      )}

      {/* VIEW MODE 1: VISUAL NODES & TRACK LAYERS (MOBILE FRIENDLY TOUCH INTERFACE) */}
      {editorViewMode === 'visual' && (
        <div
          className={`p-3 overflow-y-auto bg-[var(--app-card-1)] flex flex-col gap-3 scrollbar-thin scrollbar-thumb-white/10 ${
            isMaximized ? 'min-h-[500px]' : 'min-h-[280px] max-h-[460px]'
          }`}
        >
          {/* Subtitle instructions */}
          <div className="flex items-center justify-between text-[11px] text-gray-600 bg-gray-50 p-2 rounded-lg border border-gray-200">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-gray-900">Tap any block to edit, or tap [+] to insert any sound, rhythm, pitch, or effect behind it</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenAddBlock(null)}
                className="px-2 py-0.5 rounded-md bg-pink-500/20 hover:bg-pink-500 text-pink-700 hover:text-white border border-pink-500/40 text-[10px] font-bold uppercase transition-all flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>+ Add Block</span>
              </button>
              <span className="text-[10px] text-gray-600 uppercase font-mono">{parsedData.layers.length} Tracks</span>
            </div>
          </div>

          {/* Layer Cards */}
          <div className="flex flex-col gap-2.5">
            {parsedData.layers.map((layer, idx) => {
              const roleInfo = getRoleHeaderStyle(layer.role);
              return (
                <div
                  key={layer.id || idx}
                  className={`bg-gray-50 rounded-xl border p-3 flex flex-col gap-2.5 shadow-sm transition-all ${roleInfo.border}`}
                >
                  {/* Layer Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`p-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 uppercase ${roleInfo.badge}`}
                      >
                        {roleInfo.icon}
                        <span>{roleInfo.title}</span>
                      </span>
                      <span className="text-[10px] text-gray-600 font-mono">
                        Line #{layer.lineStart}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const lastTok = layer.tokens.length > 0 ? layer.tokens[layer.tokens.length - 1] : null;
                          handleOpenAddBlock(lastTok, layer.lineStart);
                        }}
                        className="px-2 py-0.5 rounded-md bg-pink-500/15 hover:bg-pink-500 text-pink-700 hover:text-white border border-pink-500/30 text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95"
                        title={`Add block behind this layer`}
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Block</span>
                      </button>

                      <button
                        onClick={() => handleRemoveLayer(layer.lineStart)}
                        className="px-2 py-0.5 rounded-md bg-red-500/15 hover:bg-red-500 text-red-600 hover:text-white border border-red-500/30 text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95"
                        title={`Remove track on line ${layer.lineStart}`}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete Track</span>
                      </button>

                      <span className="text-[10px] text-gray-900 font-mono">
                        {layer.soundSource ? `${layer.soundSource}("...")` : 'Pattern Layer'}
                      </span>
                    </div>
                  </div>

                  {/* Interactive Tokens in Layer */}
                  <div className="bg-[var(--app-card-1)] p-2.5 rounded-lg border border-gray-200 flex flex-wrap items-center gap-1.5">
                    {layer.tokens.map((token) => (
                      <span key={token.id} className="inline-flex items-center shadow-xs">
                        <button
                          onClick={() => handleOpenTokenInspector(token)}
                          className={`px-2.5 py-1 rounded-l-md border-y border-l text-xs font-mono font-bold transition-all active:scale-95 flex items-center gap-1 ${getTokenStyle(
                            token.type
                          )}`}
                          title={`Inspect & modify ${token.raw} (${token.type})`}
                        >
                          <span>{token.raw}</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAddBlock(token, layer.lineStart);
                          }}
                          className="px-1.5 py-1 bg-pink-500/20 hover:bg-pink-500 text-pink-700 hover:text-white border-y border-r border-pink-500/40 text-[10px] font-bold transition-all active:scale-90"
                          title={`Add block behind "${token.raw}"`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveToken(token);
                          }}
                          className="px-1.5 py-1 rounded-r-md bg-red-500/15 hover:bg-red-500 text-red-600 hover:text-white border-y border-r border-red-500/30 text-[10px] font-bold transition-all active:scale-90"
                          title={`Remove block "${token.raw}"`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                    <button
                      onClick={() => {
                        const lastTok = layer.tokens.length > 0 ? layer.tokens[layer.tokens.length - 1] : null;
                        handleOpenAddBlock(lastTok, layer.lineStart);
                      }}
                      className="px-2 py-1 rounded-md bg-gray-100 hover:bg-pink-500/20 text-gray-700 hover:text-pink-600 border border-gray-200 hover:border-pink-500/30 text-xs font-bold flex items-center gap-1 transition-all active:scale-95"
                      title="Add sound, rhythm, pitch, or effect to this layer"
                    >
                      <Plus className="w-3 h-3 text-pink-500" />
                      <span>+ Block</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add New Track Preset Quick Action */}
          <div className="mt-1 pt-2 border-t border-gray-200 flex flex-col gap-1.5">
            <span className="text-[10px] uppercase font-bold text-gray-900">Add Track Layer to Code:</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleAddNewLayer('drums')}
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-pink-500/20 text-pink-600 border border-pink-500/30 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Drum Beat</span>
              </button>

              <button
                onClick={() => handleAddNewLayer('bass')}
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Bassline</span>
              </button>

              <button
                onClick={() => handleAddNewLayer('chords')}
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-cyan-500/20 text-gray-900 border border-cyan-500/30 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Chord Progression</span>
              </button>

              <button
                onClick={() => handleAddNewLayer('melody')}
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-pink-500/20 text-pink-600 border border-pink-500/30 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Melody Lead</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: CODE TEXTAREA WITH MOBILE NOTATION KEYPAD */}
      {editorViewMode === 'code' && (
        <>
          {/* MOBILE-OPTIMIZED QUICK NOTATION & SYMBOL KEYPAD BAR */}
          <div className="bg-[var(--app-card-1)] border-b border-gray-200 px-2 py-1.5 flex flex-col gap-1 text-[11px]">
            {/* Category Tabs for Mobile Keypad */}
            <div className="flex items-center justify-between gap-1 text-[10px]">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveQuickTab('symbols')}
                  className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                    activeQuickTab === 'symbols'
                      ? 'bg-emerald-500 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Symbols
                </button>
                <button
                  onClick={() => setActiveQuickTab('methods')}
                  className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                    activeQuickTab === 'methods'
                      ? 'bg-pink-500 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Functions
                </button>
                <button
                  onClick={() => setActiveQuickTab('tools')}
                  className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                    activeQuickTab === 'tools'
                      ? 'bg-cyan-500 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Edit Tools
                </button>
              </div>

              <span className="text-[9px] text-gray-600 hidden sm:inline">
                Tap symbol to insert or wrap selected text
              </span>
            </div>

            {/* Scrollable Quick-Action Buttons */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-thin scrollbar-thumb-white/10 no-scrollbar touch-pan-x">
              {activeQuickTab === 'symbols' && (
                <>
                  {[
                    { label: '""', insert: '""', isWrap: true, pair: ['"', '"'] },
                    { label: '[ ]', insert: '[]', isWrap: true, pair: ['[', ']'] },
                    { label: '< >', insert: '<>', isWrap: true, pair: ['<', '>'] },
                    { label: '( )', insert: '()', isWrap: true, pair: ['(', ')'] },
                    { label: '*4', insert: '*4' },
                    { label: '*8', insert: '*8' },
                    { label: '/2', insert: '/2' },
                    { label: '~', insert: '~' },
                    { label: '(3,8)', insert: '(3,8)' },
                    { label: '(5,8)', insert: '(5,8)' },
                    { label: ',', insert: ', ' },
                    { label: '?', insert: '?' },
                    { label: '@2', insert: '@2' },
                    { label: '|', insert: ' | ' },
                  ].map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => insertOrWrapSnippet(item.insert, item.isWrap, item.pair as any)}
                      className="min-w-[34px] h-7 px-2 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-emerald-500 active:text-white text-gray-900 border border-gray-200 font-mono text-xs font-bold flex items-center justify-center transition-all shrink-0 active:scale-95 shadow-sm"
                      title={`Insert or wrap with ${item.label}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </>
              )}

              {activeQuickTab === 'methods' && (
                <>
                  {[
                    { label: 's("...")', insert: 's("bd sd, hh*4")' },
                    { label: 'note("<...>")', insert: 'note("<c3 e3 g3 b3>").s("sawtooth")' },
                    { label: 'stack(...)', insert: 'stack(\n  s("bd [~ bd] sd [~ sd]"),\n  s("hh*8").gain(0.6)\n)' },
                    { label: '.lpf(1200)', insert: '.lpf(1200)' },
                    { label: '.decay(0.3)', insert: '.decay(0.3)' },
                    { label: '.delay(0.25)', insert: '.delay(0.25)' },
                    { label: '.room(0.5)', insert: '.room(0.5)' },
                    { label: '.gain(0.8)', insert: '.gain(0.8)' },
                    { label: '.fast(2)', insert: '.fast(2)' },
                    { label: '.rev()', insert: '.rev()' },
                    { label: '.slow(2)', insert: '.slow(2)' },
                  ].map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => insertOrWrapSnippet(item.insert)}
                      className="h-7 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-emerald-500 active:text-white text-gray-900 border border-gray-200 font-mono text-[11px] font-medium flex items-center justify-center transition-all shrink-0 active:scale-95 shadow-sm whitespace-nowrap"
                      title={`Insert ${item.insert}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </>
              )}

              {activeQuickTab === 'tools' && (
                <>
                  <button
                    onClick={handleIndent}
                    className="h-7 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-emerald-500 active:text-white text-gray-900 border border-gray-200 text-[11px] flex items-center gap-1 transition-all shrink-0 active:scale-95"
                    title="Indent (+2 spaces)"
                  >
                    <span>⇥ Indent</span>
                  </button>
                  <button
                    onClick={handleUnindent}
                    className="h-7 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-emerald-500 active:text-white text-gray-900 border border-gray-200 text-[11px] flex items-center gap-1 transition-all shrink-0 active:scale-95"
                    title="Unindent (-2 spaces)"
                  >
                    <span>⇤ Outdent</span>
                  </button>
                  <button
                    onClick={handleToggleComment}
                    className="h-7 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-emerald-500 active:text-white text-gray-900 border border-gray-200 text-[11px] flex items-center gap-1 transition-all shrink-0 active:scale-95"
                    title="Toggle // Comment"
                  >
                    <span>// Comment</span>
                  </button>
                  <button
                    onClick={handleDuplicateLine}
                    className="h-7 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-emerald-500 active:text-white text-gray-900 border border-gray-200 text-[11px] flex items-center gap-1 transition-all shrink-0 active:scale-95"
                    title="Duplicate Line"
                  >
                    <span>⧉ Duplicate</span>
                  </button>
                  <button
                    onClick={handleSelectAll}
                    className="h-7 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-emerald-500 active:text-white text-gray-900 border border-gray-200 text-[11px] flex items-center gap-1 transition-all shrink-0 active:scale-95"
                    title="Select All Code"
                  >
                    <span>⛶ Select All</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Code Textarea with Line Numbers and Synced Feedback */}
          <div
            className={`relative flex flex-1 overflow-hidden bg-[var(--app-card-1)] ${
              isMaximized ? 'min-h-[500px]' : 'min-h-[260px] max-h-[440px]'
            }`}
          >
            {/* Line Numbers Column */}
            <div
              ref={lineNumbersRef}
              className={`select-none py-2.5 pl-3 pr-2 text-right bg-[var(--app-card-1)] border-r transition-colors duration-500 overflow-hidden w-9 shrink-0 ${
                isEvalFlashing ? 'border-emerald-500/80 text-emerald-600 font-bold' : 'border-gray-200 text-gray-600'
              }`}
              style={{ fontSize: `${fontSize - 1}px`, lineHeight: `${fontSize * 1.6}px` }}
            >
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Textarea with Mobile Touch Optimization */}
            <textarea
              ref={textareaRef}
              value={code}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              onScroll={handleScroll}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              autoComplete="off"
              data-gramm="false"
              data-enable-grammarly="false"
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: `${fontSize * 1.6}px`,
              }}
              className="flex-1 w-full bg-transparent p-2.5 text-gray-900 placeholder-[#a89f91]/50 resize-none focus:outline-none leading-relaxed selection:bg-emerald-500/30 selection:text-emerald-900 font-mono overflow-auto"
              placeholder="// Enter Strudel algorithmic pattern here..."
            />

            {/* Transient Flash Overlay during Evaluation */}
            {isEvalFlashing && (
              <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none transition-opacity duration-700 animate-pulse" />
            )}
          </div>
        </>
      )}

      {/* Bottom Status Bar & Evaluation Details */}
      <div className="h-7 bg-gray-50 border-t border-gray-200 px-3 flex items-center justify-between text-[10px] text-gray-600">
        <div className="flex items-center gap-3 font-mono">
          <span>LINES: {lines.length}</span>
          <span>TOKENS: {parsedData.allTokens.length}</span>
          <span className="hidden sm:inline">LANG: Strudel JS</span>
        </div>

        <div className="flex items-center gap-2">
          {isEvalFlashing ? (
            <span className="text-emerald-600 font-bold flex items-center gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              EVAL SYNCED TO DSP BUS
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-emerald-500' : 'bg-[#a89f91]'}`}></span>
              <span className="text-gray-900">{isPlaying ? 'LIVE AUDIBLE' : 'RESTING'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Error Callout Banner with AI Auto-Fix */}
      {errorMessage && (
        <div className="bg-[#241315] border-t border-pink-500/40 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-pink-600">
            <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-ping" />
            <span className="font-bold text-[10px] uppercase">Eval Error:</span>
            <span className="text-gray-900 text-[11px]">{errorMessage}</span>
          </div>

          {onFixWithAI && (
            <button
              onClick={onFixWithAI}
              disabled={isFixing}
              className="px-2.5 py-1 rounded-lg bg-pink-500 hover:bg-pink-500/90 text-white font-bold flex items-center gap-1.5 transition-all text-xs disabled:opacity-50"
            >
              {isFixing ? (
                <>
                  <RotateCcw className="w-3 h-3 animate-spin" />
                  <span>
                    {isFixing && aiProgress && aiProgress.status === 'downloading'
                      ? `Downloading Model... ${Math.round(aiProgress.progress * 100)}%`
                      : isFixing && aiProgress
                      ? aiProgress.text || 'Fixing with AI...'
                      : 'Fixing with AI...'}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 text-gray-900" />
                  <span>Auto-Fix with Gemini AI</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Token Inspector & Value Modal */}
      <TokenInspectorModal
        isOpen={isInspectorOpen}
        token={selectedToken}
        currentCode={code}
        onClose={() => {
          setIsInspectorOpen(false);
          setSelectedToken(null);
        }}
        onApplyTokenValue={handleApplyTokenValue}
        onOpenAddBlockBehind={(tok) => handleOpenAddBlock(tok)}
        onRemoveToken={handleRemoveToken}
      />

      {/* Add Block of Choice Modal (Works across all non-raw modes) */}
      <AddBlockModal
        isOpen={isAddBlockOpen}
        targetToken={addBlockTargetToken}
        targetLineNumber={addBlockTargetLine}
        currentCode={code}
        onClose={() => {
          setIsAddBlockOpen(false);
          setAddBlockTargetToken(null);
          setAddBlockTargetLine(undefined);
        }}
        onInsertBlock={handleInsertBlock}
      />
    </div>
  );
};

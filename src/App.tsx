import React, { useState, useEffect, useCallback } from 'react';
import { StudioHeader } from './components/StudioHeader';
import { PatternVisualizer } from './components/PatternVisualizer';
import { CodeEditor } from './components/CodeEditor';
import { AIPromptBar } from './components/AIPromptBar';
import { AILiveCopilot } from './components/AILiveCopilot';
import { LineByLineBreakdown } from './components/LineByLineBreakdown';
import { NotationGuide } from './components/NotationGuide';
import { PresetSelectorModal } from './components/PresetSelectorModal';
import { SavedSessionsModal } from './components/SavedSessionsModal';
import { ExportReplModal } from './components/ExportReplModal';
import { AIEngineSelectorModal } from './components/AIEngineSelectorModal';
import { STARTER_PRESETS } from './data/presets';
import { audioEngine } from './engine/audioEngine';
import { aiManager } from './ai/aiManager';
import { statusText } from './ai/progressText';
import { event as logEvent } from './ai/diagnostics';
import { AIExplanationResult, AIVariation, TrackPreset, SavedSession, AIEngineProgress, AIEngineType, AI_ENGINE_LABELS } from './types';

import {
  getSavedSessions,
  saveSession,
  getActiveSessionId,
  setActiveSessionId,
} from './utils/sessionStorage';
import { Play, Square, Music, Sparkles, Terminal, BookOpen, Layers } from 'lucide-react';

/**
 * Ceiling on stored variations. Each one holds a full pattern, and sessions
 * are persisted to localStorage — whose quota is comfortably reachable on iOS
 * Safari, where an over-quota write is also silently dropped.
 */
const MAX_VARIATIONS = 40;

export default function App() {
  const [currentTrack, setCurrentTrack] = useState<TrackPreset>(STARTER_PRESETS[0]);
  const [code, setCode] = useState<string>(STARTER_PRESETS[0].code);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(STARTER_PRESETS[0].bpm);
  const [currentCycle, setCurrentCycle] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.85);
  const [cutoff, setCutoff] = useState<number>(12000);
  const [reverb, setReverb] = useState<number>(0.35);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isTweaking, setIsTweaking] = useState<boolean>(false);
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  const [isFixing, setIsFixing] = useState<boolean>(false);
  const [isLoadingVariations, setIsLoadingVariations] = useState<boolean>(false);

  const [explanation, setExplanation] = useState<AIExplanationResult | null>(null);
  const [variations, setVariations] = useState<AIVariation[]>([]);
  const [lastTweakDiffs, setLastTweakDiffs] = useState<string[]>([]);

  /**
   * Which engine produced the pattern currently on screen, and why the
   * selected one did not, when they differ. Rendered as a badge so a user can
   * always tell real model output from the built-in rule-based templates.
   */
  const [resultSource, setResultSource] = useState<{
    producedBy: AIEngineType;
    degraded?: string;
  } | null>(null);

  /**
   * The pattern as it was immediately before the last AI overwrite, so a bad
   * generation is recoverable. Tweak and fix both used to call `setCode()`
   * unconditionally with no way back.
   */
  const [codeBeforeAI, setCodeBeforeAI] = useState<string | null>(null);

  // Modals state
  const [isPresetsOpen, setIsPresetsOpen] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isSessionsOpen, setIsSessionsOpen] = useState<boolean>(false);
  const [isExportReplOpen, setIsExportReplOpen] = useState<boolean>(false);
  const [isAIEngineOpen, setIsAIEngineOpen] = useState<boolean>(false);
  const [savedSessionsCount, setSavedSessionsCount] = useState<number>(0);

  const [aiProgress, setAiProgress] = useState<AIEngineProgress>(aiManager.getProgress());
  const [activeEngine, setActiveEngine] = useState<AIEngineType>(aiManager.getActiveEngine());

  const [activeTab, setActiveTab] = useState<'copilot' | 'breakdown'>('copilot');

  /** True when Gemini is selected but no key has been entered yet. */
  const [needsGeminiKey, setNeedsGeminiKey] = useState<boolean>(false);

  useEffect(() => {
    const unsubProgress = aiManager.onProgress(setAiProgress);
    const unsubEngine = aiManager.onEngineChange(setActiveEngine);
    const unsubCaps = aiManager.onCapabilities((caps) => {
      setNeedsGeminiKey(aiManager.getActiveEngine() === 'cloud-gemini' && !caps.hasGeminiKey);
    });
    return () => {
      unsubProgress();
      unsubEngine();
      unsubCaps();
    };
  }, []);

  // Load initial saved sessions count and default variations
  useEffect(() => {
    const loaded = getSavedSessions();
    setSavedSessionsCount(loaded.length);
    if (loaded.length > 0 && loaded[0].variations) {
      setVariations(loaded[0].variations);
    }
  }, []);

  // Sync engine cycle for header badge
  useEffect(() => {
    const interval = setInterval(() => {
      if (audioEngine.getIsPlaying()) {
        setCurrentCycle(audioEngine.getCurrentCycle());
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
    }, 150);
    return () => clearInterval(interval);
  }, []);

  // Safe code change handler
  const handleCodeChange = useCallback((newCode: string) => {
    if (typeof newCode === 'string') {
      setCode(newCode);
    }
  }, []);

  // Evaluate and play code
  const handleEvaluateAndPlay = useCallback((codeOverride?: string) => {
    const targetCode = typeof codeOverride === 'string' ? codeOverride : code;
    logEvent('user', `EVAL requested — ${targetCode.split('\n').length} lines`);
    if (typeof codeOverride === 'string') {
      setCode(codeOverride);
    }
    const res = audioEngine.evaluate(targetCode);
    if (res.success) {
      setErrorMessage(null);
      audioEngine.setBpm(bpm);
      audioEngine.play();
      setIsPlaying(true);
    } else {
      setErrorMessage(res.error || 'Evaluation failed');
    }
  }, [code, bpm]);

  // Toggle Play / Stop
  const handleTogglePlay = useCallback(() => {
    logEvent('user', isPlaying ? 'CLICK Stop' : 'CLICK Play');
    if (isPlaying) {
      audioEngine.hush();
      setIsPlaying(false);
    } else {
      handleEvaluateAndPlay();
    }
  }, [isPlaying, handleEvaluateAndPlay]);

  // Handle BPM changes
  const handleBpmChange = (newBpm: number) => {
    setBpm(newBpm);
    audioEngine.setBpm(newBpm);
  };

  // Handle Master DSP changes
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    audioEngine.setMasterVolume(newVol);
  };

  const handleCutoffChange = (newCutoff: number) => {
    setCutoff(newCutoff);
    audioEngine.setCutoff(newCutoff);
  };

  const handleReverbChange = (newReverb: number) => {
    setReverb(newReverb);
    audioEngine.setReverb(newReverb);
  };

  // Select a preset track
  const handleSelectTrack = (track: TrackPreset) => {
    logEvent('user', `LOAD preset — "${track.title}" (${track.genre}, ${track.bpm} BPM)`);
    setCurrentTrack(track);
    setCode(track.code);
    setBpm(track.bpm);
    setErrorMessage(null);
    setExplanation(null);
    setLastTweakDiffs([]);

    audioEngine.evaluate(track.code);
    audioEngine.setBpm(track.bpm);
    audioEngine.play();
    setIsPlaying(true);
  };

  // Load a Saved Session
  const handleLoadSession = (session: SavedSession) => {
    logEvent(
      'user',
      `LOAD session — "${session.name}" (${session.bpm} BPM, ${session.variations?.length ?? 0} variations)`,
    );
    setCurrentTrack({
      id: session.id,
      title: session.name,
      genre: session.genre,
      bpm: session.bpm,
      complexity: 'Intermediate',
      code: session.code,
      description: session.description || session.name,
      tags: session.tags || [],
    });
    setCode(session.code);
    setBpm(session.bpm);
    setVariations(session.variations || []);
    setErrorMessage(null);
    setLastTweakDiffs([]);

    audioEngine.evaluate(session.code);
    audioEngine.setBpm(session.bpm);
    audioEngine.play();
    setIsPlaying(true);

    const loaded = getSavedSessions();
    setSavedSessionsCount(loaded.length);
  };

  // Load a single variation directly into the editor
  const handleLoadVariation = (variationCode: string, title: string) => {
    logEvent('user', `LOAD variation — "${title}"`);
    setCode(variationCode);
    const evalRes = audioEngine.evaluate(variationCode);
    if (evalRes.success) {
      setErrorMessage(null);
      audioEngine.play();
      setIsPlaying(true);
      setLastTweakDiffs([`Switched to variation: "${title}"`]);
    } else {
      setErrorMessage(evalRes.error || 'Error evaluating variation');
    }
  };

  // Save a specific variation to the current session in storage
  const handleSaveVariationToSession = (variation: AIVariation) => {
    const activeId = getActiveSessionId();
    const sessions = getSavedSessions();
    const activeSession = sessions.find((s) => s.id === activeId) || sessions[0];

    const newVar: AIVariation = {
      ...variation,
      id: variation.id || 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      createdAt: variation.createdAt || Date.now(),
    };

    if (activeSession) {
      const existingVars = activeSession.variations || [];
      const isAlreadyIn = existingVars.some((v) => v.code.trim() === variation.code.trim());
      if (!isAlreadyIn) {
        activeSession.variations = [newVar, ...existingVars];
        saveSession(activeSession);
      }
    }

    setVariations((prev) => {
      const exists = prev.some((v) => v.code.trim() === variation.code.trim());
      return exists ? prev : [newVar, ...prev];
    });

    setSavedSessionsCount(getSavedSessions().length);
  };

  // Add custom user variation snapshot
  const handleAddCustomVariation = (title: string, customCode: string) => {
    logEvent('user', `ADD custom variation — "${title}"`);
    const customVar: AIVariation = {
      id: 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      title,
      type: 'drop',
      description: `Snapshot created on ${new Date().toLocaleTimeString()}`,
      code: customCode,
      createdAt: Date.now(),
    };

    setVariations((prev) => [customVar, ...prev]);
    handleSaveVariationToSession(customVar);
  };

  // Quick save current workspace
  const handleQuickSave = () => {
    const activeId = getActiveSessionId();
    const sessions = getSavedSessions();
    const existing = sessions.find((s) => s.id === activeId);

    const sessionToSave: SavedSession = {
      id: existing ? existing.id : 'session-' + Date.now(),
      name: existing ? existing.name : currentTrack.title || 'Studio Session',
      code: code,
      bpm: bpm,
      genre: currentTrack.genre || 'Electronic',
      tags: currentTrack.tags || ['Live'],
      description: `Session with ${variations.length} variations`,
      variations: variations,
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now(),
    };

    const updatedList = saveSession(sessionToSave);
    setSavedSessionsCount(updatedList.length);
  };

  // 1. Generate Track with AI (Client-Side Gemma / Heuristics / Cloud)
  const handleGenerateAI = async (
    prompt: string,
    style: string,
    complexity: 'Beginner' | 'Intermediate' | 'Advanced'
  ) => {
    logEvent('user', `CLICK Generate — "${prompt}" | style=${style} | complexity=${complexity} | bpm=${bpm}`);
    setIsGenerating(true);
    setErrorMessage(null);

    // Unlock audio NOW, while we are still inside the user's click. iOS Safari
    // refuses to resume a suspended AudioContext outside a gesture, and the
    // `await` below leaves that gesture — which is why generated patterns used
    // to report success and then play nothing on iPhone.
    audioEngine.unlock();

    try {
      const result = await aiManager.generateTrack(prompt, style, complexity, bpm);
      const generated = result.data;
      setResultSource({ producedBy: result.producedBy, degraded: result.degraded });
      if (generated && generated.code) {
        setCodeBeforeAI(code);
        setCode(generated.code);
        if (generated.bpm) {
          setBpm(generated.bpm);
          audioEngine.setBpm(generated.bpm);
        }
        setCurrentTrack({
          id: 'ai-generated-' + Date.now(),
          title: generated.title || 'AI Algorithmic Track',
          genre: generated.genre || style || 'Electronic',
          bpm: generated.bpm || bpm,
          complexity: complexity,
          code: generated.code,
          description: generated.explanation || prompt,
          tags: ['AI Generated', style, complexity],
        });

        // Set initial explanation from generation
        setExplanation({
          summary: generated.explanation || `Algorithmic composition generated for: "${prompt}"`,
          lineByLine: generated.notationBreakdown?.map((b: any) => ({
            line: b.symbolOrMethod,
            role: 'Harmony',
            explanation: b.meaning,
          })) || [],
          miniNotationGuide: [],
          musicTheoryTip: `Target BPM ${generated.bpm || bpm} with layered polyphonic mini-notation structures.`,
        });

        // Auto evaluate & play
        const evalRes = audioEngine.evaluate(generated.code);
        if (evalRes.success) {
          audioEngine.play();
          setIsPlaying(true);
        } else {
          setErrorMessage(evalRes.error || 'Syntax error in generated pattern');
        }
      } else {
        setErrorMessage('Failed to generate track with AI');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error during AI generation');
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. Tweak Pattern with Natural Language
  const handleTweakCode = async (instruction: string) => {
    logEvent('user', `CLICK Tweak — "${instruction}"`);
    setIsTweaking(true);
    audioEngine.unlock();
    try {
      const result = await aiManager.tweakPattern(code, instruction);
      const tweaked = result.data;
      setResultSource({ producedBy: result.producedBy, degraded: result.degraded });
      if (tweaked && tweaked.code) {
        setCodeBeforeAI(code);
        setCode(tweaked.code);
        setLastTweakDiffs(
          tweaked.diffHighlights?.length ? tweaked.diffHighlights : [tweaked.summary],
        );

        // Evaluate updated code live
        const evalRes = audioEngine.evaluate(tweaked.code);
        if (evalRes.success) {
          setErrorMessage(null);
          audioEngine.play();
          setIsPlaying(true);
        } else {
          setErrorMessage(evalRes.error || 'Error evaluating tweaked code');
        }
      } else {
        setErrorMessage('Failed to tweak pattern');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error during tweak');
    } finally {
      setIsTweaking(false);
    }
  };

  // 3. Explain Code Line-By-Line
  const handleExplainCode = async () => {
    logEvent('user', 'CLICK Explain code');
    setIsExplaining(true);
    setActiveTab('breakdown');
    try {
      const result = await aiManager.explainCode(code);
      setResultSource({ producedBy: result.producedBy, degraded: result.degraded });
      if (result.data) {
        setExplanation(result.data);
      }
    } catch (err: any) {
      console.error('Explanation error:', err);
    } finally {
      setIsExplaining(false);
    }
  };

  // 4. Request Live DJ Variations
  const handleRequestVariations = async (mood: string) => {
    logEvent('user', `CLICK Variations — mood="${mood}"`);
    setIsLoadingVariations(true);
    try {
      const result = await aiManager.suggestVariations(code, mood);
      setResultSource({ producedBy: result.producedBy, degraded: result.degraded });
      const res = result.data;
      if (res && res.variations && res.variations.length > 0) {
        const incoming = res.variations.map((v: AIVariation) => ({
          ...v,
          id: v.id || 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          createdAt: Date.now(),
        }));

        // Accumulate across regenerations, but drop exact duplicates and cap
        // the list. This previously appended `incoming` wholesale whenever
        // every item was a duplicate, so repeated clicks grew the array — and
        // the persisted session — without bound until localStorage filled up.
        setVariations((prev) => {
          const existingCodes = new Set(prev.map((p) => p.code.trim()));
          const fresh = incoming.filter((v) => !existingCodes.has(v.code.trim()));
          return [...fresh, ...prev].slice(0, MAX_VARIATIONS);
        });

        // Auto-save generated variations to active session if exists
        const activeId = getActiveSessionId();
        if (activeId) {
          const sessions = getSavedSessions();
          const target = sessions.find((s) => s.id === activeId);
          if (target) {
            // Capped for the same reason as the in-memory list: sessions are
            // persisted to localStorage, whose quota is small on iOS Safari.
            target.variations = [...incoming, ...(target.variations || [])].slice(
              0,
              MAX_VARIATIONS,
            );
            saveSession(target);
          }
        }
      }
    } catch (err: any) {
      console.error('Variations error:', err);
    } finally {
      setIsLoadingVariations(false);
    }
  };

  const handleDeleteVariation = (variationId: string) => {
    setVariations((prev) => prev.filter((v) => v.id !== variationId));
  };

  const handleClearVariations = () => {
    setVariations([]);
  };

  // Apply a variation immediately
  const handleApplyVariation = (variationCode: string) => {
    // Unlogged, this produced `EVALUATED OK` lines in the session trace with
    // no user action to explain them — thirteen of them in one session, which
    // made the trace look like the app was evaluating patterns by itself.
    logEvent('user', `APPLY variation — ${variationCode.split('\n').length} lines`);
    setCode(variationCode);
    const evalRes = audioEngine.evaluate(variationCode);
    if (evalRes.success) {
      setErrorMessage(null);
      audioEngine.play();
      setIsPlaying(true);
    } else {
      setErrorMessage(evalRes.error || 'Error evaluating variation');
    }
  };

  // 5. Fix Errors with AI
  const handleFixWithAI = async () => {
    logEvent('user', `CLICK Fix with AI — error was: ${errorMessage}`);
    if (!errorMessage) return;
    setIsFixing(true);
    audioEngine.unlock();
    try {
      const result = await aiManager.fixCode(code, errorMessage);
      const fixed = result.data;
      setResultSource({ producedBy: result.producedBy, degraded: result.degraded });

      if (fixed && fixed.fixedCode) {
        const evalRes = audioEngine.evaluate(fixed.fixedCode);

        // Only accept a fix that actually parses. The old code overwrote the
        // buffer and cleared the error unconditionally, so a bad "fix" left
        // the user with unusable code, no error to explain it, and no undo.
        if (evalRes.success) {
          setCodeBeforeAI(code);
          setCode(fixed.fixedCode);
          setErrorMessage(null);
          setLastTweakDiffs([fixed.fixExplanation || fixed.reason]);
          audioEngine.play();
          setIsPlaying(true);
        } else {
          setErrorMessage(
            `${errorMessage} — the suggested fix did not parse either, so your code was left as it was.`,
          );
        }
      }
    } catch (err: any) {
      console.error('Fix error:', err);
    } finally {
      setIsFixing(false);
    }
  };

  // Insert notation snippet from guide or toolbar
  const handleInsertSnippet = (snippet: string) => {
    setCode((prev) => prev + '\n' + snippet);
  };

  return (
    <div className="min-h-[100dvh] bg-[var(--app-bg)] text-gray-900 flex flex-col selection:bg-emerald-500/30">
      {/* Studio Header with Sessions & REPL Export */}
      <StudioHeader
        isPlaying={isPlaying}
        bpm={bpm}
        onTogglePlay={handleTogglePlay}
        onBpmChange={handleBpmChange}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        cutoff={cutoff}
        onCutoffChange={handleCutoffChange}
        reverb={reverb}
        onReverbChange={handleReverbChange}
        currentCycle={currentCycle}
        onOpenPresets={() => setIsPresetsOpen(true)}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenSessions={() => setIsSessionsOpen(true)}
        onOpenExportRepl={() => setIsExportReplOpen(true)}
        onQuickSave={handleQuickSave}
        savedSessionsCount={savedSessionsCount}
        trackTitle={currentTrack.title}
        onOpenAIEngine={() => setIsAIEngineOpen(true)}
      />


      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-5 sm:gap-6 font-mono">
        {/* Transport & Tempo Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--app-card-1)] p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={handleTogglePlay}
              className={`px-4 py-2 rounded-lg text-sm font-bold font-mono flex items-center gap-2 transition-all shadow-sm active:scale-95 uppercase tracking-wide ${
                isPlaying
                  ? 'bg-pink-500 text-white shadow-[0_0_12px_rgba(219,39,119,0.4)] border border-pink-500'
                  : 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(5,150,105,0.35)] border border-emerald-500 hover:bg-emerald-500/90'
              }`}
            >
              {isPlaying ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>STOP</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>PLAY</span>
                </>
              )}
            </button>
            <button
              onClick={() => {
                // Was `if (isPlaying) handleTogglePlay(); audioEngine.hush();`
                // — handleTogglePlay already hushes, so this ran hush twice
                // and logged the click as "CLICK Stop".
                logEvent('user', 'CLICK Hush');
                audioEngine.hush();
                setIsPlaying(false);
              }}
              className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 text-gray-700 hover:text-gray-900 text-sm font-mono flex items-center gap-1.5 transition-colors uppercase"
            >
              Hush
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Tempo</span>
            <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
              <input
                type="number"
                min={30}
                max={280}
                value={bpm}
                onChange={(e) => handleBpmChange(Number(e.target.value))}
                className="w-12 bg-transparent text-sm font-mono font-bold text-gray-900 text-right focus:outline-none focus:text-emerald-600"
              />
              <span className="text-[11px] text-pink-600 font-bold">BPM</span>
            </div>
          </div>
        </div>

        {/* Natural Language Prompt Bar */}
        {/*
          Gemini is selected but unconfigured. Without this the only signal was
          a failed generation, and the key field lives inside a modal the user
          has no reason to open.
        */}
        {needsGeminiKey && (
          <div className="mb-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3.5 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-emerald-900">
                Gemini needs your API key before it can generate anything.
              </p>
              <p className="text-[11px] text-emerald-800">
                It is free, stored only in this browser, and takes about a minute to create.
              </p>
            </div>
            <button
              onClick={() => setIsAIEngineOpen(true)}
              className="min-h-11 px-4 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shrink-0"
            >
              Add API key
            </button>
          </div>
        )}

        <AIPromptBar onGenerate={handleGenerateAI} isLoading={isGenerating} aiProgress={aiProgress} />

        {/*
          Provenance badge. The payoff of `AIEngineResult`: whatever happens,
          the user can see which engine actually wrote the pattern in front of
          them, and can undo it. Previously a failed cloud call, a broken local
          worker and a real model answer were indistinguishable on screen.
        */}
        {resultSource && (
          <div
            role="status"
            className={`mt-3 rounded-xl border px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] ${
              resultSource.degraded
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-gray-50 border-gray-200 text-gray-700'
            }`}
          >
            <span className="font-bold">
              Written by: {AI_ENGINE_LABELS[resultSource.producedBy]}
            </span>
            {resultSource.degraded && (
              <span>
                {AI_ENGINE_LABELS[activeEngine]} could not run — {resultSource.degraded}
              </span>
            )}
            {codeBeforeAI !== null && codeBeforeAI !== code && (
              <button
                onClick={() => {
                  logEvent('user', 'CLICK Undo — restoring the pattern from before the AI edit');
                  setCode(codeBeforeAI);
                  setCodeBeforeAI(null);
                  setResultSource(null);
                  const res = audioEngine.evaluate(codeBeforeAI);
                  setErrorMessage(res.success ? null : res.error || 'Evaluation failed');
                }}
                className="ml-auto min-h-11 sm:min-h-0 sm:py-1 px-2.5 rounded-lg font-bold underline hover:no-underline"
              >
                Undo, restore my pattern
              </button>
            )}
          </div>
        )}

        {/* Real-time Oscilloscope & Radar Visualizer */}
        <PatternVisualizer isPlaying={isPlaying} bpm={bpm} />

        {/* Two-Column Studio Layout: Code Editor + AI Assistant */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          {/* Left / Main: Live Code Editor (7 cols on lg) */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <CodeEditor
              code={code}
              onChange={handleCodeChange}
              onEvaluate={handleEvaluateAndPlay}
              onHush={() => {
                logEvent('user', 'CLICK Hush (editor)');
                audioEngine.hush();
                setIsPlaying(false);
              }}
              isPlaying={isPlaying}
              errorMessage={errorMessage}
              onFixWithAI={handleFixWithAI}
              isFixing={isFixing}
              aiProgress={aiProgress}
              onOpenExportRepl={() => setIsExportReplOpen(true)}
            />

            {/* Quick Track Metadata Info Card */}
            <div className="bg-[var(--app-card-1)] rounded p-2.5 border border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <Music className="w-3.5 h-3.5 text-orange-600" />
                <span className="font-bold text-gray-900 text-[11px]">{currentTrack.title}</span>
                <span className="text-gray-400 font-mono">•</span>
                <span className="text-gray-600 text-[10px] uppercase">{currentTrack.genre}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsExportReplOpen(true)}
                  className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 transition-colors uppercase"
                  title="Export to strudel.cc REPL"
                >
                  <span>strudel.cc REPL</span>
                </button>

                <button
                  onClick={handleExplainCode}
                  disabled={isExplaining}
                  className="px-2 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 border border-cyan-500/30 text-[10px] font-bold flex items-center gap-1 transition-colors uppercase"
                >
                  <BookOpen className="w-3 h-3" />
                  <span>
                    {isExplaining && aiProgress && aiProgress.status === 'downloading'
                      ? `Downloading Model... ${Math.round(aiProgress.progress * 100)}%`
                      : isExplaining && aiProgress
                      ? statusText(aiProgress, 'Analyzing...')
                      : 'Explain Code'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Right: AI Copilot & Breakdown Tabs (5 cols on lg) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            {/* View Switcher Tabs */}
            <div className="flex items-center p-0.5 bg-[var(--app-card-1)] rounded border border-gray-200 text-xs">
              <button
                onClick={() => setActiveTab('copilot')}
                className={`flex-1 py-1.5 px-2.5 rounded text-[10px] uppercase font-bold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'copilot'
                    ? 'bg-cyan-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>AI Copilot & Tweaks</span>
              </button>

              <button
                onClick={() => setActiveTab('breakdown')}
                className={`flex-1 py-1.5 px-2.5 rounded text-[10px] uppercase font-bold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'breakdown'
                    ? 'bg-cyan-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <BookOpen className="w-3 h-3" />
                <span>Theory & Guide</span>
              </button>
            </div>

            {/* Tab Contents */}
            {activeTab === 'copilot' ? (
              <AILiveCopilot
                currentCode={code}
                onTweakCode={handleTweakCode}
                onApplyVariation={handleApplyVariation}
                onRequestVariations={handleRequestVariations}
                variations={variations}
                isTweaking={isTweaking}
                isLoadingVariations={isLoadingVariations}
                aiProgress={aiProgress}
                lastTweakDiffs={lastTweakDiffs}
                onSaveVariationToSession={handleSaveVariationToSession}
                onAddCustomVariation={handleAddCustomVariation}
                onDeleteVariation={handleDeleteVariation}
                onClearVariations={handleClearVariations}
                onOpenSessionsModal={() => setIsSessionsOpen(true)}
              />
            ) : (
              <LineByLineBreakdown
                explanation={explanation}
                isLoading={isExplaining}
                onExplainCode={handleExplainCode}
                onInsertSymbol={handleInsertSnippet}
              />
            )}
          </div>
        </div>
      </main>

      {/* AI Engine & Local WebGPU Runtime Modal */}
      <AIEngineSelectorModal
        isOpen={isAIEngineOpen}
        onClose={() => setIsAIEngineOpen(false)}
      />

      {/* Saved Sessions & Variations Management Modal */}

      <SavedSessionsModal
        isOpen={isSessionsOpen}
        onClose={() => setIsSessionsOpen(false)}
        currentCode={code}
        currentBpm={bpm}
        currentGenre={currentTrack.genre || 'Electronic'}
        currentTrackTitle={currentTrack.title}
        currentVariations={variations}
        onLoadSession={handleLoadSession}
        onLoadVariation={handleLoadVariation}
      />

      {/* Official Strudel REPL Export Modal */}
      <ExportReplModal
        isOpen={isExportReplOpen}
        onClose={() => setIsExportReplOpen(false)}
        code={code}
        trackTitle={currentTrack.title}
        bpm={bpm}
      />

      {/* Preset Tracks Drawer/Modal */}
      <PresetSelectorModal
        isOpen={isPresetsOpen}
        onClose={() => setIsPresetsOpen(false)}
        onSelectTrack={handleSelectTrack}
        currentTrackId={currentTrack.id}
      />

      {/* Mini-Notation Guide Modal */}
      <NotationGuide
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onInsertSnippet={handleInsertSnippet}
      />

      {/* Studio Footer */}
      <footer className="mt-auto border-t border-gray-200 bg-gray-100 py-2.5 px-4 text-[10px] font-mono text-gray-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            <span>Strudel Algorithmic Web Audio Runtime</span>
          </div>
          <div className="flex items-center gap-3 text-gray-500">
            <span>Engine: Strudel Mini-Notation</span>
            <span>•</span>
            {/* Reads the live engine. This used to be the hardcoded string
                "AI: Gemini 3.7 Flash", which was shown even when no model had
                been contacted at all. */}
            <span>AI: {AI_ENGINE_LABELS[activeEngine]}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

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
import { AIExplanationResult, AIVariation, TrackPreset, SavedSession, AIEngineProgress, AIEngineType } from './types';

import {
  getSavedSessions,
  saveSession,
  getActiveSessionId,
  setActiveSessionId,
} from './utils/sessionStorage';
import { Play, Square, Music, Sparkles, Terminal, BookOpen, Layers } from 'lucide-react';

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

  useEffect(() => {
    const unsubProgress = aiManager.onProgress(setAiProgress);
    const unsubEngine = aiManager.onEngineChange(setActiveEngine);
    return () => {
      unsubProgress();
      unsubEngine();
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
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const generated = await aiManager.generateTrack(prompt, style, complexity, bpm);
      if (generated && generated.code) {
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
    setIsTweaking(true);
    try {
      const tweaked = await aiManager.tweakPattern(code, instruction);
      if (tweaked && tweaked.code) {
        setCode(tweaked.code);
        setLastTweakDiffs(tweaked.diffHighlights || [tweaked.summary]);

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
    setIsExplaining(true);
    setActiveTab('breakdown');
    try {
      const res = await aiManager.explainCode(code);
      if (res) {
        setExplanation(res);
      }
    } catch (err: any) {
      console.error('Explanation error:', err);
    } finally {
      setIsExplaining(false);
    }
  };

  // 4. Request Live DJ Variations
  const handleRequestVariations = async (mood: string) => {
    setIsLoadingVariations(true);
    try {
      const res = await aiManager.suggestVariations(code, mood);
      if (res && res.variations && res.variations.length > 0) {
        const incoming = res.variations.map((v: AIVariation) => ({
          ...v,
          id: v.id || 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          createdAt: Date.now(),
        }));

        // Accumulate variations so users can regenerate multiple times
        setVariations((prev) => {
          const existingCodes = new Set(prev.map((p) => p.code.trim()));
          const fresh = incoming.filter((v) => !existingCodes.has(v.code.trim()));
          const toAdd = fresh.length > 0 ? fresh : incoming;
          return [...toAdd, ...prev];
        });

        // Auto-save generated variations to active session if exists
        const activeId = getActiveSessionId();
        if (activeId) {
          const sessions = getSavedSessions();
          const target = sessions.find((s) => s.id === activeId);
          if (target) {
            target.variations = [...incoming, ...(target.variations || [])];
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
    if (!errorMessage) return;
    setIsFixing(true);
    try {
      const fixed = await aiManager.fixCode(code, errorMessage);
      if (fixed && fixed.fixedCode) {
        setCode(fixed.fixedCode);
        setErrorMessage(null);
        setLastTweakDiffs([fixed.fixExplanation || fixed.reason]);

        const evalRes = audioEngine.evaluate(fixed.fixedCode);
        if (evalRes.success) {
          audioEngine.play();
          setIsPlaying(true);
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
    <div className="min-h-screen bg-[var(--app-bg)] text-gray-900 flex flex-col selection:bg-emerald-500/30">
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
                if (isPlaying) handleTogglePlay();
                audioEngine.hush();
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
        <AIPromptBar onGenerate={handleGenerateAI} isLoading={isGenerating} aiProgress={aiProgress} />

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
                      ? aiProgress.text || 'Analyzing...'
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
            <span>AI: Gemini 3.7 Flash</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

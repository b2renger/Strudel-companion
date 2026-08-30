import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Save,
  Trash2,
  Copy,
  Plus,
  Play,
  ExternalLink,
  Download,
  Upload,
  Search,
  Check,
  Sparkles,
  Layers,
  Flame,
  X,
  Clock,
  Music,
  Tag,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { SavedSession, AIVariation } from '../types';
import {
  getSavedSessions,
  saveSession,
  deleteSession,
  duplicateSession,
  exportSessionsToJSON,
  importSessionsFromJSON,
  getActiveSessionId,
  setActiveSessionId,
} from '../utils/sessionStorage';
import { openInOfficialStrudel } from '../utils/strudelExport';

interface SavedSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCode: string;
  currentBpm: number;
  currentGenre: string;
  currentTrackTitle: string;
  currentVariations: AIVariation[];
  onLoadSession: (session: SavedSession) => void;
  onLoadVariation: (variationCode: string, title: string) => void;
}

export const SavedSessionsModal: React.FC<SavedSessionsModalProps> = ({
  isOpen,
  onClose,
  currentCode,
  currentBpm,
  currentGenre,
  currentTrackTitle,
  currentVariations,
  onLoadSession,
  onLoadVariation,
}) => {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // New / Save Form State
  const [sessionName, setSessionName] = useState('');
  const [sessionGenre, setSessionGenre] = useState('');
  const [sessionTags, setSessionTags] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Active loaded session tracking
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const loaded = getSavedSessions();
      setSessions(loaded);
      const currentActive = getActiveSessionId();
      setActiveId(currentActive);

      // Pre-fill save form
      setSessionName(currentTrackTitle || 'My Algorithmic Jam');
      setSessionGenre(currentGenre || 'Electronic');
      setSessionTags('Live, Session');
    }
  }, [isOpen, currentTrackTitle, currentGenre]);

  if (!isOpen) return null;

  const handleSaveAsNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim()) return;

    const tags = sessionTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const newSession: SavedSession = {
      id: 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      name: sessionName.trim(),
      code: currentCode,
      bpm: currentBpm,
      genre: sessionGenre.trim() || 'Electronic',
      tags: tags.length > 0 ? tags : ['Live'],
      description: `Saved session with ${currentVariations.length} performance variations.`,
      variations: currentVariations.map((v) => ({
        ...v,
        id: v.id || 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        createdAt: v.createdAt || Date.now(),
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = saveSession(newSession);
    setSessions(updated);
    setActiveId(newSession.id);
    setSaveSuccessMsg(`Session "${newSession.name}" saved!`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleUpdateActive = () => {
    if (!activeId) return;
    const existing = sessions.find((s) => s.id === activeId);
    if (!existing) return;

    const updated: SavedSession = {
      ...existing,
      code: currentCode,
      bpm: currentBpm,
      genre: sessionGenre.trim() || existing.genre,
      variations: currentVariations.map((v) => ({
        ...v,
        id: v.id || 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        createdAt: v.createdAt || Date.now(),
      })),
      updatedAt: Date.now(),
    };

    const nextSessions = saveSession(updated);
    setSessions(nextSessions);
    setSaveSuccessMsg(`Updated "${existing.name}" with current code & variations!`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete session "${name}"?`)) {
      const updated = deleteSession(id);
      setSessions(updated);
      if (activeId === id) setActiveId(null);
    }
  };

  const handleDuplicate = (id: string) => {
    const dup = duplicateSession(id);
    if (dup) {
      setSessions(getSavedSessions());
      setSaveSuccessMsg(`Duplicated as "${dup.name}"`);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  const handleLoad = (session: SavedSession) => {
    setActiveSessionId(session.id);
    setActiveId(session.id);
    onLoadSession(session);
    onClose();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const imported = importSessionsFromJSON(text);
        setSessions(imported);
        setSaveSuccessMsg(`Imported ${imported.length} sessions successfully!`);
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      } catch (err: any) {
        alert('Failed to import JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Filter sessions
  const allGenres = ['All', ...Array.from(new Set(sessions.map((s) => s.genre).filter(Boolean)))];

  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.genre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesGenre = selectedGenre === 'All' || s.genre === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-[var(--app-card-1)] border border-gray-200 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl font-mono overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 flex items-center justify-center shadow-inner">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-tight">
                  Saved Sessions & Variations
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-800 font-bold">
                  {sessions.length} Saved
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Save master tracks, tempo, and generated DJ transitions with persistent storage
              </p>
            </div>
          </div>

          {/* Right Action: Backup JSON & Close */}
          <div className="flex items-center gap-2">
            <button
              onClick={exportSessionsToJSON}
              className="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 border border-gray-200 text-[11px] font-bold flex items-center gap-1.5 transition-all uppercase"
              title="Export all sessions to backup JSON file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export Backup</span>
            </button>

            <label className="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 border border-gray-200 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer uppercase">
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Import JSON</span>
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 hover:text-gray-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {saveSuccessMsg && (
          <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-600 text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-1">
            <Check className="w-4 h-4" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* Quick Save Bar for Current Workspace */}
        <div className="p-3.5 bg-gray-50/40 border-b border-gray-200">
          <form onSubmit={handleSaveAsNew} className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 uppercase tracking-tight shrink-0">
              <Save className="w-3.5 h-3.5 text-emerald-600" />
              <span>Save Workspace:</span>
            </div>

            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="Session name..."
              className="flex-1 min-w-[150px] bg-[var(--app-card-1)] border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 placeholder-[#736a5d] focus:outline-none focus:border-emerald-500"
            />

            <input
              type="text"
              value={sessionGenre}
              onChange={(e) => setSessionGenre(e.target.value)}
              placeholder="Genre (e.g. Acid, Lo-Fi)..."
              className="w-36 bg-[var(--app-card-1)] border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 placeholder-[#736a5d] focus:outline-none focus:border-emerald-500 hidden sm:block"
            />

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all uppercase tracking-tight"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save New</span>
              </button>

              {activeId && (
                <button
                  type="button"
                  onClick={handleUpdateActive}
                  className="px-3 py-1.5 rounded-lg bg-pink-500 hover:bg-pink-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all uppercase tracking-tight"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Update Current</span>
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="px-4 py-2.5 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2.5 bg-[var(--app-card-1)]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions by name, genre, or tag..."
              className="w-full pl-8 pr-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-[#736a5d] focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Genre Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {allGenres.slice(0, 6).map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGenre(g)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-all whitespace-nowrap ${
                  selectedGenre === g
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Session Card List */}
        <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-3">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center justify-center gap-2 text-gray-500">
              <FolderOpen className="w-8 h-8 stroke-1 text-gray-400" />
              <p className="text-xs font-bold uppercase">No sessions found</p>
              <p className="text-[11px]">Save your current track above to create your first session snapshot.</p>
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isExpanded = expandedSessionId === session.id;
              const isCurrentActive = activeId === session.id;

              return (
                <div
                  key={session.id}
                  className={`bg-[var(--app-card-1)] border rounded-xl p-3.5 flex flex-col gap-3 transition-all ${
                    isCurrentActive
                      ? 'border-emerald-500 shadow-[0_0_12px_rgba(5,150,105,0.15)] ring-1 ring-emerald-500/30'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Main Session Row */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-900 tracking-tight">
                          {session.name}
                        </span>
                        {isCurrentActive && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500 text-white font-bold uppercase">
                            Active
                          </span>
                        )}
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-700 border border-gray-200 font-semibold">
                          {session.bpm} BPM
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-pink-500/10 text-pink-600 border border-pink-500/30 font-semibold uppercase">
                          {session.genre}
                        </span>
                      </div>

                      <p className="text-[11px] text-gray-600 line-clamp-1">
                        {session.description || 'Custom session pattern'}
                      </p>

                      <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                          <Flame className="w-3 h-3" />
                          <span>{session.variations.length} Variations Saved</span>
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleLoad(session)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all uppercase tracking-tight"
                        title="Load master pattern and its variations"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Load</span>
                      </button>

                      <button
                        onClick={() => openInOfficialStrudel(session.code)}
                        className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 border border-gray-200 transition-colors"
                        title="Open in Official Strudel.cc REPL"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDuplicate(session.id)}
                        className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 border border-gray-200 transition-colors"
                        title="Duplicate session"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDelete(session.id, session.name)}
                        className="p-1.5 rounded-lg bg-gray-100 hover:bg-red-500/20 text-gray-700 hover:text-red-600 border border-gray-200 transition-colors"
                        title="Delete session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {session.variations.length > 0 && (
                        <button
                          onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                          className="px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-[10px] font-bold flex items-center gap-1 border border-gray-200 transition-all uppercase"
                        >
                          <span>Variations ({session.variations.length})</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Variations Accordion */}
                  {isExpanded && session.variations.length > 0 && (
                    <div className="pt-3 border-t border-gray-200 flex flex-col gap-2 bg-gray-50/50 -mx-3.5 -mb-3.5 p-3.5 rounded-b-xl animate-in slide-in-from-top-2 duration-150">
                      <div className="flex items-center justify-between text-[10px] font-bold text-gray-700 uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <Flame className="w-3 h-3 text-pink-600" />
                          <span>Saved Performance Variations for "{session.name}"</span>
                        </span>
                        <span className="text-gray-500">{session.variations.length} available</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {session.variations.map((v, i) => (
                          <div
                            key={v.id || i}
                            className="bg-[var(--app-card-1)] border border-gray-200 rounded-lg p-2.5 flex flex-col justify-between gap-2 shadow-sm hover:border-emerald-500/40 transition-colors"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-bold text-gray-900 truncate">
                                  {v.title}
                                </span>
                                <span className="text-[8px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold uppercase shrink-0">
                                  {v.type}
                                </span>
                              </div>
                              {v.description && (
                                <p className="text-[10px] text-gray-600 mt-1 line-clamp-2">
                                  {v.description}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 pt-1">
                              <button
                                onClick={() => {
                                  onLoadVariation(v.code, v.title);
                                  onClose();
                                }}
                                className="flex-1 py-1 px-2 rounded bg-emerald-500/10 hover:bg-emerald-500 text-emerald-700 hover:text-white border border-emerald-500/30 text-[10px] font-bold flex items-center justify-center gap-1 transition-all uppercase"
                              >
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>Load Variation</span>
                              </button>

                              <button
                                onClick={() => openInOfficialStrudel(v.code)}
                                className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 text-[10px]"
                                title="Open this variation in strudel.cc"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-[11px] text-gray-500">
          <span>Active Workspace: {currentTrackTitle} ({currentBpm} BPM)</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md font-bold text-[10px] uppercase transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

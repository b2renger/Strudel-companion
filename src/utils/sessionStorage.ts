import { SavedSession, AIVariation } from '../types';
import { STARTER_PRESETS } from '../data/presets';

const STORAGE_KEY = 'strudel_saved_sessions_v1';
/** Marks that the starter sessions have been installed at least once. */
const SEEDED_KEY = 'strudel_sessions_seeded_v1';
const ACTIVE_SESSION_ID_KEY = 'strudel_active_session_id';

/**
 * Generate starter default sessions if storage is empty.
 */
function getInitialDefaultSessions(): SavedSession[] {
  const now = Date.now();
  return [
    {
      id: 'session-starter-cyberpunk',
      name: 'Cyberpunk Neon Drive',
      code: STARTER_PRESETS[0].code,
      bpm: STARTER_PRESETS[0].bpm,
      genre: STARTER_PRESETS[0].genre,
      tags: ['Cyberpunk', 'Synthwave', 'Starter'],
      description: STARTER_PRESETS[0].description,
      createdAt: now - 3600000 * 24,
      updatedAt: now - 3600000 * 24,
      variations: [
        {
          id: 'var-cyberpunk-drop',
          title: 'The Drop (Peak Energy)',
          type: 'drop',
          description: 'Unleashes saturated 4-on-the-floor kick with wide open sawtooth bass.',
          code: `// Neon Cyberpunk - The Drop
stack(
  s("bd*4"),
  s("hh*16").gain(0.7),
  s("~ cp ~ cp").gain(0.85),
  note("a1 [a1 a1] [c2 a1] [e2 g2]").s("sawtooth").lpf(3400).decay(0.2).gain(0.95),
  note("<[a3 c4 e4 g4]*2 [f3 a3 c4 e4]*2>").s("sawtooth").lpf(5000).decay(0.3).gain(0.75).delay(0.3)
)`,
          createdAt: now - 3600000 * 24,
        },
        {
          id: 'var-cyberpunk-breakdown',
          title: 'Atmospheric Breakdown',
          type: 'breakdown',
          description: 'Mutes drum kick, filters chords into deep space reverb delay.',
          code: `// Neon Cyberpunk - Breakdown
stack(
  s("~ hh ~ [hh hh]").gain(0.4),
  note("<[a3 c4 e4 g4] [f3 a3 c4 e4] [g3 b3 d4 f4] [e3 g3 b3 d4]>").s("sawtooth").lpf(1200).decay(0.8).gain(0.8).room(0.7).delay(0.5)
)`,
          createdAt: now - 3600000 * 24,
        },
      ],
    },
    {
      id: 'session-starter-lofi',
      name: 'Midnight Lo-Fi Coffee',
      code: STARTER_PRESETS[1].code,
      bpm: STARTER_PRESETS[1].bpm,
      genre: STARTER_PRESETS[1].genre,
      tags: ['Lo-Fi', 'Rhodes', 'Chill'],
      description: STARTER_PRESETS[1].description,
      createdAt: now - 3600000 * 12,
      updatedAt: now - 3600000 * 12,
      variations: [
        {
          id: 'var-lofi-euclidean',
          title: 'Euclidean Groove Shift',
          type: 'polyrhythm',
          description: 'Syncopated (3,8) rimshots and polymetric Rhodes comping.',
          code: `// Midnight Lo-Fi - Euclidean Shift
stack(
  s("bd(3,8)"),
  s("~ cp(3,8)"),
  s("[hh*2 ~ hh]*2").gain(0.5),
  note("<[d3 f3 a3 c4] [g3 b3 d4 f4] [c3 e3 g3 b4]>").s("piano").decay(0.7).gain(0.7).room(0.5),
  note("<d2 g2 c2 a1>").s("sine").decay(0.7).gain(0.85)
)`,
          createdAt: now - 3600000 * 12,
        },
      ],
    },
  ];
}

/**
 * Fetch all saved sessions from localStorage.
 */
export function getSavedSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      if (localStorage.getItem(SEEDED_KEY)) return [];
      const initial = getInitialDefaultSessions();
      saveAllSessions(initial);
      try {
        localStorage.setItem(SEEDED_KEY, '1');
      } catch {
        /* storage unavailable */
      }
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      const initial = getInitialDefaultSessions();
      saveAllSessions(initial);
      return initial;
    }
    // An empty array is a legitimate state — the user deleted everything.
    // This used to re-seed the two starter sessions whenever the list was
    // empty, so deleting your last session brought them back and the library
    // could never be cleared. The separate SEEDED_KEY flag distinguishes
    // "never seeded" from "deliberately emptied".
    return parsed;
  } catch (err) {
    console.warn('Failed to load saved sessions from storage:', err);
    return getInitialDefaultSessions();
  }
}

/**
 * Save the entire list of sessions.
 */
export function saveAllSessions(sessions: SavedSession[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    return true;
  } catch (err) {
    // Almost always QuotaExceededError. Retry once with the bulkiest field —
    // the accumulated variations — dropped from the oldest sessions, so the
    // user keeps their patterns even when storage is tight.
    try {
      const trimmed = sessions.map((s, i) =>
        i < 5 ? s : { ...s, variations: [] },
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return true;
    } catch {
      console.error('Failed to write sessions to localStorage:', err);
      return false;
    }
  }
}

/**
 * Save or update a single session.
 */
export function saveSession(session: SavedSession): SavedSession[] {
  const sessions = getSavedSessions();
  const existingIdx = sessions.findIndex((s) => s.id === session.id);

  const updatedSession = {
    ...session,
    updatedAt: Date.now(),
  };

  let nextSessions: SavedSession[];
  if (existingIdx >= 0) {
    nextSessions = [...sessions];
    nextSessions[existingIdx] = updatedSession;
  } else {
    nextSessions = [updatedSession, ...sessions];
  }

  saveAllSessions(nextSessions);
  setActiveSessionId(updatedSession.id);
  return nextSessions;
}

/**
 * Delete a session by ID.
 */
export function deleteSession(id: string): SavedSession[] {
  const sessions = getSavedSessions();
  const filtered = sessions.filter((s) => s.id !== id);
  saveAllSessions(filtered);
  return filtered;
}

/**
 * Duplicate an existing session.
 */
export function duplicateSession(id: string): SavedSession | null {
  const sessions = getSavedSessions();
  const target = sessions.find((s) => s.id === id);
  if (!target) return null;

  const duplicated: SavedSession = {
    ...target,
    id: 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    name: `${target.name} (Copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    variations: target.variations.map((v) => ({
      ...v,
      id: 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    })),
  };

  saveSession(duplicated);
  return duplicated;
}

/**
 * Save active session ID.
 */
export function setActiveSessionId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_SESSION_ID_KEY, id);
  } catch (e) {
    // Ignore storage issues
  }
}

/**
 * Get active session ID.
 */
export function getActiveSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SESSION_ID_KEY);
  } catch (e) {
    return null;
  }
}

/**
 * Export all sessions to a JSON file.
 */
export function exportSessionsToJSON(): void {
  const sessions = getSavedSessions();
  const jsonStr = JSON.stringify(sessions, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `strudel-sessions-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import sessions from a JSON string.
 */
export function importSessionsFromJSON(jsonContent: string): SavedSession[] {
  const parsed = JSON.parse(jsonContent);
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid sessions JSON format. Expected an array of sessions.');
  }

  const existing = getSavedSessions();
  const existingIds = new Set(existing.map((s) => s.id));

  const validNew: SavedSession[] = [];
  for (const item of parsed) {
    if (item.name && item.code) {
      let id = item.id;
      if (!id || existingIds.has(id)) {
        id = 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      }
      validNew.push({
        id,
        name: String(item.name),
        code: String(item.code),
        bpm: Number(item.bpm) || 120,
        genre: String(item.genre || 'Electronic'),
        tags: Array.isArray(item.tags) ? item.tags : [],
        description: item.description || '',
        variations: Array.isArray(item.variations) ? item.variations : [],
        createdAt: item.createdAt || Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  const merged = [...validNew, ...existing];
  saveAllSessions(merged);
  return merged;
}

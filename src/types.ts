export interface TrackPreset {
  id: string;
  title: string;
  genre: string;
  bpm: number;
  complexity: 'Beginner' | 'Intermediate' | 'Advanced';
  code: string;
  description: string;
  tags: string[];
  theoryNotes?: string;
}

export interface TriggeredNote {
  id: string;
  timestamp: number;
  voice: 'drums' | 'bass' | 'chords' | 'lead' | 'fx';
  label: string;
  velocity: number;
  pitch?: number;
  step?: number;
}

export interface NotationSymbol {
  symbol: string;
  title: string;
  category: 'Rhythm' | 'Grouping' | 'Speed' | 'Variation' | 'Effects';
  syntax: string;
  example: string;
  description: string;
  audioExampleSnippet?: string;
}

export interface AIGeneratedTrack {
  code: string;
  title: string;
  bpm: number;
  genre: string;
  explanation: string;
  notationBreakdown: Array<{
    symbolOrMethod: string;
    meaning: string;
  }>;
  liveTweaks: Array<{
    label: string;
    code: string;
    description?: string;
  }>;
}

export interface AITweakResult {
  code: string;
  summary: string;
  diffHighlights: string[];
  liveTweaks: Array<{
    label: string;
    code: string;
  }>;
}

export interface AIExplanationResult {
  summary: string;
  lineByLine: Array<{
    line: string;
    role: 'Drums' | 'Bass' | 'Harmony' | 'Melody' | 'FX' | 'Structure';
    explanation: string;
  }>;
  miniNotationGuide: Array<{
    symbol: string;
    title: string;
    explanation: string;
    example: string;
  }>;
  musicTheoryTip: string;
}

export interface AIVariation {
  title: string;
  type: 'drop' | 'breakdown' | 'polyrhythm' | 'harmonic' | 'glitch' | 'chill';
  description: string;
  code: string;
}

export interface AudioEngineState {
  isPlaying: boolean;
  bpm: number;
  cycle: number;
  masterVolume: number;
  cutoffHz: number;
  reverbAmount: number;
  delayAmount: number;
  activeVoices: Record<string, number>;
  errorMessage: string | null;
}

import React, { useState, useMemo } from 'react';
import { StrudelToken } from '../utils/strudelTokenParser';
import {
  X,
  Play,
  Search,
  Plus,
  Volume2,
  Music,
  Sliders,
  Clock,
  Radio,
  Sparkles,
  Zap,
  Grid,
} from 'lucide-react';

export interface BlockOption {
  label: string;
  code: string;
  category: 'drums' | 'notes' | 'rhythm' | 'effects' | 'synth' | 'custom';
  description: string;
  tag?: string;
}

const PRESET_BLOCKS: BlockOption[] = [
  // Drums & Samples
  { label: 'bd (Kick Drum)', code: 'bd', category: 'drums', description: 'Deep acoustic bass drum' },
  { label: '808 (808 Bass Kick)', code: '808', category: 'drums', description: 'Boomy sub-bass electronic 808' },
  { label: 'sd (Snare Drum)', code: 'sd', category: 'drums', description: 'Crisp acoustic backbeat snare' },
  { label: 'cp (Hand Clap)', code: 'cp', category: 'drums', description: 'Electronic stereo clap' },
  { label: 'rim (Rimshot)', code: 'rim', category: 'drums', description: 'Tight metallic snare rimshot' },
  { label: 'hh (Closed Hi-Hat)', code: 'hh', category: 'drums', description: 'Tight metallic closed hat' },
  { label: 'oh (Open Hi-Hat)', code: 'oh', category: 'drums', description: 'Sustained sizzling open hat' },
  { label: 'cr (Crash Cymbal)', code: 'cr', category: 'drums', description: 'Explosive high-end accent crash' },
  { label: 'ride (Ride Cymbal)', code: 'ride', category: 'drums', description: 'Rhythmic pinging ride cymbal' },
  { label: 'tom (Tom Drum)', code: 'tom', category: 'drums', description: 'Resonant low/mid tom pulse' },
  { label: 'cb (Cowbell)', code: 'cb', category: 'drums', description: 'Vintage 808 cowbell accent' },
  { label: 'perc (Percussion Hit)', code: 'perc', category: 'drums', description: 'Textured percussive transient' },
  { label: 'tabla (Tabla Hit)', code: 'tabla', category: 'drums', description: 'Organic acoustic world percussion' },
  { label: 'click (Glitch Click)', code: 'click', category: 'drums', description: 'Micro-timing glitch click' },

  // Notes & Chords
  { label: 'c3 (Root C)', code: 'c3', category: 'notes', description: 'Middle octave root C pitch' },
  { label: 'eb3 (Minor Third)', code: 'eb3', category: 'notes', description: 'Moody minor third pitch' },
  { label: 'f3 (Fourth)', code: 'f3', category: 'notes', description: 'Subdominant fourth interval' },
  { label: 'g3 (Fifth)', code: 'g3', category: 'notes', description: 'Harmonic fifth anchor pitch' },
  { label: 'bb3 (Minor 7th)', code: 'bb3', category: 'notes', description: 'Soulful minor 7th interval' },
  { label: 'c4 (High C)', code: 'c4', category: 'notes', description: 'Upper octave lead pitch' },
  { label: 'eb4 (High Eb)', code: 'eb4', category: 'notes', description: 'Bright melodic top note' },
  { label: '<c3 e3 g3 b3> (Cycle Arp)', code: '<c3 e3 g3 b3>', category: 'notes', description: '4-step cycling chord arpeggiation' },
  { label: '[c3 eb3 g3] (Cm Triad)', code: '[c3 eb3 g3]', category: 'notes', description: 'Simultaneous minor triad chord' },
  { label: '[c3 e3 g3 b3] (Cmaj7 Chord)', code: '[c3 e3 g3 b3]', category: 'notes', description: 'Lush jazz major 7th chord' },
  { label: 'c2 (Deep Sub Bass)', code: 'c2', category: 'notes', description: 'Low octave fundamental bass pitch' },
  { label: 'f2 (Low F Bass)', code: 'f2', category: 'notes', description: 'Warm heavy sub bass note' },

  // Rhythms & Time Modifiers
  { label: '*2 (Double Speed 2x)', code: '*2', category: 'rhythm', description: 'Triggers 2 times per step' },
  { label: '*4 (Subdivide 4x)', code: '*4', category: 'rhythm', description: 'Fast 16th-note subdivision roll' },
  { label: '*8 (Subdivide 8x)', code: '*8', category: 'rhythm', description: 'Rapid 32nd-note trap roll' },
  { label: '/2 (Half Speed)', code: '/2', category: 'rhythm', description: 'Plays half as fast across 2 steps' },
  { label: '(3,8) (Euclidean 3 over 8)', code: '(3,8)', category: 'rhythm', description: 'Tresillo syncopated groove' },
  { label: '(5,8) (Euclidean 5 over 8)', code: '(5,8)', category: 'rhythm', description: 'Cinquillo Afro-Latin polyrhythm' },
  { label: '(7,16) (Euclidean 7 over 16)', code: '(7,16)', category: 'rhythm', description: 'Complex Samba/Bossa polyrhythm' },
  { label: '~ (Rest / Silence)', code: '~', category: 'rhythm', description: 'Musical rest space' },
  { label: '? (50% Chance Probability)', code: '?', category: 'rhythm', description: 'Random probabilistic drop' },
  { label: '@2 (Elongate 2x Duration)', code: '@2', category: 'rhythm', description: 'Hold step for 2 time units' },
  { label: '.fast(2) (Layer 2x Speed)', code: '.fast(2)', category: 'rhythm', description: 'Double pattern tempo' },
  { label: '.slow(2) (Layer Half Speed)', code: '.slow(2)', category: 'rhythm', description: 'Half pattern tempo' },
  { label: '.rev() (Reverse Pattern)', code: '.rev()', category: 'rhythm', description: 'Plays rhythm in reverse order' },
  { label: '.jux(rev) (Stereo Jux Reverse)', code: '.jux(rev)', category: 'rhythm', description: 'Plays original left, reverse right' },

  // Audio Effects (DSP)
  { label: '.lpf(1200) (Lowpass Filter)', code: '.lpf(1200)', category: 'effects', description: 'Warm cutoff filter at 1200Hz' },
  { label: '.lpf(600) (Deep Dark Filter)', code: '.lpf(600)', category: 'effects', description: 'Muffled underwater bass filter' },
  { label: '.hpf(400) (Highpass Filter)', code: '.hpf(400)', category: 'effects', description: 'Cuts low rumble below 400Hz' },
  { label: '.gain(0.8) (Volume Level)', code: '.gain(0.8)', category: 'effects', description: 'Adjusts track amplitude level' },
  { label: '.room(0.5) (Lush Reverb)', code: '.room(0.5)', category: 'effects', description: 'Spacious ambient room reverberation' },
  { label: '.delay(0.25) (Echo Delay)', code: '.delay(0.25)', category: 'effects', description: 'Syncopated quarter-beat delay' },
  { label: '.decay(0.3) (Envelope Decay)', code: '.decay(0.3)', category: 'effects', description: 'Fast snappy release tail' },
  { label: '.pan(-0.5) (Pan Left)', code: '.pan(-0.5)', category: 'effects', description: 'Positions sound in left stereo field' },
  { label: '.pan(0.5) (Pan Right)', code: '.pan(0.5)', category: 'effects', description: 'Positions sound in right stereo field' },
  { label: '.distort(0.4) (Warm Saturation)', code: '.distort(0.4)', category: 'effects', description: 'Harmonic saturation overdrive' },
  { label: '.crush(6) (Bitcrusher)', code: '.crush(6)', category: 'effects', description: 'Lo-fi 6-bit digital downsampler' },

  // Synth Oscillators
  { label: '.s("sawtooth") (Saw Wave)', code: '.s("sawtooth")', category: 'synth', description: 'Harmonically rich electronic saw' },
  { label: '.s("square") (Square Wave)', code: '.s("square")', category: 'synth', description: 'Punchy chiptune 8-bit waveform' },
  { label: '.s("sine") (Pure Sine Wave)', code: '.s("sine")', category: 'synth', description: 'Clean smooth sub-bass tone' },
  { label: '.s("triangle") (Triangle Wave)', code: '.s("triangle")', category: 'synth', description: 'Warm acoustic-like waveform' },
  { label: '.s("supersaw") (Unison Saw)', code: '.s("supersaw")', category: 'synth', description: 'Huge detuned stereo anthem saw' },
  { label: '.s("pluck") (Pluck Instrument)', code: '.s("pluck")', category: 'synth', description: 'Fast transient plucked acoustic tone' },
];

interface AddBlockModalProps {
  isOpen: boolean;
  targetToken: StrudelToken | null;
  targetLineNumber?: number;
  currentCode: string;
  onClose: () => void;
  onInsertBlock: (blockCode: string, autoEval?: boolean) => void;
}

export const AddBlockModal: React.FC<AddBlockModalProps> = ({
  isOpen,
  targetToken,
  targetLineNumber,
  currentCode,
  onClose,
  onInsertBlock,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'drums' | 'notes' | 'rhythm' | 'effects' | 'synth'>('all');
  const [customInput, setCustomInput] = useState('');
  const [autoEval, setAutoEval] = useState(true);

  // Filter blocks based on search and category
  const filteredBlocks = useMemo(() => {
    return PRESET_BLOCKS.filter((block) => {
      const matchesCategory = selectedCategory === 'all' || block.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim().length === 0 ||
        block.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        block.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        block.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  if (!isOpen) return null;

  const targetDescription = targetToken
    ? `behind block "${targetToken.raw}" (Line ${targetToken.line})`
    : targetLineNumber
    ? `at Line ${targetLineNumber}`
    : 'behind target block';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 animate-fade-in font-sans">
      <div
        className="bg-[var(--app-card-1)] border border-gray-200 rounded-2xl w-full max-w-xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-gray-900 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-pink-500/20 text-pink-600 border border-pink-500/40">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900 tracking-wide">
                  Add Block of Choice
                </h3>
                {targetToken && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 border border-emerald-500/40 font-bold">
                    {targetToken.raw}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-600">
                Insert sound, rhythm, pitch, or effect {targetDescription}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Custom Input Bar */}
        <div className="p-3 bg-gray-50/50 border-b border-gray-200 flex flex-col gap-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sounds, notes, effects, rhythms (e.g. 808, reverb, *4, c3)..."
              className="w-full bg-white text-gray-900 pl-8.5 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:border-pink-500 transition-colors"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-gray-400 hover:text-gray-600 text-xs"
              >
                ×
              </button>
            )}
          </div>

          {/* Direct Custom Block Submission */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customInput.trim()) {
                  onInsertBlock(customInput.trim(), autoEval);
                  onClose();
                }
              }}
              placeholder="Or type any custom code snippet/modifier..."
              className="flex-1 bg-white text-gray-900 px-3 py-1 rounded-lg border border-gray-300 text-xs font-mono focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={() => {
                if (customInput.trim()) {
                  onInsertBlock(customInput.trim(), autoEval);
                  onClose();
                }
              }}
              disabled={!customInput.trim()}
              className="px-3 py-1 rounded-lg bg-pink-500 hover:bg-pink-600 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1 uppercase transition-all shadow-xs shrink-0"
            >
              <Plus className="w-3 h-3" />
              <span>Insert Custom</span>
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[10px]">
          {[
            { id: 'all', label: 'All Blocks', icon: <Sparkles className="w-3 h-3" /> },
            { id: 'drums', label: '🥁 Drums', icon: <Volume2 className="w-3 h-3" /> },
            { id: 'notes', label: '🎹 Notes & Chords', icon: <Music className="w-3 h-3" /> },
            { id: 'rhythm', label: '⏱️ Rhythms & Time', icon: <Clock className="w-3 h-3" /> },
            { id: 'effects', label: '🎛️ Audio FX', icon: <Sliders className="w-3 h-3" /> },
            { id: 'synth', label: '📻 Synths', icon: <Radio className="w-3 h-3" /> },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id as any)}
              className={`px-2.5 py-1 rounded-full font-bold uppercase transition-all shrink-0 flex items-center gap-1 ${
                selectedCategory === cat.id
                  ? 'bg-pink-500 text-white shadow-xs'
                  : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Blocks Grid */}
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 scrollbar-thin scrollbar-thumb-gray-200">
          {filteredBlocks.map((block) => {
            return (
              <button
                key={block.code + block.label}
                onClick={() => {
                  onInsertBlock(block.code, autoEval);
                  onClose();
                }}
                className="bg-white hover:bg-pink-50/40 p-2.5 rounded-xl border border-gray-200 hover:border-pink-500/50 text-left flex flex-col justify-between gap-1 transition-all active:scale-98 group shadow-2xs"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono font-bold text-xs text-gray-900 group-hover:text-pink-600 flex items-center gap-1">
                    <Plus className="w-3 h-3 text-pink-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    <span>{block.label}</span>
                  </span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 shrink-0 border border-gray-200">
                    {block.code}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 line-clamp-1">{block.description}</p>
              </button>
            );
          })}

          {filteredBlocks.length === 0 && (
            <div className="col-span-2 text-center py-6 text-gray-500 text-xs">
              No matching blocks found for &quot;{searchQuery}&quot;. Use the custom input box above to insert any text!
            </div>
          )}
        </div>

        {/* Footer with Auto-Eval Toggle & Quick Close */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-medium text-gray-700">
            <input
              type="checkbox"
              checked={autoEval}
              onChange={(e) => setAutoEval(e.target.checked)}
              className="rounded text-pink-600 focus:ring-pink-500"
            />
            <span className="flex items-center gap-1">
              <Zap className={`w-3 h-3 ${autoEval ? 'text-emerald-600 fill-current' : 'text-gray-400'}`} />
              <span>Live evaluate sound immediately on insert</span>
            </span>
          </label>

          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

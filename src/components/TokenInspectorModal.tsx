import React, { useState, useEffect } from 'react';
import { StrudelToken } from '../utils/strudelTokenParser';
import {
  X,
  Play,
  Check,
  Zap,
  Music,
  Sliders,
  Sparkles,
  Volume2,
  Clock,
  Shuffle,
  Grid,
  Layers,
  ArrowRight,
  Radio,
  Plus,
  Trash2,
} from 'lucide-react';

interface TokenInspectorModalProps {
  isOpen: boolean;
  token: StrudelToken | null;
  currentCode: string;
  onClose: () => void;
  onApplyTokenValue: (token: StrudelToken, newValue: string, autoEval: boolean) => void;
  onOpenAddBlockBehind?: (token: StrudelToken) => void;
  onRemoveToken?: (token: StrudelToken) => void;
}

export const TokenInspectorModal: React.FC<TokenInspectorModalProps> = ({
  isOpen,
  token,
  currentCode,
  onClose,
  onApplyTokenValue,
  onOpenAddBlockBehind,
  onRemoveToken,
}) => {
  const [customValue, setCustomValue] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'contextual' | 'subdivide' | 'chromatic' | 'effects' | 'custom'>('contextual');

  // Euclidean generator states
  const [euclidK, setEuclidK] = useState<number>(3);
  const [euclidN, setEuclidN] = useState<number>(8);

  // Note pitch states
  const [selectedOctave, setSelectedOctave] = useState<number>(3);

  // Sync token value when modal opens
  useEffect(() => {
    if (token) {
      setCustomValue(token.value);
      setActiveTab('contextual');

      // Parse euclidean values if token is euclidean
      if (token.category === 'euclidean_rhythm') {
        const match = token.value.match(/\((\d+)\s*,\s*(\d+)/);
        if (match) {
          setEuclidK(parseInt(match[1], 10) || 3);
          setEuclidN(parseInt(match[2], 10) || 8);
        }
      }

      // Parse octave if note
      if (token.category === 'note_pitch' || token.type === 'note') {
        const octMatch = token.value.match(/\d/);
        if (octMatch) {
          setSelectedOctave(parseInt(octMatch[0], 10) || 3);
        }
      }
    }
  }, [token]);

  if (!isOpen || !token) return null;

  // Header metadata info
  const getTokenKindInfo = (category: string, type: string) => {
    if (type === 'synth' || category === 'synth_voice') {
      return {
        title: 'Synthesizer Oscillator Voice',
        desc: 'Waveform source (sawtooth, square, sine, triangle, supersaw, etc.)',
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
        icon: <Radio className="w-3.5 h-3.5" />,
      };
    }

    switch (category) {
      case 'drum_kick':
        return {
          title: 'Kick Drum Voice',
          desc: 'Low-frequency bass drum pulse',
          badgeColor: 'bg-orange-500/20 text-orange-600 border-orange-500/40',
          icon: <Volume2 className="w-3.5 h-3.5" />,
        };
      case 'drum_snare':
        return {
          title: 'Snare & Clap Voice',
          desc: 'High-energy backbeat snare/clap transient',
          badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          icon: <Volume2 className="w-3.5 h-3.5" />,
        };
      case 'drum_hat':
        return {
          title: 'Hi-Hat & Cymbal Voice',
          desc: 'Rhythmic top-end cymbal or shaker groove',
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          icon: <Volume2 className="w-3.5 h-3.5" />,
        };
      case 'drum_perc':
        return {
          title: 'Percussion & FX Voice',
          desc: 'Toms, cowbells, glitches, and percussive layers',
          badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
          icon: <Volume2 className="w-3.5 h-3.5" />,
        };
      case 'synth_voice':
        return {
          title: 'Synthesizer Waveform',
          desc: 'Oscillator waveform instrument source',
          badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
          icon: <Radio className="w-3.5 h-3.5" />,
        };
      case 'note_pitch':
        return {
          title: 'Musical Pitch / Note',
          desc: 'Individual note pitch with scientific pitch notation',
          badgeColor: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/40',
          icon: <Music className="w-3.5 h-3.5" />,
        };
      case 'chord_cluster':
        return {
          title: 'Simultaneous Chord Cluster',
          desc: 'Polyphonic harmonic chord structure',
          badgeColor: 'bg-indigo-500/20 text-indigo-600 border-indigo-500/40',
          icon: <Grid className="w-3.5 h-3.5" />,
        };
      case 'cycle_progression':
        return {
          title: 'Cycle Progression Pattern',
          desc: 'Harmonic changes advancing one step per cycle',
          badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
          icon: <Layers className="w-3.5 h-3.5" />,
        };
      case 'euclidean_rhythm':
        return {
          title: 'Euclidean Rhythm (k, n)',
          desc: 'k pulses distributed maximally evenly over n steps',
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          icon: <Shuffle className="w-3.5 h-3.5" />,
        };
      case 'speed_multiplier':
      case 'slow_divisor':
        return {
          title: 'Rhythmic Subdivision / Speed',
          desc: 'Time stretching or compression (*2, *4, /2)',
          badgeColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
          icon: <Clock className="w-3.5 h-3.5" />,
        };
      case 'rest_silence':
        return {
          title: 'Musical Rest (~)',
          desc: 'Silent pause / empty step',
          badgeColor: 'bg-zinc-600/30 text-gray-700 border-zinc-500/40',
          icon: <Clock className="w-3.5 h-3.5" />,
        };
      case 'effect_lpf':
      case 'effect_hpf':
      case 'effect_room':
      case 'effect_delay':
      case 'effect_decay':
      case 'effect_gain':
      case 'effect_method':
        return {
          title: 'DSP Audio Transformer & Effect',
          desc: 'Filter, room reverb, delay, decay, or gain parameter',
          badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          icon: <Sliders className="w-3.5 h-3.5" />,
        };
      default:
        return {
          title: 'Live Pattern Element',
          desc: 'Strudel mini-notation token',
          badgeColor: 'bg-black/10 text-gray-900 border-gray-300',
          icon: <Sparkles className="w-3.5 h-3.5" />,
        };
    }
  };

  const kindInfo = getTokenKindInfo(token.category, token.type);

  // Compute live replacement preview of the line
  const lines = currentCode.split('\n');
  const lineIndex = Math.max(0, token.line - 1);
  const currentLineText = lines[lineIndex] || '';

  // Handle Euclidean slider changes
  const handleUpdateEuclid = (k: number, n: number) => {
    setEuclidK(k);
    setEuclidN(n);
    setCustomValue(`(${k},${n})`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 animate-fade-in font-sans">
      <div
        className="bg-[var(--app-card-1)] border border-gray-200 rounded-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden text-gray-900 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="p-3.5 sm:p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border flex items-center justify-center ${kindInfo.badgeColor}`}>
              {kindInfo.icon}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900 tracking-wide">{kindInfo.title}</h3>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${kindInfo.badgeColor}`}>
                  {token.value}
                </span>
              </div>
              <p className="text-xs text-gray-600">{kindInfo.desc}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Code Line Context Preview */}
        <div className="bg-gray-50 px-3.5 py-2.5 border-b border-gray-100 flex flex-col gap-1.5 font-mono text-xs">
          <div className="flex items-center justify-between text-[10px] text-gray-500 font-sans">
            <span>LINE {token.line} CONTEXT:</span>
            <span className="text-orange-600 font-medium">Original: &quot;{token.value}&quot; → New: &quot;{customValue}&quot;</span>
          </div>
          <div className="bg-black/60 p-2 rounded-lg border border-gray-100 text-gray-700 overflow-x-auto whitespace-pre flex items-center gap-1">
            <span className="text-gray-400 select-none mr-2 font-bold">{token.line} |</span>
            <span className="text-gray-600">{currentLineText.substring(0, Math.max(0, token.startIndex - (currentCode.indexOf(currentLineText))))}</span>
            <span className="bg-orange-500/30 text-orange-600 px-1 rounded border border-orange-500/60 font-bold animate-pulse">
              {customValue || token.value}
            </span>
            <span className="text-gray-600">
              {currentLineText.substring(
                Math.max(0, token.startIndex - (currentCode.indexOf(currentLineText))) + token.raw.length
              )}
            </span>
          </div>
        </div>

        {/* Custom Input / Direct Override Bar */}
        <div className="p-3 bg-[var(--app-card-1)] border-b border-gray-100 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] text-gray-600 font-medium">
            <span>Edit Token Value:</span>
            <span className="text-[10px] text-gray-500">Pick from presets below or type directly</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="Enter value or select preset..."
                className="w-full bg-gray-50 text-gray-900 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-mono focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
            <button
              onClick={() => onApplyTokenValue(token, customValue, true)}
              className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-500/90 text-white font-bold text-xs flex items-center gap-1 uppercase transition-all active:scale-95 shadow-sm shrink-0"
              title="Apply modification and immediately evaluate sound" aria-label="Apply modification and immediately evaluate sound"
            >
              <Play className="w-3 h-3 fill-black" />
              <span>Apply & Live Eval</span>
            </button>
          </div>
        </div>

        {/* Modal Suggestion Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-3.5 scrollbar-thin scrollbar-thumb-white/10">
          
          {/* CONTEXTUAL SELECTOR: SYNTH OSCILLATORS (SAWTOOTH, SQUARE, SINE, TRIANGLE, ETC.) */}
          {(token.type === 'synth' || token.category === 'synth_voice' || token.value === 'sawtooth' || token.value === 'square' || token.value === 'sine' || token.value === 'triangle') && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-cyan-300">
                  <Radio className="w-3.5 h-3.5" />
                  <span>Synthesizer Waveform Oscillators:</span>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { label: 'sawtooth (Bright Saw Wave)', val: 'sawtooth', desc: 'Harmonically rich, EDM/synthwave standard' },
                    { label: 'square (Punchy Square Wave)', val: 'square', desc: 'Hollow, chiptune 8-bit & retro leads' },
                    { label: 'sine (Pure Sine Wave)', val: 'sine', desc: 'Pure fundamental, smooth sub bass & flutes' },
                    { label: 'triangle (Soft Triangle)', val: 'triangle', desc: 'Mellow warm tones, acoustic emulation' },
                    { label: 'supersaw (Unison Multi-Saw)', val: 'supersaw', desc: 'Wide detuned trance & anthem lead' },
                    { label: 'pluck (Resonant Pluck)', val: 'pluck', desc: 'Fast transient plucked string' },
                    { label: 'piano (Acoustic Piano)', val: 'piano', desc: 'Realistic keyed piano notes' },
                    { label: 'pad (Lush Ambient Pad)', val: 'pad', desc: 'Slow warm evolving textures' },
                    { label: 'organ (Hammond B3 Organ)', val: 'organ', desc: 'Rotary classic keyed organ' },
                    { label: 'casio (Vintage Keyboard)', val: 'casio', desc: 'Lo-fi retro keyboard sound' },
                    { label: 'fm (FM Synthesis Tone)', val: 'fm', desc: 'Metallic bell-like FM modulation' },
                    { label: 'sub (Sub Bass Oscillator)', val: 'sub', desc: 'Deep chest-thumping sub fundamental' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      onClick={() => setCustomValue(item.val)}
                      className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all active:scale-95 ${
                        customValue === item.val
                          ? 'bg-cyan-500 text-white border-cyan-500 shadow-md'
                          : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                      }`}
                    >
                      <span className="text-xs font-bold font-mono">{item.label}</span>
                      <span className={`text-[10px] line-clamp-1 ${customValue === item.val ? 'text-white/80' : 'text-gray-600'}`}>
                        {item.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Synth Filter Combinations */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-100">
                <span className="text-[10px] text-gray-600 font-bold uppercase text-purple-300">
                  Quick Filter Cutoff Presets for {customValue || 'Synth'}:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { label: 'Deep Sub LPF (250Hz)', val: '250' },
                    { label: 'Warm Low-Mid (600Hz)', val: '600' },
                    { label: 'Punchy Lead (1800Hz)', val: '1800' },
                    { label: 'Wide Open (8000Hz)', val: '8000' },
                  ].map((f) => (
                    <button
                      key={f.val}
                      onClick={() => {
                        // If replacing synth, keep synth or suggest
                      }}
                      className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-gray-700 border border-gray-200 text-[11px] text-center"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CONTEXTUAL SELECTOR 1: KICK DRUM SUGGESTIONS */}
          {token.category === 'drum_kick' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-orange-600">
                  <Volume2 className="w-3 h-3" />
                  <span>Kick Sound Variations:</span>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { label: 'bd (Standard 808)', val: 'bd' },
                    { label: 'bd:1 (Sub Deep)', val: 'bd:1' },
                    { label: 'bd:2 (Acoustic Punch)', val: 'bd:2' },
                    { label: 'bd:3 (Hard Electro)', val: 'bd:3' },
                    { label: 'kick (909 Club)', val: 'kick' },
                    { label: '808bd (Sub Boom)', val: '808bd' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      onClick={() => setCustomValue(item.val)}
                      className={`p-2 rounded-lg border text-left text-xs font-bold transition-all active:scale-95 ${
                        customValue === item.val
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                          : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-amber-300">
                  <Clock className="w-3 h-3" />
                  <span>Kick Rhythms & Subdivisions:</span>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { label: 'bd*2 (Double Kick)', val: 'bd*2' },
                    { label: 'bd*4 (4-on-Floor)', val: 'bd*4' },
                    { label: '[~ bd] (Syncopated Offbeat)', val: '[~ bd]' },
                    { label: 'bd? (Ghost Probability)', val: 'bd?' },
                    { label: 'bd(3,8) (Tresillo Kick)', val: 'bd(3,8)' },
                    { label: 'bd(5,8) (Cinquillo Kick)', val: 'bd(5,8)' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      onClick={() => setCustomValue(item.val)}
                      className={`p-2 rounded-lg border text-left text-xs font-bold transition-all active:scale-95 ${
                        customValue === item.val
                          ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                          : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CONTEXTUAL SELECTOR 2: SNARE & CLAP SUGGESTIONS */}
          {token.category === 'drum_snare' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-rose-300">
                  <Volume2 className="w-3 h-3" />
                  <span>Snares, Claps & Rims:</span>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { label: 'sd (Standard Snare)', val: 'sd' },
                    { label: 'sd:1 (Deep Snare)', val: 'sd:1' },
                    { label: 'sd:2 (Bright Snare)', val: 'sd:2' },
                    { label: 'cp (Analog Clap)', val: 'cp' },
                    { label: 'rim (Rimshot)', val: 'rim' },
                    { label: 'snare (909 Snare)', val: 'snare' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      onClick={() => setCustomValue(item.val)}
                      className={`p-2 rounded-lg border text-left text-xs font-bold transition-all active:scale-95 ${
                        customValue === item.val
                          ? 'bg-rose-500 text-gray-900 border-rose-500 shadow-md'
                          : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-amber-300">
                  <Clock className="w-3 h-3" />
                  <span>Snare Rhythms & Rolls:</span>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { label: 'sd*2 (Double Hit)', val: 'sd*2' },
                    { label: 'sd*4 (Snare Roll)', val: 'sd*4' },
                    { label: '[~ sd] (Backbeat)', val: '[~ sd]' },
                    { label: '[sd cp] (Flam Layer)', val: '[sd cp]' },
                    { label: 'sd? (Ghost Snare)', val: 'sd?' },
                    { label: 'sd(3,8) (Tresillo Snare)', val: 'sd(3,8)' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      onClick={() => setCustomValue(item.val)}
                      className={`p-2 rounded-lg border text-left text-xs font-bold transition-all active:scale-95 ${
                        customValue === item.val
                          ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                          : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CONTEXTUAL SELECTOR 3: HI-HAT & CYMBAL SUGGESTIONS */}
          {token.category === 'drum_hat' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-amber-300">
                  <Clock className="w-3 h-3" />
                  <span>Hi-Hat Subdivisions & Trap Rolls:</span>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { label: 'hh*2 (8th Notes)', val: 'hh*2' },
                    { label: 'hh*4 (16th Notes)', val: 'hh*4' },
                    { label: 'hh*8 (32nd Trap Roll)', val: 'hh*8' },
                    { label: 'hh*16 (Hyper Roll)', val: 'hh*16' },
                    { label: '[hh oh] (Open/Closed)', val: '[hh oh]' },
                    { label: 'hh(3,8) (Tresillo Hat)', val: 'hh(3,8)' },
                    { label: 'hh(5,8) (Cinquillo Hat)', val: 'hh(5,8)' },
                    { label: 'hh? (Ghost Hat)', val: 'hh?' },
                    { label: 'hh*3 (Triplets)', val: 'hh*3' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      onClick={() => setCustomValue(item.val)}
                      className={`p-2 rounded-lg border text-left text-xs font-bold transition-all active:scale-95 ${
                        customValue === item.val
                          ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                          : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-gray-600 font-bold uppercase">Cymbals & Shakers:</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: 'hh (Closed Hat)', val: 'hh' },
                    { label: 'oh (Open Hat)', val: 'oh' },
                    { label: 'shaker (Shaker)', val: 'shaker' },
                    { label: 'cr (Crash Cymbal)', val: 'cr' },
                    { label: 'ride (Ride Cymbal)', val: 'ride' },
                    { label: 'cb (Cowbell)', val: 'cb' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      onClick={() => setCustomValue(item.val)}
                      className={`p-2 rounded-lg border text-left text-xs font-bold transition-all active:scale-95 ${
                        customValue === item.val
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CONTEXTUAL SELECTOR 4: INDIVIDUAL NOTE PITCH CHROMATIC SELECTOR (INCLUDING NOTES INSIDE CHORD BRACKETS) */}
          {(token.category === 'note_pitch' || token.type === 'note') && (
            <div className="flex flex-col gap-3">
              {/* Octave Selector Bar */}
              <div className="flex items-center justify-between bg-black/40 p-1.5 rounded-lg border border-gray-100 text-xs">
                <span className="text-[10px] font-bold text-gray-600 uppercase">Select Octave:</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((oct) => (
                    <button
                      key={oct}
                      onClick={() => setSelectedOctave(oct)}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                        selectedOctave === oct
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-black/5 hover:bg-black/10 text-gray-700'
                      }`}
                    >
                      Oct {oct}
                    </button>
                  ))}
                </div>
              </div>

              {/* 12 Chromatic Pitch Matrix */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-emerald-600">
                  <Music className="w-3 h-3" />
                  <span>Choose Individual Note in Octave {selectedOctave}:</span>
                </span>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {['c', 'db', 'd', 'eb', 'e', 'f', 'f#', 'g', 'ab', 'a', 'bb', 'b'].map((noteName) => {
                    const fullNote = `${noteName}${selectedOctave}`;
                    return (
                      <button
                        key={fullNote}
                        onClick={() => setCustomValue(fullNote)}
                        className={`p-2 rounded-lg border text-center text-xs font-bold transition-all active:scale-95 ${
                          customValue.toLowerCase() === fullNote.toLowerCase()
                            ? 'bg-emerald-500 text-white border-emerald-500 shadow-md'
                            : noteName.includes('b') || noteName.includes('#')
                            ? 'bg-zinc-800/80 hover:bg-zinc-700 text-gray-800 border-zinc-700'
                            : 'bg-black/10 hover:bg-black/20 text-gray-900 border-gray-200'
                        }`}
                      >
                        {fullNote}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chord Progression Helpers */}
              <div className="flex flex-col gap-1.5 pt-1 border-t border-gray-100">
                <span className="text-[10px] text-gray-600 font-bold uppercase">Substitute with Chord Voice or Interval:</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { label: `[c${selectedOctave} e${selectedOctave} g${selectedOctave}] (Major)`, val: `[c${selectedOctave} e${selectedOctave} g${selectedOctave}]` },
                    { label: `[c${selectedOctave} eb${selectedOctave} g${selectedOctave}] (Minor)`, val: `[c${selectedOctave} eb${selectedOctave} g${selectedOctave}]` },
                    { label: `[c${selectedOctave} e${selectedOctave} g${selectedOctave} b${selectedOctave}] (Maj7)`, val: `[c${selectedOctave} e${selectedOctave} g${selectedOctave} b${selectedOctave}]` },
                    { label: `[c${selectedOctave} eb${selectedOctave} g${selectedOctave} bb${selectedOctave}] (Min7)`, val: `[c${selectedOctave} eb${selectedOctave} g${selectedOctave} bb${selectedOctave}]` },
                    { label: `[c${selectedOctave} f${selectedOctave} g${selectedOctave}] (Sus4)`, val: `[c${selectedOctave} f${selectedOctave} g${selectedOctave}]` },
                    { label: `[c${selectedOctave} g${selectedOctave}] (Power 5th)`, val: `[c${selectedOctave} g${selectedOctave}]` },
                  ].map((ch) => (
                    <button
                      key={ch.val}
                      onClick={() => setCustomValue(ch.val)}
                      className={`p-2 rounded-lg border text-left text-[11px] font-bold transition-all active:scale-95 ${
                        customValue === ch.val
                          ? 'bg-indigo-500 text-white border-indigo-500'
                          : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                      }`}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CONTEXTUAL SELECTOR 5: EUCLIDEAN RHYTHM GENERATOR */}
          {token.category === 'euclidean_rhythm' && (
            <div className="flex flex-col gap-3.5">
              {/* Interactive Sliders for k and n */}
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-400">Interactive Euclidean Builder:</span>
                  <span className="font-mono font-bold text-gray-900 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/40">
                    ({euclidK},{euclidN})
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] text-gray-600">
                    <span>Pulses (k): <strong>{euclidK}</strong></span>
                    <span>Total Steps (n): <strong>{euclidN}</strong></span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max={euclidN}
                      value={euclidK}
                      onChange={(e) => handleUpdateEuclid(parseInt(e.target.value, 10), euclidN)}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                    <input
                      type="range"
                      min="2"
                      max="16"
                      value={euclidN}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        handleUpdateEuclid(Math.min(euclidK, n), n);
                      }}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* World Euclidean Rhythm Presets */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-emerald-400">
                  <Shuffle className="w-3 h-3" />
                  <span>World Musical Euclidean Grooves:</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {[
                    { label: '(3,8) - Tresillo (Cuban, Reggaeton)', val: '(3,8)' },
                    { label: '(5,8) - Cinquillo (Tango, Habanera)', val: '(5,8)' },
                    { label: '(7,8) - Balkan Odd-Meter (3+2+2)', val: '(7,8)' },
                    { label: '(7,16) - Brazilian Samba 16th', val: '(7,16)' },
                    { label: '(5,16) - Bossa Nova Clave', val: '(5,16)' },
                    { label: '(2,3) - Swing Polyrhythm', val: '(2,3)' },
                    { label: '(5,12) - African Venda Groove', val: '(5,12)' },
                    { label: '(7,12) - West African Bell', val: '(7,12)' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      onClick={() => setCustomValue(item.val)}
                      className={`p-2 rounded-lg border text-left text-xs font-bold transition-all active:scale-95 ${
                        customValue === item.val
                          ? 'bg-emerald-500 text-white border-emerald-500 shadow-md'
                          : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CONTEXTUAL SELECTOR 6: DSP FILTER LPF / HPF / LPQ */}
          {(token.category === 'effect_lpf' || token.category === 'effect_hpf' || token.category === 'effect_lpq' || token.context.parentMethod === 'lpf' || token.context.parentMethod === 'hpf' || token.context.parentMethod === 'cutoff' || token.context.parentMethod === 'lpq' || token.context.parentMethod === 'resonance') && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-purple-300">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>DSP Filter Cutoff & Resonance (Hz):</span>
                </span>
                <span className="text-[10px] text-gray-500 font-mono">Current: {customValue} Hz</span>
              </div>

              {/* Quick Slider */}
              <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 flex flex-col gap-2">
                <div className="flex justify-between text-[11px] text-gray-700">
                  <span>Frequency Sweep:</span>
                  <span className="font-mono font-bold text-purple-300">{customValue} Hz</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="16000"
                  step="20"
                  value={parseFloat(customValue) || 1200}
                  onChange={(e) => setCustomValue(e.target.value)}
                  className="w-full accent-purple-400 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                  <span>60 Hz (Sub)</span>
                  <span>500 Hz (Warm)</span>
                  <span>2500 Hz (Lead)</span>
                  <span>16 kHz (Open Air)</span>
                </div>
              </div>

              {/* Categorized Filter Frequency Presets */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  { label: '120 Hz (Dub Sub Bass)', val: '120', desc: 'Heavy dark sub cut' },
                  { label: '250 Hz (Warm Mud Cut)', val: '250', desc: 'Classic French filter touch' },
                  { label: '450 Hz (Lo-Fi Vintage)', val: '450', desc: 'Warm telephone/nostalgia' },
                  { label: '850 Hz (Mellow Synth)', val: '850', desc: 'Analog synth pad warmth' },
                  { label: '1500 Hz (Punchy Mid)', val: '1500', desc: 'Vocal/lead clarity' },
                  { label: '2800 Hz (Crisp Bright)', val: '2800', desc: 'Modern club presence' },
                  { label: '6500 Hz (Air / Sheen)', val: '6500', desc: 'Gentle high-frequency damp' },
                  { label: '12000 Hz (Wide Open)', val: '12000', desc: 'Full harmonic openness' },
                  { label: '18000 Hz (Bypass / Full)', val: '18000', desc: 'Unfiltered transparency' },
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => setCustomValue(item.val)}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all active:scale-95 ${
                      customValue === item.val
                        ? 'bg-purple-500 text-gray-900 border-purple-500 shadow-md'
                        : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                    }`}
                  >
                    <span className="text-xs font-bold font-mono">{item.label}</span>
                    <span className={`text-[10px] line-clamp-1 ${customValue === item.val ? 'text-gray-900/80' : 'text-gray-600'}`}>
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CONTEXTUAL SELECTOR 7: DSP ROOM REVERB */}
          {(token.category === 'effect_room' || token.context.parentMethod === 'room' || token.context.parentMethod === 'roomsize') && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-purple-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Room Reverb Space & Diffusion:</span>
                </span>
                <span className="text-[10px] text-gray-500 font-mono">Amount: {customValue}</span>
              </div>

              {/* Slider */}
              <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 flex flex-col gap-2">
                <div className="flex justify-between text-[11px] text-gray-700">
                  <span>Reverb Wet Mix:</span>
                  <span className="font-mono font-bold text-purple-300">{Math.round((parseFloat(customValue) || 0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={parseFloat(customValue) || 0.3}
                  onChange={(e) => setCustomValue(e.target.value)}
                  className="w-full accent-purple-400 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  { label: '0.0 (Dry Signal)', val: '0', desc: '100% direct, zero reflections' },
                  { label: '0.15 (Dry Tight Booth)', val: '0.15', desc: 'Close vocal/snare presence' },
                  { label: '0.35 (Studio Room)', val: '0.35', desc: 'Natural acoustic drum room' },
                  { label: '0.55 (Concert Hall)', val: '0.55', desc: 'Expansive live performance feel' },
                  { label: '0.78 (Cathedral Chamber)', val: '0.78', desc: 'Lush blooming ambient wash' },
                  { label: '0.95 (Vast Cosmic Void)', val: '0.95', desc: 'Endless generative drone tail' },
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => setCustomValue(item.val)}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all active:scale-95 ${
                      customValue === item.val
                        ? 'bg-purple-500 text-gray-900 border-purple-500 shadow-md'
                        : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                    }`}
                  >
                    <span className="text-xs font-bold font-mono">{item.label}</span>
                    <span className={`text-[10px] line-clamp-1 ${customValue === item.val ? 'text-gray-900/80' : 'text-gray-600'}`}>
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CONTEXTUAL SELECTOR 8: DSP DELAY & ECHO */}
          {(token.category === 'effect_delay' || token.category === 'effect_delaytime' || token.category === 'effect_delayfeedback' || token.context.parentMethod === 'delay' || token.context.parentMethod === 'delaytime' || token.context.parentMethod === 'delayfeedback') && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-purple-300">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Metric Echo & Stereo Delay Send:</span>
                </span>
                <span className="text-[10px] text-gray-500 font-mono">Time: {customValue}</span>
              </div>

              {/* Quick Slider */}
              <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 flex flex-col gap-2">
                <div className="flex justify-between text-[11px] text-gray-700">
                  <span>Echo Time / Send Intensity:</span>
                  <span className="font-mono font-bold text-purple-300">{customValue}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.025"
                  value={parseFloat(customValue) || 0.25}
                  onChange={(e) => setCustomValue(e.target.value)}
                  className="w-full accent-purple-400 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  { label: '0.125 (1/8th Note)', val: '0.125', desc: 'Driving fast techno sync' },
                  { label: '0.1875 (Dotted 1/16th)', val: '0.1875', desc: 'Syncopated garage bounce' },
                  { label: '0.25 (1/4 Note Quarter)', val: '0.25', desc: 'Classic rhythmic dub pulse' },
                  { label: '0.333 (Triplet Echo)', val: '0.333', desc: 'Psychedelic polyrhythmic swing' },
                  { label: '0.375 (Dotted 1/8th)', val: '0.375', desc: 'Iconic U2/trance dotted delay' },
                  { label: '0.5 (1/2 Note Half)', val: '0.5', desc: 'Spacious floating ambient echo' },
                  { label: '0.75 (3/4 Measure)', val: '0.75', desc: 'Deep dub reggae space delay' },
                  { label: '0.05 (Slapback Echo)', val: '0.05', desc: 'Vintage 50s rockabilly slap' },
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => setCustomValue(item.val)}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all active:scale-95 ${
                      customValue === item.val
                        ? 'bg-purple-500 text-gray-900 border-purple-500 shadow-md'
                        : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                    }`}
                  >
                    <span className="text-xs font-bold font-mono">{item.label}</span>
                    <span className={`text-[10px] line-clamp-1 ${customValue === item.val ? 'text-gray-900/80' : 'text-gray-600'}`}>
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CONTEXTUAL SELECTOR 9: ENVELOPE DECAY / ATTACK / RELEASE */}
          {(token.category === 'effect_decay' || token.category === 'effect_attack' || token.category === 'effect_release' || token.category === 'effect_sustain' || token.context.parentMethod === 'decay' || token.context.parentMethod === 'attack' || token.context.parentMethod === 'release' || token.context.parentMethod === 'sustain') && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-purple-300">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Envelope Shape & Decay (seconds):</span>
                </span>
                <span className="text-[10px] text-gray-500 font-mono">Decay: {customValue}s</span>
              </div>

              {/* Slider */}
              <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 flex flex-col gap-2">
                <div className="flex justify-between text-[11px] text-gray-700">
                  <span>Envelope Length:</span>
                  <span className="font-mono font-bold text-purple-300">{customValue}s</span>
                </div>
                <input
                  type="range"
                  min="0.02"
                  max="4.0"
                  step="0.05"
                  value={parseFloat(customValue) || 0.4}
                  onChange={(e) => setCustomValue(e.target.value)}
                  className="w-full accent-purple-400 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  { label: '0.05s (Ultra Staccato)', val: '0.05', desc: 'Tiny micro-glitch blip' },
                  { label: '0.15s (Crisp Pluck)', val: '0.15', desc: 'Tight pizzicato / stab' },
                  { label: '0.35s (Percussive)', val: '0.35', desc: 'Standard synth pop lead' },
                  { label: '0.75s (Warm Acoustic)', val: '0.75', desc: 'Natural piano decay tail' },
                  { label: '1.5s (Sustained Pad)', val: '1.5', desc: 'Slow atmospheric chord' },
                  { label: '3.0s (Cinematic Drone)', val: '3.0', desc: 'Long evolving ambient wave' },
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => setCustomValue(item.val)}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all active:scale-95 ${
                      customValue === item.val
                        ? 'bg-purple-500 text-gray-900 border-purple-500 shadow-md'
                        : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                    }`}
                  >
                    <span className="text-xs font-bold font-mono">{item.label}</span>
                    <span className={`text-[10px] line-clamp-1 ${customValue === item.val ? 'text-gray-900/80' : 'text-gray-600'}`}>
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CONTEXTUAL SELECTOR 10: GAIN / VELOCITY */}
          {(token.category === 'effect_gain' || token.category === 'effect_velocity' || token.context.parentMethod === 'gain' || token.context.parentMethod === 'velocity') && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-purple-300">
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Layer Gain & Velocity Level:</span>
                </span>
                <span className="text-[10px] text-gray-500 font-mono">Gain: {customValue}</span>
              </div>

              {/* Slider */}
              <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 flex flex-col gap-2">
                <div className="flex justify-between text-[11px] text-gray-700">
                  <span>Volume Level:</span>
                  <span className="font-mono font-bold text-purple-300">{Math.round((parseFloat(customValue) || 0.8) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={parseFloat(customValue) || 0.8}
                  onChange={(e) => setCustomValue(e.target.value)}
                  className="w-full accent-purple-400 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {[
                  { label: '0.2 (Quiet Background)', val: '0.2' },
                  { label: '0.4 (Soft Rhythm)', val: '0.4' },
                  { label: '0.65 (Medium Harmony)', val: '0.65' },
                  { label: '0.85 (Standard Lead)', val: '0.85' },
                  { label: '1.0 (Full Unity)', val: '1.0' },
                  { label: '1.25 (Boosted Punch)', val: '1.25' },
                ].map((g) => (
                  <button
                    key={g.val}
                    onClick={() => setCustomValue(g.val)}
                    className={`p-2 rounded-lg border text-center text-xs font-bold transition-all active:scale-95 ${
                      customValue === g.val
                        ? 'bg-purple-500 text-gray-900 border-purple-500 shadow-md'
                        : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                    }`}
                  >
                    Gain {g.val}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CONTEXTUAL SELECTOR 11: STEREO PANNING */}
          {(token.category === 'effect_pan' || token.context.parentMethod === 'pan') && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-purple-300">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Stereo Field Panning (-1.0 Left to +1.0 Right):</span>
                </span>
                <span className="text-[10px] text-gray-500 font-mono">Pan: {customValue}</span>
              </div>

              {/* Slider */}
              <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 flex flex-col gap-2">
                <div className="flex justify-between text-[11px] text-gray-700">
                  <span>Pan Position:</span>
                  <span className="font-mono font-bold text-purple-300">
                    {parseFloat(customValue) < 0 ? `${Math.abs(parseFloat(customValue) * 100).toFixed(0)}% Left` : parseFloat(customValue) > 0 ? `${(parseFloat(customValue) * 100).toFixed(0)}% Right` : 'Center'}
                  </span>
                </div>
                <input
                  type="range"
                  min="-1.0"
                  max="1.0"
                  step="0.1"
                  value={parseFloat(customValue) || 0}
                  onChange={(e) => setCustomValue(e.target.value)}
                  className="w-full accent-purple-400 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {[
                  { label: '-1.0 (Hard Left)', val: '-1.0' },
                  { label: '-0.5 (Mid Left)', val: '-0.5' },
                  { label: '0.0 (Dead Center)', val: '0.0' },
                  { label: '0.5 (Mid Right)', val: '0.5' },
                  { label: '1.0 (Hard Right)', val: '1.0' },
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => setCustomValue(item.val)}
                    className={`p-2 rounded-lg border text-center text-xs font-bold transition-all active:scale-95 ${
                      customValue === item.val
                        ? 'bg-purple-500 text-gray-900 border-purple-500 shadow-md'
                        : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CONTEXTUAL SELECTOR 12: METHOD REPLACEMENT (.lpf -> .room, .decay, .delay, etc.) */}
          {token.type === 'method' && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1 text-purple-300">
                <Sliders className="w-3.5 h-3.5" />
                <span>Replace DSP Method Chain:</span>
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  { label: '.lpf (Lowpass Filter)', val: '.lpf', desc: 'Sweep frequency cutoff' },
                  { label: '.room (Reverb Space)', val: '.room', desc: 'Acoustic hall/cathedral reverberation' },
                  { label: '.delay (Echo Send)', val: '.delay', desc: 'Rhythmic metric repeats' },
                  { label: '.decay (Envelope Decay)', val: '.decay', desc: 'Note release duration' },
                  { label: '.gain (Volume Level)', val: '.gain', desc: 'Layer loudness velocity' },
                  { label: '.pan (Stereo Position)', val: '.pan', desc: 'Left/Right stereo placement' },
                  { label: '.fast (Speed Up)', val: '.fast', desc: 'Multiply layer cycle speed' },
                  { label: '.slow (Slow Down)', val: '.slow', desc: 'Divide layer cycle speed' },
                  { label: '.s (Sound / Synth Voice)', val: '.s', desc: 'Change instrument voice' },
                ].map((m) => (
                  <button
                    key={m.val}
                    onClick={() => setCustomValue(m.val)}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all active:scale-95 ${
                      customValue === m.val
                        ? 'bg-purple-500 text-gray-900 border-purple-500 shadow-md'
                        : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                    }`}
                  >
                    <span className="text-xs font-bold font-mono">{m.label}</span>
                    <span className={`text-[10px] line-clamp-1 ${customValue === m.val ? 'text-gray-900/80' : 'text-gray-600'}`}>
                      {m.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* SPEED MULTIPLIER / SUBDIVISION */}
          {(token.category === 'speed_multiplier' || token.category === 'slow_divisor' || token.category === 'effect_fast' || token.category === 'effect_slow' || token.context.parentMethod === 'fast' || token.context.parentMethod === 'slow') && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-gray-600 font-bold uppercase text-yellow-300">Speed Multipliers & Divisors:</span>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {['*2', '*3', '*4', '*6', '*8', '*16', '/2', '/3', '/4', '@2', '@3', '@0.5', '2', '3', '4', '0.5'].map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setCustomValue(sub)}
                    className={`p-2 rounded-lg border text-center text-xs font-bold transition-all active:scale-95 ${
                      customValue === sub
                        ? 'bg-yellow-500 text-white border-yellow-500'
                        : 'bg-black/5 hover:bg-black/10 text-gray-800 border-gray-200'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Actions Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg bg-black/5 hover:bg-black/10 text-gray-700 border border-gray-200 text-xs font-medium transition-colors"
            >
              Cancel
            </button>

            {onRemoveToken && token && (
              <button
                onClick={() => {
                  onClose();
                  onRemoveToken(token);
                }}
                className="px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500 text-red-600 hover:text-white border border-red-500/30 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs"
                title={`Delete/Remove "${token.raw}" block from code`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Block</span>
              </button>
            )}

            {onOpenAddBlockBehind && token && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAddBlockBehind(token);
                }}
                className="px-3 py-2 rounded-lg bg-pink-500/15 hover:bg-pink-500 text-pink-700 hover:text-white border border-pink-500/40 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs"
                title="Open Add Block palette to insert any sound/effect behind this block" aria-label="Open Add Block palette to insert any sound/effect behind this block"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Block Behind</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onApplyTokenValue(token, customValue, false)}
              className="px-3 py-2 rounded-lg bg-black/10 hover:bg-black/20 text-gray-900 border border-gray-200 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply to Code</span>
            </button>

            <button
              onClick={() => onApplyTokenValue(token, customValue, true)}
              className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-500/90 text-white text-xs font-bold flex items-center gap-1.5 shadow-[0_0_16px_rgba(242,125,38,0.4)] transition-all active:scale-95 uppercase"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              <span>Apply & Live Eval</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

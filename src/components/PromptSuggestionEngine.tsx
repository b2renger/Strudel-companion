import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Zap,
  Music2,
  Sliders,
  Compass,
  Shuffle,
  Tag,
  Search,
  Check,
  ChevronDown,
  Layers,
  Volume2
} from 'lucide-react';

export interface SuggestionItem {
  id: string;
  category: 'Full Composition' | 'Rhythm & Mini-Notation' | 'Instruments & Synths' | 'Harmony & Scales' | 'DSP Effects & Sound Design';
  title: string;
  description: string;
  promptText: string;
  tags: string[];
}

export const SUGGESTIONS_DATABASE: SuggestionItem[] = [
  // Full Compositions
  {
    id: 'amapiano-logdrum',
    category: 'Full Composition',
    title: 'Amapiano Log-Drum & Gospel Keys (113 BPM)',
    description: 'Syncopated log-drum bassline with cabasa polyrhythms, rim accents, and lush piano 9th chords.',
    promptText: 'Deep South African Amapiano groove at 113 BPM with heavy percussive log drum bass, syncopated cabasa shaker, and gospel piano chords',
    tags: ['Amapiano', 'Afrobeat', 'Log Drum', '113 BPM', 'Percussive'],
  },
  {
    id: 'koto-zen',
    category: 'Full Composition',
    title: 'Japanese Koto & Hirajoshi Zen Garden (76 BPM)',
    description: 'Serene meditative composition in the traditional 5-note Hirajoshi scale with singing bowl sub drone.',
    promptText: 'Meditative Japanese Zen ambient in Hirajoshi pentatonic scale with delicate Koto plucks, singing bowl sub drone, and spacious temple reverb',
    tags: ['Japanese', 'Koto', 'Hirajoshi', 'Zen', 'Ambient', 'Meditation'],
  },
  {
    id: 'chiptune-8bit',
    category: 'Full Composition',
    title: '8-Bit Retro Chiptune & Arcade Plucks (140 BPM)',
    description: 'Blistering GameBoy/NES square wave arpeggios, noise kick/snare, and retro melody.',
    promptText: 'Energetic 8-bit retro arcade Chiptune at 140 BPM with fast square wave arpeggiations, crunchy noise drums, and playful bassline',
    tags: ['8-Bit', 'Chiptune', 'Arcade', 'Retro', 'Square Wave', '140 BPM'],
  },
  {
    id: 'bossa-jazz',
    category: 'Full Composition',
    title: 'Ipanema Sunset Bossa Nova (124 BPM)',
    description: 'Syncopated Brazilian cross-stick rim clave, acoustic walking bass, and lush jazz chords.',
    promptText: 'Smooth Bossa Nova at 124 BPM with syncopated rimshot clave, warm walking acoustic bass, and extended minor 9th jazz chord voicings',
    tags: ['Bossa Nova', 'Latin', 'Jazz', 'Clave', 'Acoustic', '124 BPM'],
  },
  {
    id: 'mathrock-7-8',
    category: 'Full Composition',
    title: 'Math Rock 7/8 Polymetric Phasing (130 BPM)',
    description: 'Irregular meter cross-rhythms with clean melodic guitar plucks and phased syncopation.',
    promptText: 'Complex Math Rock groove in 7/8 time signature with clean polyrhythmic guitar plucks, syncopated drums, and melodic bass',
    tags: ['Math Rock', '7/8', 'Polymeter', 'Odd Meter', 'Intricate'],
  },
  {
    id: 'footwork-160',
    category: 'Full Composition',
    title: 'Chicago Footwork / Juke (160 BPM)',
    description: 'High-speed syncopated tom matrix with rapid triplet claps and sub 808 bass stabs.',
    promptText: 'High-energy Chicago Footwork at 160 BPM with syncopated triplet tom patterns, rapid fire claps, and sub 808 bass stabs',
    tags: ['Footwork', 'Juke', '160 BPM', 'Fast', 'Syncopated', '808'],
  },
  {
    id: 'acid-techno',
    category: 'Full Composition',
    title: '303 Acid Techno Rave (138 BPM)',
    description: 'Relentless 4/4 kick, 16th-note 303 resonant filter squelch, and Euclidean hi-hats.',
    promptText: 'High-energy 138 BPM Acid Techno with squelchy resonant 303 sawtooth bassline, driving 909 kick, and crisp Euclidean hi-hats',
    tags: ['Techno', '303', 'Acid', '138 BPM', 'Sawtooth'],
  },
  {
    id: 'lofi-rhodes',
    category: 'Full Composition',
    title: 'Chill Lo-Fi Jazzhop & Dusty Rhodes',
    description: 'Lazy boom-bap swing, jazz 7th chords on warm Rhodes, and vinyl tape room delay.',
    promptText: 'Relaxing 82 BPM Lo-Fi hip hop beat with jazzy Rhodes 7th chord voicings, dusty vinyl swing, and warm sub bass',
    tags: ['Lo-Fi', 'Jazz', 'Rhodes', 'Chords', 'Chill'],
  },
  {
    id: 'uk-garage',
    category: 'Full Composition',
    title: 'Skippy 2-Step UK Garage (132 BPM)',
    description: 'Syncopated swing shuffle, Reese bass stabs, and vocal glitch chops.',
    promptText: 'Skippy UK Garage 2-step rhythm at 132 BPM with syncopated ghost snares, deep Reese bassline, and warm organ stabs',
    tags: ['UKG', '2-Step', 'Syncopated', 'Reese', '132 BPM'],
  },
  {
    id: 'synthwave-80s',
    category: 'Full Composition',
    title: 'Outrun Synthwave & Gated Snare (115 BPM)',
    description: 'Pulsing 16th bass arpeggio, brassy chords, and punchy gated reverb drums.',
    promptText: '80s Outrun Synthwave with driving arpeggiated synth bass, punchy gated snare, and lush analog brass pads at 115 BPM',
    tags: ['Synthwave', 'Arpeggio', 'Retro', 'Analog'],
  },
  {
    id: 'ambient-drone',
    category: 'Full Composition',
    title: 'Generative Ambient Drone & Shimmer Delay',
    description: 'Slow evolving pentatonic bells, deep sub drone, and infinite tape reverb.',
    promptText: 'Meditative generative ambient soundscape with evolving pentatonic bells, slow cyclical filter sweeps, and infinite shimmer delay',
    tags: ['Ambient', 'Generative', 'Reverb', 'Tape Delay'],
  },
  {
    id: 'jungle-dnb',
    category: 'Full Composition',
    title: 'Amen Break Jungle / Drum & Bass (165 BPM)',
    description: 'Rapid chopped breakbeats, alternating 808 sub glide, and dub echoes.',
    promptText: 'Fast 165 BPM Jungle breakbeat with chopped syncopated drums, deep 808 sub bass glides, and dub echo stabs',
    tags: ['Jungle', 'DnB', '165 BPM', 'Fast', 'Sub Bass'],
  },

  // Rhythm & Mini-Notation
  {
    id: 'euclidean-5-8',
    category: 'Rhythm & Mini-Notation',
    title: 'Euclidean (5,8) Polyrhythmic Hi-Hats',
    description: 'Mini-notation: s("hh(5,8)") mathematical distribution across 8 steps.',
    promptText: 'with Euclidean 5/8 hi-hat pulses and syncopated off-beat rim clicks',
    tags: ['Euclidean', '(5,8)', 'Polyrhythm', 'Hi-Hats'],
  },
  {
    id: 'half-time-trap',
    category: 'Rhythm & Mini-Notation',
    title: 'Half-Time Snare Drop [~ sd]',
    description: 'Mini-notation: s("bd [~ bd] [~ sd] ~") deep half-time groove.',
    promptText: 'with heavy half-time snare drop and syncopated kick patterns',
    tags: ['Half-Time', 'Snare', 'Trap', 'Drop'],
  },
  {
    id: 'polymetric-3-4',
    category: 'Rhythm & Mini-Notation',
    title: 'Polymetric 3 against 4 Cross-Rhythm',
    description: 'Stacking 3-beat synth cycles against 4-beat percussion patterns.',
    promptText: 'with polymetric 3-against-4 cross-rhythm between the synth arpeggio and drum groove',
    tags: ['Polymetric', 'Cross-Rhythm', '3 against 4'],
  },
  {
    id: 'cycle-alternation',
    category: 'Rhythm & Mini-Notation',
    title: 'Cyclical 4-Bar Chord Progression < >',
    description: 'Mini-notation: note("<c3 eb3 f3 g3>") modulating chords each cycle.',
    promptText: 'with 4-bar alternating chord progression using cyclical angle-bracket notation',
    tags: ['Alternating', '< >', 'Progressions', 'Cycles'],
  },

  // Instruments & Synths
  {
    id: 'inst-sawtooth-303',
    category: 'Instruments & Synths',
    title: 'Resonant Sawtooth Acid Bass',
    description: '.s("sawtooth").lpf(1400).resonance(12).decay(0.2)',
    promptText: 'featuring punchy resonant sawtooth bassline with snappy low-pass envelope decay',
    tags: ['Sawtooth', 'Bass', 'Filter', 'Resonance'],
  },
  {
    id: 'inst-rhodes-chords',
    category: 'Instruments & Synths',
    title: 'Polyphonic Jazz Piano / Rhodes',
    description: 'note("<[c3 eb3 g3 bb3] [f3 ab3 c4 eb4]>").s("sine")',
    promptText: 'with warm polyphonic jazz chord inversions and gentle vibrato',
    tags: ['Piano', 'Rhodes', 'Jazz', 'Chords'],
  },
  {
    id: 'inst-supersaw',
    category: 'Instruments & Synths',
    title: 'Supersaw Trance & Future Bass Plucks',
    description: 'Detuned polyphonic saws with bright decay and stereo spread.',
    promptText: 'with bright detuned supersaw synth plucks and wide stereo panning',
    tags: ['Supersaw', 'Plucks', 'Trance', 'Stereo'],
  },

  // Harmony & Scales
  {
    id: 'harm-dorian',
    category: 'Harmony & Scales',
    title: 'Dorian Minor Groove (i - IV7)',
    description: 'Funky minor scale with natural 6th for groovy electronic movement.',
    promptText: 'in D Dorian minor scale with jazzy syncopated bass movement',
    tags: ['Dorian', 'Minor', 'Scale', 'Modal'],
  },
  {
    id: 'harm-hirajoshi',
    category: 'Harmony & Scales',
    title: 'Japanese Hirajoshi Pentatonic',
    description: 'Deep mystical 5-note scale (C, D, Eb, G, Ab).',
    promptText: 'composed in Japanese Hirajoshi pentatonic scale with meditative bell plucks',
    tags: ['Hirajoshi', 'Pentatonic', 'Japanese', 'Mystical'],
  },
  {
    id: 'harm-neo-soul',
    category: 'Harmony & Scales',
    title: 'Neo-Soul Minor 9th & 11th Chords',
    description: 'Lush extended harmonies with smooth voice leading.',
    promptText: 'using lush Neo-Soul minor 9th and major 7th chord voicings',
    tags: ['Neo-Soul', '9th Chords', 'Extended Harmony'],
  },

  // DSP Effects & Sound Design
  {
    id: 'fx-delay-reverb',
    category: 'DSP Effects & Sound Design',
    title: 'Ping-Pong Tape Delay & Spatial Reverb',
    description: '.delay(0.25).delaytime(0.125).room(0.6)',
    promptText: 'with rhythmic 1/8-note ping-pong tape delay and wide room reverb',
    tags: ['Delay', 'Reverb', 'Space', 'Echo'],
  },
  {
    id: 'fx-lpf-sweep',
    category: 'DSP Effects & Sound Design',
    title: 'Dynamic Low-Pass Filter (LPF) Cutoff',
    description: '.lpf("<800 1400 2400 600>") cycling sweep.',
    promptText: 'with dynamic low-pass filter sweeps modulating the master synth',
    tags: ['LPF', 'Filter', 'Cutoff', 'Modulation'],
  },
  {
    id: 'fx-vinyl-flutter',
    category: 'DSP Effects & Sound Design',
    title: 'Vintage Vinyl Crackle & Tape Flutter',
    description: 'Analog warmth with pitch flutter and warm saturation.',
    promptText: 'with vintage vinyl flutter, gentle tube warmth, and subtle micro-timing swing',
    tags: ['Vinyl', 'Flutter', 'Lo-Fi', 'Warmth'],
  },
];

export const QUICK_ADD_MODIFIERS = [
  { label: '+ 303 Acid Bass', snippet: 'with resonant 303 acid sawtooth bassline' },
  { label: '+ Euclidean (5,8) Hats', snippet: 'with Euclidean (5,8) hi-hat polyrhythm' },
  { label: '+ Lush Tape Delay', snippet: 'with 1/8 note tape delay and room reverb' },
  { label: '+ Jazzy 7th Chords', snippet: 'with lush jazzy 7th chord voicings' },
  { label: '+ Half-Time Beat', snippet: 'with heavy half-time snare drop feel' },
  { label: '+ Low-Pass Sweep', snippet: 'with cycling low-pass filter cutoff sweeps' },
  { label: '+ 140 BPM Techno', snippet: 'at 140 BPM with 4-on-the-floor kick' },
  { label: '+ Vinyl Lo-Fi Swing', snippet: 'with subtle vinyl flutter and swing' },
];

interface PromptSuggestionEngineProps {
  currentPrompt: string;
  onSelectPrompt: (newPrompt: string) => void;
  /** Generate immediately with this prompt. Falls back to onSelectPrompt. */
  onSurprise?: (newPrompt: string) => void;
  onAppendModifier: (modifier: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const PromptSuggestionEngine: React.FC<PromptSuggestionEngineProps> = ({
  currentPrompt,
  onSelectPrompt,
  onSurprise,
  onAppendModifier,
  isOpen,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on prompt text or search query
  const effectiveQuery = (searchQuery || currentPrompt || '').toLowerCase().trim();

  const filteredSuggestions = SUGGESTIONS_DATABASE.filter((item) => {
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    if (!matchesCategory) return false;

    if (!effectiveQuery) return true;

    // Check query against title, description, promptText, or tags
    const inTitle = item.title.toLowerCase().includes(effectiveQuery);
    const inDesc = item.description.toLowerCase().includes(effectiveQuery);
    const inPrompt = item.promptText.toLowerCase().includes(effectiveQuery);
    const inTags = item.tags.some((t) => t.toLowerCase().includes(effectiveQuery));

    return inTitle || inDesc || inPrompt || inTags;
  });

  // Handle Surprise Me Randomizer
  const handleSurpriseMe = () => {
    const genres = [
      'Lo-Fi jazzy chillhop',
      'High-energy Acid 303 Techno at 138 BPM',
      'Skippy 2-step UK Garage at 132 BPM',
      '80s Outrun Synthwave with analog brass',
      'Generative Ambient drone with temple bells',
      'Deep Melodic House',
      'Chopped Jungle DnB at 165 BPM',
      'South African Amapiano with syncopated log drums at 113 BPM',
      'Meditative Japanese Zen ambient in Hirajoshi scale',
      'Fast 8-bit arcade Chiptune with square wave arpeggios at 140 BPM',
      'Warm Bossa Nova jazz at 124 BPM with syncopated rimshot clave',
      'Math Rock 7/8 polymetric phasing at 130 BPM',
      'Chicago Footwork / Juke at 160 BPM with triplet toms',
    ];
    const rhythms = [
      'with Euclidean (5,8) hi-hat polyrhythm and ghost snares',
      'with 4-on-the-floor kick and skippy syncopation',
      'with half-time trap snare drops and alternating hi-hat rolls',
      'with polymetric 3-against-4 cross-rhythms',
      'with syncopated shaker and percussive rim clicks',
      'with broken Amen break chopped rolls and crash cymbals',
    ];
    const synths = [
      'warm rhodes electric piano chords and sub bass',
      'resonant squelchy sawtooth synth arpeggios',
      'lush detuned sawtooth pads and plucked lead',
      'bell-like piano tones and an evolving sine sub drone',
      'delicate plucked koto lines and sine bowl resonance',
      'bouncy square wave 8-bit arpeggios and punchy bass',
      'minor 11th jazz piano voicings and walking bass',
    ];
    const fx = [
      'with ping-pong tape delay and lush room reverb',
      'with dynamic low-pass filter cutoff sweeps',
      'with vintage vinyl warmth and subtle swing',
      'with resonant 303 filter sweeps and stereo spread',
      'with deep spatial temple reverberation',
    ];

    const randomGenre = genres[Math.floor(Math.random() * genres.length)];
    const randomRhythm = rhythms[Math.floor(Math.random() * rhythms.length)];
    const randomSynth = synths[Math.floor(Math.random() * synths.length)];
    const randomFx = fx[Math.floor(Math.random() * fx.length)];

    const generated = `${randomGenre} featuring ${randomSynth} ${randomRhythm} ${randomFx}`;

    // Hand it straight to the active AI engine when the parent supports it.
    // "Surprise me" that only fills a text box and waits for another click is
    // not a surprise; it is homework.
    if (onSurprise) {
      onSurprise(generated);
      onClose();
    } else {
      onSelectPrompt(generated);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredSuggestions.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredSuggestions.length) % Math.max(1, filteredSuggestions.length));
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        // Requires a modifier.
        //
        // The condition used to be `(e.ctrlKey || e.metaKey || filteredSuggestions.length > 0)`,
        // and the suggestion list is non-empty in the common case — so a plain
        // Enter ANYWHERE in the document was intercepted and replaced the
        // user's prompt with whichever suggestion happened to be highlighted.
        // On a phone that meant the keyboard's Go key could never submit, so
        // the one-tap path to the app's core action did not exist.
        if (filteredSuggestions[selectedIndex]) {
          e.preventDefault();
          onSelectPrompt(filteredSuggestions[selectedIndex].promptText);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredSuggestions, onSelectPrompt, onClose]);

  if (!isOpen) return null;

  const categories = [
    'All',
    'Full Composition',
    'Rhythm & Mini-Notation',
    'Instruments & Synths',
    'Harmony & Scales',
    'DSP Effects & Sound Design',
  ];

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 right-0 mt-1.5 z-40 bg-[var(--app-card-1)] border border-emerald-500/40 rounded-xl shadow-2xl overflow-hidden font-mono text-gray-900 animate-in fade-in zoom-in-95 duration-150"
      style={{ maxHeight: '460px' }}
    >
      {/* Top Header Bar */}
      <div className="bg-gray-50 px-3.5 py-2.5 border-b border-gray-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-600 flex items-center justify-center">
            <Sparkles className="w-3 h-3" />
          </div>
          <span className="text-xs font-bold text-gray-900 uppercase tracking-tight">
            AI Prompt Suggestion Engine
          </span>
          <span className="text-[10px] text-gray-500 hidden sm:inline">
            [↑↓ Navigate • Enter to Apply • Esc to Close]
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSurpriseMe}
            className="px-2.5 py-1 rounded-md bg-pink-500/15 hover:bg-pink-500/25 text-pink-600 border border-pink-500/40 text-[10px] font-bold flex items-center gap-1.5 transition-all uppercase shadow-sm"
            title="Randomly generate algorithmic prompt recipe" aria-label="Randomly generate algorithmic prompt recipe"
          >
            <Shuffle className="w-2.5 h-2.5" />
            <span>Surprise Me</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-600 hover:text-gray-900 text-xs px-1.5 py-0.5 rounded-md hover:bg-gray-100"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="bg-[var(--app-card-1)] px-3 py-1.5 border-b border-gray-200 flex items-center gap-1.5 overflow-x-auto text-[10px]">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => {
              setActiveCategory(cat);
              setSelectedIndex(0);
            }}
            className={`px-2.5 py-1 rounded-md uppercase font-bold whitespace-nowrap transition-all ${
              activeCategory === cat
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 bg-gray-100 border border-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Quick Additive Modifier Tokens */}
      <div className="bg-[var(--app-card-1)] px-3.5 py-2 border-b border-gray-200 flex items-center gap-1.5 overflow-x-auto">
        <span className="text-[9px] text-gray-500 uppercase font-bold flex items-center gap-1 shrink-0">
          <Tag className="w-2.5 h-2.5 text-emerald-600" /> Add Modifier:
        </span>
        {QUICK_ADD_MODIFIERS.map((mod, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onAppendModifier(mod.snippet)}
            className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-800 hover:text-emerald-600 border border-gray-200 text-[10px] whitespace-nowrap font-medium transition-colors"
            title={`Append "${mod.snippet}" to prompt`}
          >
            {mod.label}
          </button>
        ))}
      </div>

      {/* Suggestions List */}
      <div className="overflow-y-auto max-h-[290px] p-2.5 space-y-1 divide-y divide-gray-200 bg-[var(--app-card-1)]">
        {filteredSuggestions.length > 0 ? (
          filteredSuggestions.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={item.id}
                onClick={() => {
                  onSelectPrompt(item.promptText);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`p-2.5 rounded-lg cursor-pointer transition-all flex flex-col gap-1.5 border ${
                  isSelected
                    ? 'bg-gray-100 border-emerald-500/60 shadow-sm ring-1 ring-emerald-500/30'
                    : 'bg-[var(--app-card-1)] hover:bg-gray-100 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-900 flex items-center gap-1.5">
                      {item.title}
                    </span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[var(--app-card-1)] text-emerald-600 font-semibold border border-emerald-500/20">
                      {item.category}
                    </span>
                  </div>

                  <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 uppercase">
                    Use Prompt ↵
                  </span>
                </div>

                <p className="text-[10px] text-gray-600 leading-snug">
                  {item.description}
                </p>

                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                  <span className="text-[9px] text-pink-600 bg-pink-500/10 px-1.5 py-0.5 rounded border border-pink-500/20 font-mono truncate max-w-full">
                    "{item.promptText}"
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-6 text-gray-500 text-xs flex flex-col items-center gap-1.5">
            <Search className="w-5 h-5 text-gray-500" />
            <span>No exact prompt matches found for "{effectiveQuery}"</span>
            <button
              type="button"
              onClick={handleSurpriseMe}
              className="mt-2 px-3 py-1 rounded-md bg-emerald-500 text-white font-bold text-[10px] uppercase shadow-sm"
            >
              Generate Random Algorithmic Prompt
            </button>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-gray-50 px-3.5 py-2 border-t border-gray-200 flex items-center justify-between text-[9px] text-gray-500">
        <span>{filteredSuggestions.length} Algorithmic Templates & Notation Modifiers</span>
        <span className="text-emerald-600 font-semibold">Click any suggestion to fill prompt bar</span>
      </div>
    </div>
  );
};

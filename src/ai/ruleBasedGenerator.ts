/**
 * Instant Rule-Based Algorithmic Synthesis & Tweak Heuristics.
 * Provides 100% offline, zero-latency, zero-cost pattern generation and transformation.
 */

import { AIGeneratedTrack, AITweakResult, AIExplanationResult, AIVariation } from '../types';

export interface GenreTemplate {
  name: string;
  defaultBpm: number;
  tags: string[];
  patterns: Array<{
    title: string;
    description: string;
    code: string;
    theory: string;
  }>;
}

export const GENRE_TEMPLATES: Record<string, GenreTemplate> = {
  cyberpunk: {
    name: 'Cyberpunk / Synthwave',
    defaultBpm: 120,
    tags: ['Cyberpunk', 'Darksynth', 'Midtempo', '80s'],
    patterns: [
      {
        title: 'Neon Overdrive',
        description: 'Aggressive 16th-note sawtooth bass with punchy 4-on-the-floor drums and resonant filter sweeps.',
        theory: 'Rooted in A Natural Minor with syncopated octave jumps and gated snare.',
        code: `// Cyberpunk - Neon Overdrive (120 BPM)
stack(
  s("bd*4"),
  s("~ cp ~ cp").gain(0.9),
  s("hh*16").gain(0.65),
  note("a1 [a1 a1] [c2 a1] [e2 g2]").s("sawtooth").lpf(1800).decay(0.2).gain(0.95),
  note("<[a3 c4 e4 g4]*2 [f3 a3 c4 e4]*2>").s("sawtooth").lpf(2800).decay(0.3).gain(0.7).delay(0.25)
)`,
      },
      {
        title: 'Grid Runner Midtempo',
        description: 'Driving midtempo bassline with Euclidean percussion and distorted leads.',
        theory: 'F Minor scale with chromatic bass passing tones.',
        code: `// Cyberpunk - Grid Runner (110 BPM)
stack(
  s("bd(3,8)"),
  s("~ [cp,sd] ~ [cp,sd]").gain(0.85),
  s("hh(7,16)").gain(0.6),
  note("f1 [f1 ab1] c2 [eb2 f2]").s("sawtooth").lpf(2200).decay(0.18).gain(0.9),
  note("<[f3 ab3 c4] [db3 f3 ab3] [eb3 g3 bb3]>").s("supersaw").lpf(3400).decay(0.4).gain(0.6).room(0.4)
)`,
      },
    ],
  },
  amapiano: {
    name: 'Amapiano / Afrobeat',
    defaultBpm: 113,
    tags: ['Amapiano', 'Afrobeat', 'Log Drum', 'Shaker'],
    patterns: [
      {
        title: 'Soweto Log-Drum Suite',
        description: 'Deep percussive log drum bassline with syncopated cabasa and lush gospel piano chord inversions.',
        theory: 'F Minor with syncopated 16th log-drum pitch bends and gospel 9th harmonies.',
        code: `// Amapiano - Soweto Log-Drum Suite (113 BPM)
stack(
  s("bd*4, cabasa(5,8)").gain(0.75),
  s("[~ rim] [rim ~] [~ cp*3] [rim ~]").gain(0.8),
  note("<[f1 f1] [~ f1] [ab1 ab1] [bb1 c2]>").s("triangle").decay(0.28).lpf(850).gain(0.95),
  note("<[f3 ab3 c4 eb4] [db3 f3 ab3 c4] [eb3 g3 bb3 db4] [c3 eb3 g3 bb3]>").s("piano").decay(0.9).delay(0.3).room(0.5).gain(0.65),
  note("<[c5 eb5] [f5 ab5] [g5 bb5] [c6 ~]>").s("triangle").decay(0.18).delay(0.25).gain(0.5)
)`,
      },
    ],
  },
  jungle: {
    name: 'Jungle / Drum & Bass',
    defaultBpm: 165,
    tags: ['Jungle', 'DnB', 'Amen Break', '808 Sub'],
    patterns: [
      {
        title: 'Amen Chopped Breakbeat',
        description: 'Blistering 165 BPM chopped breakbeat with sub-frequency 808 glides and dub chord stabs.',
        theory: 'F Dorian with syncopated micro-rolls and tape delay feedback.',
        code: `// Jungle - Amen Chopped Breakbeat (165 BPM)
stack(
  s("bd [~ bd*2] [sd bd] [~ sd*3], cr?").gain(0.9),
  s("hh(7,16), shaker(5,8)").gain(0.5),
  note("<f1@2 [~ f1] [ab1 ~] [eb1@2 c1]>").s("sawtooth").lpf(450).decay(0.7).gain(1.0),
  note("<[f4 ab4 c5 eb5] ~ [db4 f4 ab4 c5] ~>").s("sawtooth").lpf(2600).decay(0.15).delay(0.35).gain(0.6),
  note("<f2 ab2 c3 eb3>*2").s("sawtooth").lpf(1800).decay(0.14).gain(0.7)
)`,
      },
    ],
  },
  chiptune: {
    name: '8-Bit Chiptune / Arcade',
    defaultBpm: 140,
    tags: ['8-Bit', 'Chiptune', 'GameBoy', 'NES', 'Square Wave'],
    patterns: [
      {
        title: 'Pixel Dungeon Arcade',
        description: 'Blistering 8-bit square wave arpeggios, noise drums, and bouncy retro bassline.',
        theory: 'C Major / A Minor fast 16th triad arpeggiations with staccato decay envelopes.',
        code: `// 8-Bit Chiptune - Pixel Dungeon (140 BPM)
stack(
  s("bd [~ bd] sd [~ [sd bd]]").gain(0.85),
  s("hh*8").gain(0.5),
  note("<[c2 c2] [eb2 c2] [f2 g2] [bb2 c3]>").s("square").decay(0.18).gain(0.9),
  note("<[c4 e4 g4 c5]*4 [a3 c4 e4 a4]*4 [f3 a3 c4 f4]*4 [g3 b3 d4 g4]*4>").s("square").decay(0.12).gain(0.7).delay(0.2)
)`,
      },
    ],
  },
  koto: {
    name: 'Japanese Koto / Zen Ambient',
    defaultBpm: 76,
    tags: ['Japanese', 'Hirajoshi', 'Koto', 'Zen', 'Meditation'],
    patterns: [
      {
        title: 'Kyoto Bamboo Zen Garden',
        description: 'Serene meditative composition set in the ancient 5-note Japanese Hirajoshi scale.',
        theory: 'Hirajoshi scale (C, D, Eb, G, Ab) with resonant singing bowl sub drone and spacious reverb.',
        code: `// Japanese Koto - Kyoto Zen Garden (76 BPM)
stack(
  s("~ rim ~ [rim ~], perc(3,8)?").gain(0.7),
  note("<[c4 d4 eb4 g4] [g4 ab4 c5 d5] [eb4 g4 ab4 c5] [d4 eb4 g4 c5]>").s("triangle").decay(0.6).delay(0.4).room(0.7).gain(0.75),
  note("<c1 g1 c1 f1>").s("sine").decay(2.0).gain(0.85),
  note("<[c5 eb5 g5 c6] [ab4 c5 eb5 g5]>").s("sine").decay(1.2).room(0.85).delay(0.5).gain(0.55)
)`,
      },
    ],
  },
  bossa: {
    name: 'Bossa Nova / Latin Jazz',
    defaultBpm: 124,
    tags: ['Bossa Nova', 'Latin', 'Samba', 'Jazz Chords'],
    patterns: [
      {
        title: 'Ipanema Sunset Bossa',
        description: 'Syncopated Brazilian rimshot clave, walking acoustic bass, and lush minor 9th and 13th chords.',
        theory: 'Dm9 - G13 - Cmaj9 progression with syncopated cross-stick clave accents.',
        code: `// Bossa Nova - Ipanema Sunset (124 BPM)
stack(
  s("bd [~ bd] [~ bd] bd, [rim ~] [~ rim] [rim ~] [~ rim]").gain(0.8),
  s("shaker*4").gain(0.5),
  note("<[d2 a1] [g2 d2] [c2 g1] [a2 e2]>").s("triangle").decay(0.45).gain(0.85),
  note("<[d3 f3 a3 c4 e4] [g3 b3 d4 f4 e4] [c3 e3 g3 b3 d4] [a3 c#4 e4 g4 bb4]>").s("piano").decay(0.7).room(0.4).gain(0.7)
)`,
      },
    ],
  },
  mathrock: {
    name: 'Math Rock / Polymeter 7/8',
    defaultBpm: 130,
    tags: ['Math Rock', 'Polymeter', '7/8', 'Euclidean'],
    patterns: [
      {
        title: 'Polymetric Phasing 7/8',
        description: 'Irregular meter cross-rhythms with clean guitar plucks and phased syncopation.',
        theory: '7/8 time signature with 3 against 4 polymetric phasing in E Lydian.',
        code: `// Math Rock - Polymetric Phasing (130 BPM)
stack(
  s("bd(3,7), sd(2,7)").gain(0.85),
  s("hh(5,7), rim(4,7)").gain(0.6),
  note("<[e3 g#3 b3 d#4] [c#3 e3 g#3 b3] [a2 c#3 e3 g#3]>").s("triangle").decay(0.35).delay(0.25).gain(0.75),
  note("<e2 c#2 a1 b1>").s("sawtooth").lpf(1200).decay(0.3).gain(0.85)
)`,
      },
    ],
  },
  footwork: {
    name: 'Footwork / Juke 160',
    defaultBpm: 160,
    tags: ['Footwork', 'Juke', '160 BPM', 'Chicago', 'Chopped'],
    patterns: [
      {
        title: 'Chicago 160 Juke Matrix',
        description: 'High-speed syncopated tom matrix with rapid triplet claps and sub 808 bass stabs.',
        theory: 'Dorian mode with triplet poly-syncopations and micro-chopped tom rhythms.',
        code: `// Footwork - Chicago 160 Juke (160 BPM)
stack(
  s("bd [~ bd] [~ bd] [bd ~]").gain(0.9),
  s("~ [tom tom] ~ [tom*3]").gain(0.75),
  s("hh*4 [hh*3] hh [hh*6]").gain(0.55),
  note("<d1 [~ d1] [f1 ~] [g1 a1]>").s("sine").decay(0.4).gain(1.0),
  note("<[d4 f4 a4] ~ [c4 e4 g4] ~>").s("sawtooth").lpf(2400).decay(0.12).delay(0.2).gain(0.65)
)`,
      },
    ],
  },
  lofi: {
    name: 'Lo-Fi',
    defaultBpm: 84,
    tags: ['Lo-Fi', 'Rhodes', 'Chillhop'],
    patterns: [
      {
        title: 'Midnight Coffee Lo-Fi',
        description: 'Warm, vinyl-filtered Rhodes chords with lazy swung boom-bap drums and sub sine bass.',
        theory: 'Jazz progression in Dm9 -> G13 -> Cmaj9 with rich extended harmonies.',
        code: `// Lo-Fi - Midnight Coffee (84 BPM)
stack(
  s("bd ~ [~ bd] ~").gain(0.9),
  s("~ [sd,cp] ~ [sd,cp]").gain(0.75),
  s("[hh*2 ~ hh]*2").gain(0.45),
  note("<[d3 f3 a3 c4 e4] [g3 b3 d4 f4 a4] [c3 e3 g3 b4 d5] [a2 c3 e3 g3]>").s("piano").decay(0.65).gain(0.7).room(0.5),
  note("<d2 g2 c2 a1>").s("sine").decay(0.7).gain(0.85).lpf(600)
)`,
      },
    ],
  },
  acid: {
    name: 'Acid Techno',
    defaultBpm: 138,
    tags: ['Acid', '303', 'Techno'],
    patterns: [
      {
        title: 'Acid 303 Resonance',
        description: 'Hypnotic TB-303 style squelch with Euclidean offbeat hi-hats and industrial kick.',
        theory: 'D Phrygian mode utilizing minor seconds for dark electronic tension.',
        code: `// Acid Techno - 303 Resonance (138 BPM)
stack(
  s("bd*4"),
  s("~ [oh hh] ~ [oh hh]").gain(0.8),
  s("~ cp ~ cp").gain(0.85),
  note("<c2 [eb2 c2] [f2 g2] [bb2 c3]>*2").s("sawtooth").lpf(1600).decay(0.15).gain(0.95),
  s("perc(5,8)").gain(0.5).delay(0.2)
)`,
      },
    ],
  },
  ambient: {
    name: 'Ambient',
    defaultBpm: 70,
    tags: ['Ambient', 'Meditative', 'Drone'],
    patterns: [
      {
        title: 'Celestial Drifts',
        description: 'Ethereal polyphonic pads with gentle harmonic arpeggios and expansive spatial reverb.',
        theory: 'Lydian mode in E with sharp 4th creating serene floating weightlessness.',
        code: `// Ambient - Celestial Drifts (70 BPM)
stack(
  note("<[e3 g#3 b3 d#4] [c#3 e3 g#3 b3] [a2 c#3 e3 g#3]>").s("piano").decay(1.2).gain(0.75).room(0.8).delay(0.6),
  note("<e1 c#1 a0 b0>").s("sine").decay(1.4).gain(0.8).lpf(400),
  s("~ ~ ~ perc?").gain(0.3).room(0.9)
)`,
      },
    ],
  },
  ukgarage: {
    name: 'UK Garage',
    defaultBpm: 132,
    tags: ['UK Garage', '2-Step', 'Bassline'],
    patterns: [
      {
        title: 'London 2-Step',
        description: 'Classic swung 2-step syncopation with organ stabs and bouncy square wave bassline.',
        theory: 'Eb Minor pentatonic with syncopated 16th-note swing.',
        code: `// UK Garage - London 2-Step (132 BPM)
stack(
  s("bd ~ ~ [bd ~]").gain(0.95),
  s("~ sd ~ sd").gain(0.85),
  s("[hh hh*2] [hh ~] [hh hh*2] [hh*2 ~]").gain(0.6),
  note("<eb2 [eb2 ~] [gb2 ~] bb1>").s("square").decay(0.2).gain(0.9).lpf(1400),
  note("<[eb3 gb3 bb3] ~ [ab3 c4 eb4] ~>").s("sawtooth").lpf(2400).decay(0.15).gain(0.7).delay(0.2)
)`,
      },
    ],
  },
};

/**
 * Generate a complete Strudel track based on natural language prompt.
 */
export function generateHeuristicTrack(
  prompt: string,
  style: string = '',
  complexity: 'Beginner' | 'Intermediate' | 'Advanced' = 'Intermediate',
  tempo: number = 120
): AIGeneratedTrack {
  const p = prompt.toLowerCase();

  let matchedGenre = 'cyberpunk';
  if (p.includes('lofi') || p.includes('lo-fi') || p.includes('chill') || p.includes('coffee') || p.includes('jazz')) {
    matchedGenre = 'lofi';
  } else if (p.includes('acid') || p.includes('303') || p.includes('techno') || p.includes('industrial') || p.includes('rave')) {
    matchedGenre = 'acid';
  } else if (p.includes('ambient') || p.includes('drone') || p.includes('meditation') || p.includes('sleep') || p.includes('calm')) {
    matchedGenre = 'ambient';
  } else if (p.includes('garage') || p.includes('2-step') || p.includes('ukg') || p.includes('swing')) {
    matchedGenre = 'ukgarage';
  } else if (style && GENRE_TEMPLATES[style.toLowerCase().replace(/[^a-z]/g, '')]) {
    matchedGenre = style.toLowerCase().replace(/[^a-z]/g, '');
  }

  const template = GENRE_TEMPLATES[matchedGenre] || GENRE_TEMPLATES.cyberpunk;
  const pattern = template.patterns[Math.floor(Math.random() * template.patterns.length)];

  const finalBpm = tempo || template.defaultBpm;

  return {
    title: pattern.title,
    bpm: finalBpm,
    genre: template.name,
    code: pattern.code,
    explanation: pattern.description,
    notationBreakdown: [
      { symbolOrMethod: 'stack(...)', meaning: 'Runs all enclosed instruments concurrently in parallel sync.' },
      { symbolOrMethod: 's("bd*4")', meaning: '4-on-the-floor steady kick drum pulse.' },
      { symbolOrMethod: '.lpf(cutoff)', meaning: 'Low-pass filter attenuating harsh high frequencies.' },
      { symbolOrMethod: 'note("<...>")', meaning: 'Cycles through alternating musical root notes each bar.' },
    ],
    liveTweaks: [
      { label: 'Filter Drop', code: pattern.code.replace(/lpf\(\d+\)/g, 'lpf(800)') },
      { label: 'Maximum Energy', code: pattern.code.replace(/lpf\(\d+\)/g, 'lpf(6000)') },
    ],
  };
}

/**
 * Tweak an existing Strudel pattern with rule-based heuristics.
 */
export function tweakHeuristicCode(currentCode: string, instruction: string): AITweakResult {
  const inst = instruction.toLowerCase();
  let modified = currentCode;
  const diffs: string[] = [];

  // Filter tweaks
  if (inst.includes('filter') || inst.includes('cutoff') || inst.includes('dark') || inst.includes('muffle')) {
    if (modified.includes('.lpf(')) {
      modified = modified.replace(/\.lpf\(\d+\)/g, '.lpf(900)');
    } else {
      modified = modified.replace(/\.s\("([^"]+)"\)/g, '.s("$1").lpf(900)');
    }
    diffs.push('Applied warm lowpass filter at 900Hz');
  } else if (inst.includes('bright') || inst.includes('open') || inst.includes('treble')) {
    modified = modified.replace(/\.lpf\(\d+\)/g, '.lpf(5500)');
    diffs.push('Opened lowpass filter cutoff to 5500Hz');
  }

  // Reverb & Delay
  if (inst.includes('reverb') || inst.includes('space') || inst.includes('room') || inst.includes('lush')) {
    if (!modified.includes('.room(')) {
      modified = modified.replace(/\.s\("([^"]+)"\)/g, '.s("$1").room(0.65)');
    }
    diffs.push('Increased algorithmic room reverb to 65%');
  }

  if (inst.includes('delay') || inst.includes('echo')) {
    if (!modified.includes('.delay(')) {
      modified = modified.replace(/\.s\("([^"]+)"\)/g, '.s("$1").delay(0.45)');
    }
    diffs.push('Added stereo feedback delay (45%)');
  }

  // Euclidean rhythm
  if (inst.includes('euclidean') || inst.includes('polyrhythm') || inst.includes('syncopat')) {
    modified = modified.replace(/s\("hh\*\d+"\)/g, 's("hh(5,8)")');
    modified = modified.replace(/s\("bd\*\d+"\)/g, 's("bd(3,8)")');
    diffs.push('Shifted rhythms to Euclidean poly-meters bd(3,8) and hh(5,8)');
  }

  // Drop / Heavy Bass
  if (inst.includes('drop') || inst.includes('heavy') || inst.includes('bass')) {
    modified = modified.replace(/\.gain\([\d\.]+\)/g, '.gain(0.95)');
    diffs.push('Maximized bass velocity and transient punch');
  }

  // Fallback if no specific keyword matched
  if (diffs.length === 0) {
    modified = modified.replace(/\.gain\(([\d\.]+)\)/g, (match, val) => {
      const v = Math.min(1.0, parseFloat(val) * 1.15).toFixed(2);
      return `.gain(${v})`;
    });
    diffs.push(`Applied musical transformation for: "${instruction}"`);
  }

  return {
    code: modified,
    summary: `Heuristic transformation applied: ${diffs.join(', ')}.`,
    diffHighlights: diffs,
    liveTweaks: [],
  };
}

/**
 * Generate diverse, randomized live performance variations from code.
 * Supports multiple regenerations with fresh variations each time.
 */
export function suggestHeuristicVariations(currentCode: string, mood: string = ''): { variations: AIVariation[] } {
  const seed = Date.now();
  const randSuffix = Math.random().toString(36).substring(2, 6);
  const lowerMood = (mood || '').toLowerCase();

  const allPossibleVariations: AIVariation[] = [
    {
      id: `var-${seed}-${randSuffix}-drop`,
      title: '💥 Peak Energy Drop',
      type: 'drop',
      description: 'Saturates 4-on-the-floor kick, opens low-pass filters to 5000Hz, and maximizes bass punch.',
      code: currentCode.includes('bd*4')
        ? currentCode.replace(/\.lpf\(\d+\)/g, '.lpf(5200)').replace(/\.gain\([\d\.]+\)/g, '.gain(0.95)')
        : currentCode.replace('stack(', 'stack(\n  // [Peak Drop Kick]\n  s("bd*4"),\n  s("hh*16").gain(0.65),'),
      createdAt: Date.now(),
    },
    {
      id: `var-${seed}-${randSuffix}-breakdown`,
      title: '🌌 Ambient Reverb Breakdown',
      type: 'breakdown',
      description: 'Mutes drum kicks, sends harmonic layers into 85% space reverb and 45% stereo delay.',
      code: currentCode
        .replace(/s\("bd[^"]*"\),?/g, '// [kick muted for breakdown]')
        .replace(/\.lpf\(\d+\)/g, '.lpf(1200)')
        .replace(/\.room\([\d\.]+\)/g, '.room(0.85)')
        .replace(/\.gain\([\d\.]+\)/g, '.gain(0.7)'),
      createdAt: Date.now(),
    },
    {
      id: `var-${seed}-${randSuffix}-euclid`,
      title: '🌀 Euclidean (3,8) / (5,8) Poly-Rhythm',
      type: 'polyrhythm',
      description: 'Converts straight subdivisions to syncopated Euclidean mathematical poly-meters.',
      code: currentCode
        .replace(/bd\*4/g, 'bd(3,8)')
        .replace(/hh\*\d+/g, 'hh(5,8)')
        .replace(/sd\*2/g, 'sd(2,8)'),
      createdAt: Date.now(),
    },
    {
      id: `var-${seed}-${randSuffix}-acid`,
      title: '🎛️ Resonant 303 Acid Sweep',
      type: 'glitch',
      description: 'Modulates sawtooth lead into a squelchy 303 acid line with snappy envelope decays.',
      code: currentCode.includes('sawtooth')
        ? currentCode.replace(/\.lpf\(\d+\)/g, '.lpf(1400)').replace(/\.decay\([\d\.]+\)/g, '.decay(0.18)')
        : currentCode.replace('stack(', 'stack(\n  // [303 Acid Lead]\n  note("<c2 eb2 f2 g2 bb2 c3>*2").s("sawtooth").lpf(1300).decay(0.18).gain(0.85),'),
      createdAt: Date.now(),
    },
    {
      id: `var-${seed}-${randSuffix}-fast`,
      title: '⚡ Double-Time Jungle / DNB Chop',
      type: 'polyrhythm',
      description: 'Accelerates hi-hats and snare subdivisions by 2x for high-octane tempo momentum.',
      code: currentCode
        .replace(/s\("hh[^"]*"\)/g, 's("hh*16").gain(0.4)')
        .replace(/s\("sd[^"]*"\)/g, 's("[~ sd]*4").gain(0.75)'),
      createdAt: Date.now(),
    },
    {
      id: `var-${seed}-${randSuffix}-halftime`,
      title: '🥁 Half-Time Heavy Sub-Bass',
      type: 'drop',
      description: 'Relaxes drum pulse to half-time groove with deep floor-shaking sine sub-bass.',
      code: currentCode
        .replace(/hh\*16/g, 'hh*4')
        .replace(/hh\*8/g, 'hh*4')
        .replace('stack(', 'stack(\n  // [Deep Sub-Bass]\n  note("<c1 f1 g1 bb1>").s("sine").decay(0.8).gain(0.95),'),
      createdAt: Date.now(),
    },
    {
      id: `var-${seed}-${randSuffix}-staccato`,
      title: '✨ Staccato Glitch & Micro-Plucks',
      type: 'glitch',
      description: 'Shortens envelope release times to 0.08s for tight, rhythmic micro-plucks.',
      code: currentCode
        .replace(/\.decay\([\d\.]+\)/g, '.decay(0.08)')
        .replace(/\.room\([\d\.]+\)/g, '.room(0.2)'),
      createdAt: Date.now(),
    },
    {
      id: `var-${seed}-${randSuffix}-stereo`,
      title: '🎚️ Stereo Orbital Pan Movement',
      type: 'harmonic',
      description: 'Pans melodic and percussive layers left-to-right in cyclical alternation.',
      code: currentCode
        .replace(/\.pan\([^)]+\)/g, '')
        .replace(/\.s\(/g, '.pan("< -0.75 0.75 >").s('),
      createdAt: Date.now(),
    },
    {
      id: `var-${seed}-${randSuffix}-minor`,
      title: '🎼 Emotive Minor 7th Re-Harmonization',
      type: 'harmonic',
      description: 'Shifts root harmonies and lead notes into deep emotive minor 7th chord voicings.',
      code: currentCode
        .replace(/c3 e3 g3/g, 'c3 eb3 g3 bb3')
        .replace(/c2 e2 g2/g, 'c2 eb2 g2 bb2')
        .replace(/d3 f#3 a3/g, 'd3 f3 a3 c4'),
      createdAt: Date.now(),
    },
    {
      id: `var-${seed}-${randSuffix}-dub`,
      title: '📻 Dub Delay Tape Echo Wash',
      type: 'breakdown',
      description: 'Applies infinite syncopated dub echoes with dotted-eighth delay times.',
      code: currentCode.includes('.delay(')
        ? currentCode.replace(/\.delay\([\d\.]+\)/g, '.delay(0.55).delaytime(0.375)')
        : currentCode.replace(/\.s\("([^"]+)"\)/g, '.s("$1").delay(0.5).delaytime(0.25).room(0.6)'),
      createdAt: Date.now(),
    },
    {
      id: `var-${seed}-${randSuffix}-lofi`,
      title: '📼 Dusty Vinyl Lo-Fi Flutter',
      type: 'chill',
      description: 'Low-passes overall frequency spectrum at 1800Hz with soft warmth and room ambiance.',
      code: currentCode
        .replace(/\.lpf\(\d+\)/g, '.lpf(1600)')
        .replace(/\.gain\([\d\.]+\)/g, '.gain(0.7)'),
      createdAt: Date.now(),
    },
    {
      id: `var-${seed}-${randSuffix}-minimal`,
      title: '🎚️ Hypnotic Minimalist Groove',
      type: 'chill',
      description: 'Strips away dense layers to focus on a hypnotic core groove and sub pulse.',
      code: currentCode
        .replace(/s\("hh\*16"\)/g, 's("hh*4").gain(0.4)')
        .replace(/\.decay\([\d\.]+\)/g, '.decay(0.2)'),
      createdAt: Date.now(),
    },
  ];

  // Shuffle and pick 3-4 distinct variations
  let filtered = allPossibleVariations;
  if (lowerMood.includes('drop') || lowerMood.includes('energy') || lowerMood.includes('bass')) {
    filtered = allPossibleVariations.filter((v) => v.type === 'drop' || v.type === 'glitch');
  } else if (lowerMood.includes('ambient') || lowerMood.includes('breakdown') || lowerMood.includes('space') || lowerMood.includes('chill')) {
    filtered = allPossibleVariations.filter((v) => v.type === 'breakdown' || v.type === 'chill');
  } else if (lowerMood.includes('poly') || lowerMood.includes('euclid') || lowerMood.includes('rhythm')) {
    filtered = allPossibleVariations.filter((v) => v.type === 'polyrhythm');
  } else if (lowerMood.includes('acid') || lowerMood.includes('glitch') || lowerMood.includes('fx')) {
    filtered = allPossibleVariations.filter((v) => v.type === 'glitch' || v.type === 'harmonic');
  }

  // If filtered list is small, fallback to all variations
  if (filtered.length < 3) {
    filtered = allPossibleVariations;
  }

  // Shuffle array using Fisher-Yates
  const shuffled = [...filtered];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return {
    variations: shuffled.slice(0, 3),
  };
}

/**
 * Auto-fix broken Strudel code syntax.
 */
export function fixHeuristicCode(code: string, errorMessage: string): { fixedCode: string; fixExplanation: string; reason: string } {
  let fixed = code;

  // Fix missing stack wrapping
  if (!fixed.includes('stack(') && fixed.includes('s(')) {
    fixed = `stack(\n  ${fixed}\n)`;
  }

  // Fix unclosed parenthesis
  const openParens = (fixed.match(/\(/g) || []).length;
  const closeParens = (fixed.match(/\)/g) || []).length;
  if (openParens > closeParens) {
    fixed = fixed + ')'.repeat(openParens - closeParens);
  }

  // Fix missing commas between stack arguments
  fixed = fixed.replace(/\)\s*\n\s*s\(/g, '),\n  s(');
  fixed = fixed.replace(/\)\s*\n\s*note\(/g, '),\n  note(');

  return {
    fixedCode: fixed,
    fixExplanation: 'Corrected syntax parenthesis nesting and comma separators.',
    reason: `Resolved error: ${errorMessage}`,
  };
}

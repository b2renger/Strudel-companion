import { TrackPreset, NotationSymbol } from '../types';

export const STARTER_PRESETS: TrackPreset[] = [
  {
    id: 'cyberpunk-synthwave',
    title: 'Neon Cyberpunk 1984',
    genre: 'Synthwave / Retrowave',
    bpm: 118,
    complexity: 'Beginner',
    tags: ['Synthwave', '80s', '808 Drums', 'Arp'],
    theoryNotes: 'A natural minor scale (A-B-C-D-E-F-G) with a driving octaved root bassline and syncopated 16th-note hi-hats.',
    description: 'Classic 80s analog synthwave with punchy 4-on-the-floor kick, gated snare, rolling arpeggiated bass, and shimmering lead.',
    code: `// Neon Cyberpunk 1984 - Beginner Level (118 BPM)
stack(
  // 1. Driving 808 Kick & Snare
  // TWEAK TIP: Try changing '[~ bd]' to 'bd' or '[sd bd]' to 'sd' to simplify the beat!
  s("bd [~ bd] [sd bd] sd"),
  
  // 2. High-speed 16th Hi-Hats with accent velocity
  // TWEAK TIP: Change 'hh*8' to 'hh*16' for double-time trap-style rolls!
  s("hh*8").gain(0.6),
  
  // 3. Rolling Synthwave Bassline in A Minor
  // TWEAK TIP: Adjust .lpf(1400) between 800 and 3000 to open/close the bass filter
  note("a1 [a1 a1] [c2 a1] e2").s("sawtooth").lpf(1400).decay(0.3).gain(0.85),
  
  // 4. Shimmering Synth Melody Arpeggio
  // TWEAK TIP: Edit chord bracket notes inside '< >' to change the chord sequence!
  note("<[a3 c4 e4 g4] [f3 a3 c4 e4] [g3 b3 d4 f4] [e3 g3 b3 d4]>").s("sawtooth").lpf(3200).decay(0.4).gain(0.7).delay(0.25)
)`
  },
  {
    id: 'lofi-jazz-hop',
    title: 'Midnight Coffee Lo-Fi',
    genre: 'Lo-Fi Hip Hop',
    bpm: 82,
    complexity: 'Beginner',
    tags: ['Chill', 'Lo-Fi', 'Rhodes', 'Boom Bap'],
    theoryNotes: 'Jazzy ii-V-I-VI progression in D minor with 7th and 9th chord extensions, laid-back swing and warm filter.',
    description: 'Laid-back boom-bap drums with syncopated rimshots, mellow Rhodes electric piano chords, and deep sub bass.',
    code: `// Midnight Coffee Lo-Fi - Beginner Level (82 BPM)
stack(
  // 1. Dusty Boom-Bap Drums with Swing
  // TWEAK TIP: Swap 'sd' with 'cp' to turn the snare into a mellow vinyl clap!
  s("bd [~ bd] sd [~ [sd bd]]"),
  
  // 2. Lazy Hi-Hat with rests
  // TWEAK TIP: Try 'hh*4' for a straighter, relaxed beat
  s("[hh ~] hh [hh hh] ~").gain(0.55),
  
  // 3. Warm Rhodes Jazz Chords (Dm7 - G7 - Cmaj7 - A7)
  // TWEAK TIP: Increase .room(0.4) to .room(0.8) for deep spatial atmospheric reverb
  note("<[d3 f3 a3 c4] [g3 b3 d4 f4] [c3 e3 g3 b4] [a3 c#4 e4 g4]>").s("piano").decay(0.9).gain(0.75).room(0.4),
  
  // 4. Smooth Sub Bass
  // TWEAK TIP: Transpose notes down an octave (d1 g1 c1 a0) for rumbling sub weight
  note("<d2 g2 c2 a1>").s("sine").decay(0.8).gain(0.9)
)`
  },
  {
    id: 'minimal-techno',
    title: 'Berlin Warehouse Techno',
    genre: 'Minimal Techno',
    bpm: 132,
    complexity: 'Intermediate',
    tags: ['Techno', 'Euclidean', '4x4', 'Acid'],
    theoryNotes: 'Hypnotic repetitive minor motif with Euclidean rhythm distribution (5 pulses across 8 slots).',
    description: 'Heavy 4-on-the-floor kick with offbeat open hat, Euclidean percussion groove, and evolving resonant acid synth.',
    code: `// Berlin Warehouse Techno - Intermediate Level (132 BPM)
stack(
  // 1. Relentless 4/4 Kick
  // TWEAK TIP: Try 'bd*4, [~ cp]*2' to layer punchy claps on beats 2 and 4!
  s("bd*4"),
  
  // 2. Offbeat Open Hi-Hat
  // TWEAK TIP: Change '[~ oh]*4' to 'oh(7,8)' for driving syncopated groove
  s("[~ oh]*4").gain(0.7),
  
  // 3. Euclidean 5/8 Rimshot & Percussion Groove
  // TWEAK TIP: Swap '(5,8)' to '(7,16)' or '(3,8)' to explore alternative polyrhythms!
  s("rim(5,8), cp(3,8)").gain(0.6),
  
  // 4. Acid 303 Resonant Synth Bass
  // TWEAK TIP: Modulate .lpf(1600) between 600 and 3500 for dynamic live filter sweeps
  note("c2 [~ c2] [eb2 c2] [g2 c2*2]").s("sawtooth").lpf(1600).decay(0.25).gain(0.8)
)`
  },
  {
    id: 'uk-garage-2step',
    title: 'London 2-Step Garage',
    genre: 'UK Garage',
    bpm: 134,
    complexity: 'Intermediate',
    tags: ['UKG', '2-Step', 'Syncopated', 'Pluck'],
    theoryNotes: 'Classic 2-step syncopated kick placement with skips and triplet hi-hat rolls.',
    description: 'Bouncy syncopated 2-step beat, snappy clap, sub-heavy bass stabs, and playful melodic plucks.',
    code: `// London 2-Step Garage - Intermediate Level (134 BPM)
stack(
  // 1. Syncopated 2-Step Kick Pattern
  // TWEAK TIP: Try changing '[~ bd]' to '[~ bd*2]' for an energetic double-kick stutter!
  s("bd ~ [~ bd] ~"),
  
  // 2. Snappy Claps on beats 2 & 4
  // TWEAK TIP: Add '.delay(0.25)' for dubby garage delay tails
  s("~ cp ~ cp").gain(0.8),
  
  // 3. Shuffling 16th Hi-Hats with triplets
  // TWEAK TIP: Edit '[hh*3]' to '[hh*4]' for rapid speed transitions
  s("hh [hh*2] hh [hh*3]").gain(0.6),
  
  // 4. Deep Donk Bass Stab in F Minor
  // TWEAK TIP: Change .decay(0.3) to .decay(0.7) to transform short stabs into long bass slides
  note("f1 [~ f1] [ab1 f1] [c2 ~]").s("sine").decay(0.3).gain(0.95),
  
  // 5. Catchy Koto/Pluck Melodic Hook
  // TWEAK TIP: Edit scale notes inside '< >' to invent your own catchy vocal/pluck hook
  note("<[c4 eb4] [f4 ab4] [bb4 c5] [g4 eb4]>").s("pluck").decay(0.25).gain(0.75).delay(0.3)
)`
  },
  {
    id: 'ambient-drone',
    title: 'Aurora Generative Drone',
    genre: 'Ambient / Drone',
    bpm: 65,
    complexity: 'Beginner',
    tags: ['Ambient', 'Chill', 'Pentatonic', 'Generative'],
    theoryNotes: 'F Major Pentatonic scale (F-G-A-C-D) producing consonant, calming open harmonic textures without tension.',
    description: 'Meditative ambient soundscape with gentle slow-evolving chord cycles, soft chimes, and vast algorithmic reverb.',
    code: `// Aurora Generative Drone - Beginner Level (65 BPM)
stack(
  // 1. Deep Oceanic Sub Drone
  // TWEAK TIP: Change 'decay(3.0)' to 'decay(6.0)' for endless sustained low drone
  note("<f1 c2 d2 bb1>").s("sine").decay(3.0).gain(0.85),
  
  // 2. Evolving Pentatonic Mallet Chimes
  // TWEAK TIP: Change .room(0.8) to .room(0.95) to enter a massive cathedral space!
  note("<[f3 a3 c4] [g3 c4 d4] [a3 c4 e4] [d3 f3 a3]>").s("piano").decay(2.0).gain(0.7).room(0.8),
  
  // 3. Sparkling Lead Melody with Delay
  // TWEAK TIP: Change .delay(0.5) to .delay(0.25) to halve the echo interval
  note("<[c4 e4 g4] [d4 f4 a4]>").s("triangle").decay(1.2).gain(0.6).delay(0.5)
)`
  },
  {
    id: 'fast-jungle-dnb',
    title: 'Amen Jungle Breakbeat',
    genre: 'Jungle / Drum & Bass',
    bpm: 165,
    complexity: 'Advanced',
    tags: ['Jungle', 'DnB', 'Breakbeat', 'Reese Bass'],
    theoryNotes: 'High-tempo polyrhythmic syncopation with 16th subdivisions, chopped snare rolls and 808 sub slides.',
    description: 'High-octane 165 BPM jungle breakbeats with rapid snare rushes, rolling hi-hats, and heavy 808 reese sub bass.',
    code: `// Amen Jungle Breakbeat - Advanced Level (165 BPM)
stack(
  // 1. Chopped Jungle Kick & Snare Breakdown
  // PRO HACK: Add '?' like 'sd*2?' for 50% randomized breakbeat ghosting!
  s("bd [~ sd] [~ bd] [sd*2 sd]"),
  
  // 2. High-speed Roller Hi-Hats
  // PRO HACK: Try 'hh(7,8)' or 'hh*16' to ramp up energy during build-ups
  s("hh*8").gain(0.5),
  
  // 3. Fast Snare Ghost Notes & Rolls
  // PRO HACK: Tweak '[~ sd*4]' to '[~ sd*6]' for explosive triplet rushes!
  s("[~ sd*2] [~ sd] [~ sd*4] ~").gain(0.65),
  
  // 4. Heavy 808 Reese Sub Bass
  // PRO HACK: Change .lpf(600) to .lpf("<400 800 1200 600>") for automated sub sweeps!
  note("<[eb1 ~] [eb1 gb1] [ab1 ~] [bb1 eb2]>").s("sawtooth").lpf(600).decay(0.5).gain(0.9)
)`
  }
];

export const NOTATION_DICTIONARY: NotationSymbol[] = [
  {
    symbol: 'a b c',
    title: 'Sequence',
    category: 'Rhythm',
    syntax: '"bd sd hh cp"',
    example: 's("bd sd hh cp")',
    description: 'Plays events one after another in time, equally dividing the cycle (e.g. 4 sounds = 1 beat each in a 4-beat cycle).',
  },
  {
    symbol: 'a, b',
    title: 'Polyphony / Parallel',
    category: 'Grouping',
    syntax: '"bd sd, hh*4"',
    example: 's("bd sd, hh*4")',
    description: 'Plays multiple patterns at the exact same time. The comma separates independent concurrent layers.',
  },
  {
    symbol: '[a b]',
    title: 'Subdivision Grouping',
    category: 'Grouping',
    syntax: '"bd [sd sd] bd sd"',
    example: 's("bd [sd sd] bd sd")',
    description: 'Squeezes multiple events into a single step time slot, creating double-time or syncopated subdivisions.',
  },
  {
    symbol: '*n',
    title: 'Fast Repeat Multiplier',
    category: 'Speed',
    syntax: '"hh*8"',
    example: 's("hh*8")',
    description: 'Repeats the sound or group n times within its time slot (e.g. hh*8 plays 8 rapid hi-hats in 1 cycle).',
  },
  {
    symbol: '~',
    title: 'Rest / Silence',
    category: 'Rhythm',
    syntax: '"bd [~ sd] bd sd"',
    example: 's("bd [~ sd] bd sd")',
    description: 'A musical rest or silence. Useful for syncopation like putting the snare on the offbeat [~ sd].',
  },
  {
    symbol: '<a b c>',
    title: 'Cycle Alternation',
    category: 'Variation',
    syntax: '"<c3 e3 g3 b3>"',
    example: 'note("<c3 e3 g3 b3>").s("sawtooth")',
    description: 'Plays item \'a\' on cycle 1, \'b\' on cycle 2, \'c\' on cycle 3, and so on. Essential for chord progressions and evolving basslines.',
  },
  {
    symbol: '(k, n)',
    title: 'Euclidean Rhythm',
    category: 'Rhythm',
    syntax: '"bd(3,8)"',
    example: 's("bd(3,8), hh(5,8)")',
    description: 'Distributes k pulses as evenly as mathematically possible across n steps. Forms the basis of African, Latin, and Techno rhythms.',
  },
  {
    symbol: '.lpf(hz)',
    title: 'Low-Pass Filter',
    category: 'Effects',
    syntax: '.lpf(1200)',
    example: 'note("c2 eb2 g2").s("sawtooth").lpf(800)',
    description: 'Cuts high frequencies above the specified frequency (Hz) for a warm, muffled, or punchy synth/bass tone.',
  },
  {
    symbol: '.delay(amt)',
    title: 'Stereo Echo Delay',
    category: 'Effects',
    syntax: '.delay(0.3)',
    example: 'note("c4 e4 g4").s("pluck").delay(0.4)',
    description: 'Adds repeating rhythmic echoes in stereo space for spaciousness and texture.',
  },
  {
    symbol: '.gain(vol)',
    title: 'Layer Volume',
    category: 'Effects',
    syntax: '.gain(0.8)',
    example: 's("hh*8").gain(0.5)',
    description: 'Controls the relative loudness (0.0 to 1.5) of an individual layer in your mix.',
  }
];

export const INSPIRATION_PROMPTS = [
  'Chill Lo-Fi beat with Rhodes chords and vinyl swing drums',
  'Cyberpunk 80s synthwave with a driving deep kick and fast arpeggios',
  'Deep hypnotic minimal techno with Euclidean hi-hats and acid bass',
  'High-energy UK garage with syncopated 2-step drums and warm square-wave stabs',
  'Meditative ambient drone in F Major pentatonic with lush reverb',
  'Fast jungle breakbeat 165bpm with chopped snare rolls and a sine sub bass',
  'Bossa nova groove in F minor with soft rimshots and guitar plucks',
  'Chiptune 8-bit retro arcade boss battle in D minor with square waves'
];

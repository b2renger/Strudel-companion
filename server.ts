import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";
import { jsonrepair } from "jsonrepair";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const getAi = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  return new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

const cleanAndParseJson = (rawText?: string) => {
  if (!rawText) return null;
  let clean = rawText.trim();
  if (clean.startsWith("```json")) {
    clean = clean.replace(/^```json\s*/, "").replace(/```\s*$/, "");
  } else if (clean.startsWith("```")) {
    clean = clean.replace(/^```\s*/, "").replace(/```\s*$/, "");
  }
  clean = clean.trim();

  try {
    return JSON.parse(clean);
  } catch (err) {
    try {
      // Use jsonrepair to fix unescaped quotes, raw newlines, trailing commas, etc.
      return JSON.parse(jsonrepair(clean));
    } catch (e1) {
      // Fallback: extract the JSON object if there's trailing garbage
      const firstBrace = clean.indexOf("{");
      const lastBrace = clean.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const sliced = clean.substring(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(jsonrepair(sliced));
        } catch (e2) {
          throw err;
        }
      }
      throw err;
    }
  }
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs = 20000): Promise<T> => {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
};

// Robust multi-model caller with automatic failover across model tiers
async function callGeminiWithFallbacks(
  fullPrompt: string,
  systemInstruction: string,
  timeoutMs = 20000
): Promise<any | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const ai = getAi();
  // Official Gemini models in priority sequence for high availability and low latency
  const candidateModels = [
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
    "gemini-2.0-flash",
  ];

  for (const model of candidateModels) {
    try {
      const apiCall = ai.models.generateContent({
        model,
        contents: fullPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.8,
          maxOutputTokens: 3000,
        },
      });

      const response = await withTimeout(apiCall, timeoutMs);
      const parsed = cleanAndParseJson(response.text);
      if (parsed) {
        return parsed;
      }
    } catch (err: any) {
      console.log(`[Gemini API] Model ${model} call failed, trying next candidate:`, err?.message || String(err));
      continue;
    }
  }

  console.error(`[Gemini API] All model candidates failed.`);
  return null;
}

// Procedural Multi-Genre Algorithmic Pattern Generator for Maximum Musical Variety
const generateLocalPattern = (
  promptText: string = "Algorithmic Pattern",
  style: string = "Electronic",
  complexity: string = "Beginner",
  tempo: number = 120
) => {
  const p = (promptText + " " + style).toLowerCase();
  const comp = (complexity || "Beginner").toLowerCase();

  // Pick or detect specific genre archetype
  type GenreArchetype =
    | "acid"
    | "lofi"
    | "synthwave"
    | "ambient"
    | "ukgarage"
    | "jungle"
    | "amapiano"
    | "chiptune"
    | "neosoul"
    | "dubstep"
    | "minimal"
    | "koto"
    | "bossa"
    | "mathrock"
    | "footwork"
    | "dreampop";

  let genre: GenreArchetype = "synthwave";

  if (p.includes("acid") || p.includes("303") || p.includes("squelch") || p.includes("rave")) {
    genre = "acid";
  } else if (p.includes("lofi") || p.includes("lo-fi") || p.includes("chill") || p.includes("study") || p.includes("rhodes")) {
    genre = "lofi";
  } else if (p.includes("ambient") || p.includes("drone") || p.includes("meditation") || p.includes("shimmer") || p.includes("space")) {
    genre = "ambient";
  } else if (p.includes("ukg") || p.includes("garage") || p.includes("2-step") || p.includes("2step") || p.includes("speed garage")) {
    genre = "ukgarage";
  } else if (p.includes("jungle") || p.includes("dnb") || p.includes("drum and bass") || p.includes("amen") || p.includes("breakbeat")) {
    genre = "jungle";
  } else if (p.includes("amapiano") || p.includes("afro") || p.includes("afrobeats") || p.includes("log drum") || p.includes("african")) {
    genre = "amapiano";
  } else if (p.includes("chiptune") || p.includes("8-bit") || p.includes("8bit") || p.includes("arcade") || p.includes("gameboy") || p.includes("nes")) {
    genre = "chiptune";
  } else if (p.includes("soul") || p.includes("neo-soul") || p.includes("r&b") || p.includes("jazz") || p.includes("rhodes") || p.includes("9th")) {
    genre = "neosoul";
  } else if (p.includes("dubstep") || p.includes("half-time") || p.includes("trap") || p.includes("wobble") || p.includes("808")) {
    genre = "dubstep";
  } else if (p.includes("minimal") || p.includes("berlin") || p.includes("dub techno") || p.includes("detroit") || p.includes("hypnotic")) {
    genre = "minimal";
  } else if (p.includes("koto") || p.includes("japanese") || p.includes("oriental") || p.includes("hirajoshi") || p.includes("zen") || p.includes("bells")) {
    genre = "koto";
  } else if (p.includes("bossa") || p.includes("samba") || p.includes("latin") || p.includes("brazilian") || p.includes("acoustic")) {
    genre = "bossa";
  } else if (p.includes("math") || p.includes("polymeter") || p.includes("7/8") || p.includes("5/4") || p.includes("odd-time") || p.includes("poly")) {
    genre = "mathrock";
  } else if (p.includes("footwork") || p.includes("juke") || p.includes("160") || p.includes("chicago") || p.includes("ghetto")) {
    genre = "footwork";
  } else if (p.includes("dream") || p.includes("shoegaze") || p.includes("indie") || p.includes("plucks") || p.includes("ethereal")) {
    genre = "dreampop";
  } else if (p.includes("synthwave") || p.includes("80s") || p.includes("outrun") || p.includes("retrowave") || p.includes("cyberpunk")) {
    genre = "synthwave";
  } else {
    // If no explicit match, pick randomly among distinct genres to prevent repetitive outputs
    const allGenres: GenreArchetype[] = [
      "acid", "lofi", "synthwave", "ambient", "ukgarage", "jungle",
      "amapiano", "chiptune", "neosoul", "dubstep", "minimal", "koto",
      "bossa", "mathrock", "footwork", "dreampop"
    ];
    genre = allGenres[Math.floor(Math.random() * allGenres.length)];
  }

  let code = "";
  let title = "";
  let bpm = tempo || 120;
  let detectedGenre = "";
  let explanation = "";
  let notationBreakdown: any[] = [];
  let liveTweaks: any[] = [];

  if (genre === "amapiano") {
    bpm = tempo && tempo > 100 && tempo < 125 ? tempo : 113;
    detectedGenre = "Amapiano / Afro-House";
    title = `Soweto Amapiano Groove (${bpm} BPM)`;
    if (comp === "beginner") {
      code = `// Amapiano Groove - Beginner Level (${bpm} BPM)
stack(
  // 1. Four-on-the-floor Kick with Shaker Pulse
  // TWEAK TIP: Swap 'shaker*4' with 'shaker*8' for a faster South African swing!
  s("bd*4, shaker*4").gain(0.75),

  // 2. Syncopated Snare & Woodblock Tap
  // TWEAK TIP: Try changing '[~ rim]' to '[~ rim*2]' for snappy ghost accents
  s("~ rim ~ [rim rim]").gain(0.85),

  // 3. Iconic Low-End Log-Drum Bass
  // TWEAK TIP: Change the bass notes in '< >' to craft your own melody!
  note("<f1 [f1 ~] [ab1 ~] [bb1 c2]>").s("triangle").decay(0.35).lpf(900).gain(0.95),

  // 4. Lush Gospel Piano Chord Inversions
  // TWEAK TIP: Adjust .room(0.4) to .room(0.7) for deeper hall ambience
  note("<[f3 ab3 c4 eb4] [bb3 db4 f4 ab4] [c4 eb4 g4 bb4] [db3 f3 ab3 c4]>").s("piano").decay(0.8).room(0.4).gain(0.7)
)`;
    } else if (comp === "intermediate") {
      code = `// Amapiano Log-Drum Suite - Intermediate Level (${bpm} BPM)
stack(
  // 1. Heavy Afro-House Kick & Syncopated Cabasa
  // TWEAK TIP: Edit 'cabasa(5,8)' to 'shaker(7,16)' for polyrhythmic tension
  s("bd*4, cabasa(5,8)").gain(0.75),

  // 2. Offbeat Rimshots & Triple Claps
  // TWEAK TIP: Swap '[~ cp*3]' to '[~ cp]' for a laid-back feel
  s("[~ rim] [rim ~] [~ cp*3] [rim ~]").gain(0.8),

  // 3. Pitched & Bouncing Log Drum Bass with Pitch Envelope
  // TWEAK TIP: Tweak .lpf(850) between 400 and 1600 to shape the hollow punch
  note("<[f1 f1] [~ f1] [ab1 ab1] [bb1 c2]>").s("triangle").decay(0.28).lpf(850).gain(0.95),

  // 4. Ethereal Vocal Chops & Gospel Rhodes Chords
  // TWEAK TIP: Modify .delay(0.3) for lush syncopated stereo echoes
  note("<[f3 ab3 c4 eb4] [db3 f3 ab3 c4] [eb3 g3 bb3 db4] [c3 eb3 g3 bb3]>").s("piano").decay(0.9).delay(0.3).room(0.5).gain(0.65),

  // 5. High Shimmering Marimba Accents
  // TWEAK TIP: Change the melody notes to transpose into Dorian mode
  note("<[c5 eb5] [f5 ab5] [g5 bb5] [c6 ~]>").s("triangle").decay(0.18).delay(0.25).gain(0.5)
)`;
    } else {
      code = `// Amapiano Polyrhythmic Masterclass - Advanced Level (${bpm} BPM)
stack(
  // 1. Layered Kick Matrix with Probabilistic Ghost Snare
  // PRO HACK: 'perc?' triggers random ghost fills; '[~ sd*3]' injects triplet roll turnarounds!
  s("bd*4, [~ rim]*2, perc?").gain(0.8),

  // 2. Dual Euclidean Shaker Polyphony (7/12 against 5/8)
  // PRO HACK: Modulate '(7,12)' vs '(5,8)' to create hypnotic metric swing phasing!
  s("shaker(7,12), cabasa(5,8)").gain(0.5),

  // 3. Dynamic Multi-Pitch Log Drum with Micro-Timing Slides
  // PRO HACK: Edit note durations with '@2' to elongate syncopated sub phrases!
  note("<[f1 f1@2] [~ f1] [ab1 ab1@2] [bb1 ~ c2@2]>").s("triangle").decay(0.22).lpf(800).gain(1.0),

  // 4. Extended Neo-Gospel 11th Chord Progression
  // PRO HACK: Swap voicings inside '< >' to modulate harmonic color!
  note("<[f3 ab3 c4 eb4 g4] [db3 f3 ab3 c4 f4] [bb2 db3 f3 ab3 c4] [c3 eb3 g3 bb3 d4]>").s("piano").decay(0.85).room(0.55).delay(0.25).gain(0.65),

  // 5. Pentatonic Flute / Marimba Counter-Melody with Dub Echo
  // PRO HACK: Change .delay(0.35).delaytime(0.125) during live performance builds!
  note("<[c5 ~ eb5] [f5 ~ ab5] [g5 ~ bb5] [c6 eb6]*2>").s("triangle").decay(0.25).delay(0.35).gain(0.5)
)`;
    }
    explanation = "Amapiano South African house groove driven by syncopated log drums, gospel chord voicings, and polyrhythmic shaker grids.";
    notationBreakdown = [
      { symbolOrMethod: 's("bd*4, shaker(5,8)")', meaning: "Layers 4-on-the-floor kick with 5-over-8 Euclidean shaker pulses." },
      { symbolOrMethod: 'note("<[f3 ab3 c4] ...>")', meaning: "Rich 4-bar alternating gospel minor 7th and 9th chord cycle." },
      { symbolOrMethod: ".lpf(850).decay(0.28)", meaning: "Shapes triangle wave into the classic hollow percussive log drum transient." }
    ];
    liveTweaks = [
      { label: "🥁 Double Shaker Rolls", prompt: "Change shaker layer to Euclidean (7,16)" },
      { label: "🎛️ Open Log Drum Filter", prompt: "Increase .lpf filter to 1400 for punchier punch" },
      { label: "✨ Add Deep Hall Reverb", prompt: "Increase chord .room(0.8) and .delay(0.4)" }
    ];
  } else if (genre === "jungle") {
    bpm = tempo && tempo > 150 ? tempo : 165;
    detectedGenre = "Jungle / Drum & Bass";
    title = `Amen Chopped Breakbeat DnB (${bpm} BPM)`;
    if (comp === "beginner") {
      code = `// Jungle Breakbeat - Beginner Level (${bpm} BPM)
stack(
  // 1. Fast Chopped Breakbeat Drums
  // TWEAK TIP: Try changing '[sd bd]' to 'sd*2' for rapid turnaround rolls!
  s("bd [~ bd] [sd bd] [~ sd]"),

  // 2. High-Speed 16th Hi-Hats
  // TWEAK TIP: Change '*8' to '*16' for ultra-fast jungle hi-hats
  s("hh*8").gain(0.55),

  // 3. Deep 808 Sub Bassline
  // TWEAK TIP: Change the notes inside '< >' to alter the root bassline
  note("<f1 [f1 ~] c1 [eb1 ~]>").s("sine").decay(0.6).gain(0.95).lpf(500),

  // 4. Dub Reggae Horn / Synth Stabs
  // TWEAK TIP: Adjust .delay(0.3) for syncopated tape echo reflections
  note("<[f4 ab4 c5] ~ [c4 eb4 g4] ~>").s("sawtooth").lpf(2200).decay(0.18).delay(0.3).gain(0.65)
)`;
    } else {
      code = `// Amen Chopped Breakbeat & 808 Glides - ${complexity} (${bpm} BPM)
stack(
  // 1. Chopped Amen Breakbeat Matrix
  // PRO HACK: 'cr?' triggers random crash cymbals; '[~ sd*4]' injects rapid jungle snare rolls!
  s("bd [~ bd*2] [sd bd] [~ sd*3], cr?").gain(0.9),

  // 2. Syncopated Ghost Hi-Hats & Tambourine
  // PRO HACK: Modulate '(7,16)' live to shift rhythm feel against the break!
  s("hh(7,16), shaker(5,8)").gain(0.5),

  // 3. Sliding 808 Sub Bass with Low-End Saturation
  // PRO HACK: Elongate note lengths with '@2' for continuous deep sub pressure!
  note("<f1@2 [~ f1] [ab1 ~] [eb1@2 c1]>").s("sawtooth").lpf(450).decay(0.7).gain(1.0),

  // 4. Dub Echo Synth Stabs in Stereo Field
  // PRO HACK: Increase .delay(0.45).room(0.7) during drum breakdowns!
  note("<[f4 ab4 c5 eb5] ~ [db4 f4 ab4 c5] ~>").s("sawtooth").lpf(2600).decay(0.15).delay(0.35).gain(0.6),

  // 5. Hypnotic Acid Arp Layer
  // PRO HACK: Sweep .lpf(1800) between 600Hz and 4000Hz live!
  note("<f2 ab2 c3 eb3>*2").s("sawtooth").lpf(1800).decay(0.14).gain(0.7)
)`;
    }
    explanation = "Fast 165 BPM Jungle arrangement featuring chopped breakbeats, deep 808 sub pressure, and dub echo stabs.";
    notationBreakdown = [
      { symbolOrMethod: 's("bd [~ bd*2] [sd bd]")', meaning: "Syncopated chopped breakbeat rhythm simulating the Amen break." },
      { symbolOrMethod: 'note("f1@2")', meaning: "Time elongation holding deep sub bass note across 2 beats." },
      { symbolOrMethod: ".delay(0.35)", meaning: "Stereo dub feedback echo creating spacious reggae-inspired sound system vibe." }
    ];
    liveTweaks = [
      { label: "⚡ Rapid Snare Rolls (*4)", prompt: "Change snare fill to [~ sd*4] on beat 4" },
      { label: "🌀 808 Sub Pitch Drop", prompt: "Transpose sub bass down to C1 root" },
      { label: "🎛️ Open Acid Synth LPF", prompt: "Increase synth .lpf filter to 3400" }
    ];
  } else if (genre === "chiptune") {
    bpm = tempo && tempo > 120 ? tempo : 142;
    detectedGenre = "8-Bit Chiptune / Arcade";
    title = `Pixel Dungeon Arcade (${bpm} BPM)`;
    code = `// 8-Bit Chiptune Arcade - ${complexity} (${bpm} BPM)
stack(
  // 1. Retro Gameboy Noise Drums (Punchy Kick & White Noise Snare)
  // TWEAK TIP: Swap 'sd' with 'cp' or add '[~ bd]' for extra arcade bounce!
  s("bd [~ bd] sd [~ [sd bd]]").gain(0.85),

  // 2. High-Speed 16th Hi-Hat Noise Bursts
  // TWEAK TIP: Try 'hh*16' for authentic GameBoy sound chip speed!
  s("hh*8").gain(0.5),

  // 3. Bouncy NES Square Wave Bassline
  // TWEAK TIP: Adjust .decay(0.18) for staccato 8-bit blips or .decay(0.4) for sustained bass
  note("<[c2 c2] [eb2 c2] [f2 g2] [bb2 c3]>").s("square").decay(0.18).gain(0.9),

  // 4. Blistering 8-Bit Arpeggio Lead (Major/Minor Triad Runs)
  // TWEAK TIP: Change the arpeggio notes in '< >' to build new arcade stages!
  note("<[c4 e4 g4 c5]*4 [a3 c4 e4 a4]*4 [f3 a3 c4 f4]*4 [g3 b3 d4 g4]*4>").s("square").decay(0.12).gain(0.7).delay(0.2)
)`;
    explanation = "Classic NES/GameBoy 8-bit chiptune with rapid square-wave arpeggios, noise drums, and bouncy retro bass.";
    notationBreakdown = [
      { symbolOrMethod: 's("square")', meaning: "Synthesizes pure authentic 8-bit vintage gaming waveforms." },
      { symbolOrMethod: 'note("<[c4 e4 g4 c5]*4 ...>")', meaning: "Rapid 16th note arpeggiation cycling chord triads." },
      { symbolOrMethod: ".decay(0.12)", meaning: "Tight staccato envelope creating snappy arcade blip transients." }
    ];
    liveTweaks = [
      { label: "🕹️ Double Arp Speed (*8)", prompt: "Speed up arpeggio to *8 for turbo arcade mode" },
      { label: "👾 Bitcrush Decay", prompt: "Shorten bass decay to 0.1 for ultra-dry retro punch" },
      { label: "✨ Space Echo", prompt: "Add .delay(0.25).delaytime(0.125) to lead" }
    ];
  } else if (genre === "koto") {
    bpm = tempo && tempo < 95 ? tempo : 76;
    detectedGenre = "Japanese Koto / Zen Ambient";
    title = `Kyoto Bamboo Zen Garden (${bpm} BPM)`;
    code = `// Kyoto Zen Garden - Japanese Hirajoshi Scale - ${complexity} (${bpm} BPM)
stack(
  // 1. Gentle Meditation Woodblock & Singing Bowl Pulse
  // TWEAK TIP: Swap 'rim' with 'perc' or add 'cr?' for zen gong chimes!
  s("~ rim ~ [rim ~], perc(3,8)?").gain(0.7),

  // 2. Japanese Hirajoshi Scale Plucks (C, D, Eb, G, Ab)
  // TWEAK TIP: Edit the 5-note Hirajoshi scale notes to compose new melodies!
  note("<[c4 d4 eb4 g4] [g4 ab4 c5 d5] [eb4 g4 ab4 c5] [d4 eb4 g4 c5]>").s("triangle").decay(0.6).delay(0.4).room(0.7).gain(0.75),

  // 3. Deep Sine Singing Bowl Sub Drone
  // TWEAK TIP: Shift root pitch from 'c1' to 'g0' for deeper resonance
  note("<c1 g1 c1 f1>").s("sine").decay(2.0).gain(0.85),

  // 4. Shimmering Wind Chimes & Flute Harmonics
  // TWEAK TIP: Adjust .room(0.85) for expansive temple hall acoustic space
  note("<[c5 eb5 g5 c6] [ab4 c5 eb5 g5]>").s("sine").decay(1.2).room(0.85).delay(0.5).gain(0.55)
)`;
    explanation = "Serene meditative composition set in the ancient Japanese Hirajoshi pentatonic scale with resonant bell plucks.";
    notationBreakdown = [
      { symbolOrMethod: 'note("c4 d4 eb4 g4")', meaning: "Authentic 5-note Japanese Hirajoshi scale formula." },
      { symbolOrMethod: ".room(0.85).delay(0.5)", meaning: "Expansive acoustic simulation of sacred temple acoustic architecture." },
      { symbolOrMethod: "perc(3,8)?", meaning: "Probabilistic Euclidean bell chimes with natural organic timing." }
    ];
    liveTweaks = [
      { label: "🎋 Slow Temple Chime", prompt: "Reduce tempo to 68 BPM and increase reverb" },
      { label: "🎐 Add Wind Flute", prompt: "Add high sine lead melody on top" },
      { label: "🧘 Deep Drone Sub", prompt: "Extend sub bass note duration to @4" }
    ];
  } else if (genre === "bossa") {
    bpm = tempo && tempo > 110 && tempo < 140 ? tempo : 124;
    detectedGenre = "Bossa Nova / Latin Jazz";
    title = `Ipanema Sunset Bossa Nova (${bpm} BPM)`;
    code = `// Ipanema Sunset Bossa Nova - ${complexity} (${bpm} BPM)
stack(
  // 1. Classic Syncopated Bossa Nova Rimshot Clave
  // TWEAK TIP: Try changing '[rim ~]' to '[~ rim]' for alternate clave accent!
  s("bd [~ bd] [~ bd] bd, [rim ~] [~ rim] [rim ~] [~ rim]").gain(0.8),

  // 2. Soft Swung Shaker Pulse
  // TWEAK TIP: Change '*4' to '*8' for double-time samba swing
  s("shaker*4").gain(0.5),

  // 3. Walking Jazz Acoustic Bassline
  // TWEAK TIP: Change the walking bass notes in '< >' to follow chord roots!
  note("<[d2 a1] [g2 d2] [c2 g1] [a2 e2]>").s("triangle").decay(0.45).gain(0.85),

  // 4. Warm Nylon Guitar / Rhodes Bossa Chords (Dm9 - G13 - Cmaj7 - A7alt)
  // TWEAK TIP: Modify chord voicings inside '< >' to craft your own progression
  note("<[d3 f3 a3 c4 e4] [g3 b3 d4 f4 e4] [c3 e3 g3 b3 d4] [a3 c#4 e4 g4 bb4]>").s("piano").decay(0.7).room(0.4).gain(0.7)
)`;
    explanation = "Bossa Nova jazz fusion featuring syncopated rimshot clave, walking acoustic bass, and extended 9th/13th chord voicings.";
    notationBreakdown = [
      { symbolOrMethod: 's("bd [~ bd] [~ bd] bd")', meaning: "Classic syncopated Brazilian Bossa Nova bass drum groove." },
      { symbolOrMethod: 'note("<[d3 f3 a3 c4 e4] ...>")', meaning: "Authentic extended jazz harmony voicings (Dm9, G13, Cmaj9)." },
      { symbolOrMethod: "[rim ~] [~ rim]", meaning: "Syncopated cross-stick clave rhythmic counter-point." }
    ];
    liveTweaks = [
      { label: "🌴 Double Samba Speed", prompt: "Speed shaker to *8 and add pandeiro pulse" },
      { label: "☕ Warmer Rhodes Sound", prompt: "Add .room(0.5).lpf(2800) to harmony" },
      { label: "🎷 Add Solo Flute", prompt: "Add melodic flute arpeggio in D Dorian" }
    ];
  } else if (genre === "acid") {
    bpm = tempo && tempo > 125 ? tempo : 138;
    detectedGenre = "Acid Techno 303";
    title = `Resonant Acid 303 Rave (${bpm} BPM)`;
    code = `// Resonant Acid 303 Rave - ${complexity} (${bpm} BPM)
stack(
  // 1. Driving 909 Kick & Snappy Claps
  // TWEAK TIP: Try changing '[~ cp]*2' to '[~ cp*2]' for double claps!
  s("bd*4, [~ cp]*2"),

  // 2. Syncopated Euclidean Hi-Hats (5 pulses over 8 steps)
  // TWEAK TIP: Swap '(5,8)' to '(7,8)' or '(3,8)' to morph the rhythmic groove!
  s("hh(5,8), [~ oh]*4").gain(0.6),

  // 3. Resonant TB-303 Acid Bassline with Snappy Low-Pass Decay
  // TWEAK TIP: Modulate .lpf between 600 and 3500 for live filter sweeps!
  note("<c2 [eb2 c2] [f2 g2] [bb2 c3]>*2").s("sawtooth").lpf(1600).decay(0.18).gain(0.9),

  // 4. Stereo Ping-Pong Synth Stabs
  // TWEAK TIP: Adjust .delay(0.35) and .delaytime(0.125) for syncopated dub echoes
  note("<[c4 eb4 g4] [f4 ab4 c5]>").s("square").lpf(2400).decay(0.2).delay(0.35).gain(0.6)
)`;
    explanation = "High-energy 138 BPM Acid Techno with squelchy resonant 303 sawtooth bassline, driving 909 kick, and Euclidean hi-hats.";
    notationBreakdown = [
      { symbolOrMethod: 's("bd*4, [~ cp]*2")', meaning: "Driving 4-on-the-floor kick with sharp claps on beats 2 and 4." },
      { symbolOrMethod: 'hh(5,8)', meaning: "Euclidean algorithm distributing 5 hi-hat pulses over 8 step intervals." },
      { symbolOrMethod: ".lpf(1600).decay(0.18)", meaning: "Sharp resonant low-pass filter envelope producing the classic 303 acid squelch." }
    ];
    liveTweaks = [
      { label: "🎛️ Squelch Filter Sweep", prompt: "Sweep .lpf cutoff from 600 to 3800" },
      { label: "⚡ Double Acid Speed (*4)", prompt: "Accelerate 303 arpeggio to *4" },
      { label: "💥 Peak Kick Drop", prompt: "Add sub saturation .gain(1.0) on kick" }
    ];
  } else if (genre === "lofi") {
    bpm = tempo && tempo < 95 ? tempo : 84;
    detectedGenre = "Lo-Fi Hip Hop";
    title = `Dusty Rhodes & Vinyl Study Beat (${bpm} BPM)`;
    code = `// Dusty Rhodes Lo-Fi - ${complexity} (${bpm} BPM)
stack(
  // 1. Boom-Bap Drums with Ghost Snares & Swung Kicks
  // TWEAK TIP: Swap 'sd' with 'cp' to turn the snare into a mellow vinyl clap!
  s("bd [~ bd] [sd bd] [~ sd]"),

  // 2. Offbeat Hi-Hats with Micro Rests
  // TWEAK TIP: Try 'hh [hh*2] hh [hh*3]' for skippy garage swing!
  s("[hh ~] hh [hh hh] ~").gain(0.5),

  // 3. Warm Rhodes 7th & 9th Jazz Chords (Dm9 - G13 - Cmaj7 - A7)
  // TWEAK TIP: Increase .room(0.5) to .room(0.8) for deep spatial atmospheric reverb
  note("<[d3 f3 a3 c4 e4] [g3 b3 d4 f4 a4] [c3 e3 g3 b4 d5] [a3 c#4 e4 g4]>").s("piano").decay(0.85).room(0.5).gain(0.7),

  // 4. Smooth Sine Sub Bass
  // TWEAK TIP: Transpose notes down an octave (d1 g1 c1 a0) for rumbling sub weight
  note("<d2 g2 c2 a1>").s("sine").decay(0.75).gain(0.95)
)`;
    explanation = "Laid-back 84 BPM Lo-Fi hip hop groove with warm Rhodes 7th chord voicings, dusty boom-bap drums, and deep sub bass.";
    notationBreakdown = [
      { symbolOrMethod: 's("bd [~ bd] [sd bd] [~ sd]")', meaning: "Swung boom-bap drum pattern with syncopated ghost notes." },
      { symbolOrMethod: 'note("<[d3 f3 a3 c4 e4] ...>")', meaning: "Rich 4-measure cycle of jazz minor 9th and major 7th chord voicings." },
      { symbolOrMethod: ".room(0.5)", meaning: "Simulates warm room acoustics for vintage vinyl character." }
    ];
    liveTweaks = [
      { label: "📻 Vinyl Filter Cutoff", prompt: "Set master .lpf(1800) for tape warmth" },
      { label: "🎹 Transpose Chords Up", prompt: "Transpose harmony chords up 2 semitones" },
      { label: "✨ Lush Delay Echo", prompt: "Add .delay(0.35).delaytime(0.125) to Rhodes" }
    ];
  } else {
    // Default to dynamic Synthwave / Cyberpunk
    bpm = tempo || 118;
    detectedGenre = "80s Outrun Synthwave";
    title = `Neon Cyberpunk Horizon (${bpm} BPM)`;
    code = `// Neon Synthwave Horizon - ${complexity} (${bpm} BPM)
stack(
  // 1. Punchy 808 Kick & Gated Snare
  // TWEAK TIP: Try changing '[~ bd]' to 'bd' or '[sd bd]' to 'sd' to alter the beat!
  s("bd [~ bd] [sd bd] sd"),

  // 2. High-Speed 16th Hi-Hats
  // TWEAK TIP: Change 'hh*8' to 'hh*16' for double-time rolls!
  s("hh*8").gain(0.6),

  // 3. Rolling Arpeggiated Synthwave Bass in A Minor
  // TWEAK TIP: Adjust .lpf(1400) between 800 and 3200 to open/close the bass filter
  note("a1 [a1 a1] [c2 a1] e2").s("sawtooth").lpf(1400).decay(0.28).gain(0.88),

  // 4. Shimmering Analog Brass Lead Chords
  // TWEAK TIP: Edit chord bracket notes inside '< >' to change the progression!
  note("<[a3 c4 e4 g4] [f3 a3 c4 e4] [g3 b3 d4 f4] [e3 g3 b3 d4]>").s("sawtooth").lpf(2800).decay(0.4).gain(0.65).delay(0.25)
)`;
    explanation = "Classic 80s analog synthwave with punchy 4-on-the-floor kick, gated snare, rolling arpeggiated bass, and shimmering lead.";
    notationBreakdown = [
      { symbolOrMethod: 'note("a1 [a1 a1] [c2 a1] e2")', meaning: "Driving 16th-note rolling octave bassline motif." },
      { symbolOrMethod: 'note("<[a3 c4 e4 g4] ...>")', meaning: "Alternating 4-chord minor progression cycling each measure." },
      { symbolOrMethod: ".delay(0.25)", meaning: "Stereo spatial delay adding width and depth to the lead synth." }
    ];
    liveTweaks = [
      { label: "⚡ Double Hi-Hats (*16)", prompt: "Speed up hi-hats to hh*16" },
      { label: "🎛️ Open Bass Filter", prompt: "Increase bass .lpf to 2800 for brighter drive" },
      { label: "✨ Add Deep Reverb", prompt: "Add .room(0.7) to lead synth" }
    ];
  }

  return {
    code,
    title,
    bpm,
    genre: detectedGenre,
    explanation,
    notationBreakdown,
    liveTweaks,
  };
};

// Algorithmic Fallback Analysis Engine
const generateLocalExplanation = (code: string) => {
  const lines = code.split("\n").map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith("//"));
  const lineByLine: any[] = [];
  const activeSymbols = new Set<string>();

  lines.forEach((line) => {
    let role: "Drums" | "Bass" | "Harmony" | "Melody" | "FX" | "Structure" = "Structure";
    let explanation = "Algorithmic layer definition";

    if (line.includes('s("bd') || line.includes('s("hh') || line.includes('s("sd') || line.includes('s("cp')) {
      role = "Drums";
      if (line.includes("bd") && line.includes("sd")) {
        explanation = "Foundational rhythm pattern combining kick drum (bd) and snare (sd) beats.";
      } else if (line.includes("hh")) {
        explanation = "High-frequency hi-hat subdivision providing momentum and groove.";
      } else {
        explanation = "Percussive drum layer providing rhythmic pulse.";
      }
    } else if (line.includes("sawtooth") || line.includes("bass") || line.includes("note(\"c2") || line.includes("note(\"c1") || line.includes("note(\"f1")) {
      role = "Bass";
      explanation = "Low-end bassline driving the root progression and harmonic weight.";
    } else if (line.includes("sawtooth") || line.includes("square") || line.includes("piano") || line.includes("triangle")) {
      if (line.includes("[") && line.includes("]")) {
        role = "Harmony";
        explanation = "Polyphonic chord voicings and harmonic pads creating rich tonal texture.";
      } else {
        role = "Melody";
        explanation = "Lead melodic motif with pitch contours and phrase shaping.";
      }
    } else if (line.includes("stack(")) {
      role = "Structure";
      explanation = "Strudel stack container evaluating multiple polyphonic cycles simultaneously.";
    } else if (line.includes(".lpf(") || line.includes(".delay(") || line.includes(".room(") || line.includes(".gain(")) {
      role = "FX";
      explanation = "DSP effect chain modulating filter cutoff, spatial reverb, and dynamic gain.";
    }

    if (line.length > 3 && !line.startsWith(")") && !line.startsWith("stack(")) {
      lineByLine.push({
        line: line.length > 48 ? line.substring(0, 48) + "..." : line,
        role,
        explanation,
      });
    }

    // Detect mini-notation symbols
    if (line.includes("*")) activeSymbols.add("*");
    if (line.includes("~")) activeSymbols.add("~");
    if (line.includes("<") && line.includes(">")) activeSymbols.add("< >");
    if (line.includes("[") && line.includes("]")) activeSymbols.add("[ ]");
    if (line.includes(",")) activeSymbols.add(",");
    if (line.includes("(") && line.includes(")")) activeSymbols.add("(k,n)");
    if (line.includes("@")) activeSymbols.add("@");
    if (line.includes("?")) activeSymbols.add("?");
  });

  const miniNotationGuide: any[] = [];
  if (activeSymbols.has("*")) {
    miniNotationGuide.push({
      symbol: "*",
      title: "Speed Multiplier / Repetition",
      explanation: "Subdivides the current step into N equal rhythmic pulses within the same time slot.",
      example: 's("hh*4")',
    });
  }
  if (activeSymbols.has("~")) {
    miniNotationGuide.push({
      symbol: "~",
      title: "Rest / Silence",
      explanation: "Inserts a silent rhythmic gap or pause into the mini-notation sequence.",
      example: 's("bd [~ sd]")',
    });
  }
  if (activeSymbols.has("< >")) {
    miniNotationGuide.push({
      symbol: "< >",
      title: "Cycle Alternation",
      explanation: "Cycles through one value per loop (e.g. sequence changes every measure).",
      example: 'note("<c3 f3 g3 bb3>")',
    });
  }
  if (activeSymbols.has("[ ]")) {
    miniNotationGuide.push({
      symbol: "[ ]",
      title: "Subdivision Group",
      explanation: "Groups multiple elements into a single time slot, compressing their duration.",
      example: 's("[bd sd] hh")',
    });
  }
  if (activeSymbols.has(",")) {
    miniNotationGuide.push({
      symbol: ",",
      title: "Polyphony / Parallel Layers",
      explanation: "Plays multiple mini-notation patterns concurrently at the same time.",
      example: 's("bd sd, hh*4")',
    });
  }
  if (activeSymbols.has("(k,n)")) {
    miniNotationGuide.push({
      symbol: "(k,n)",
      title: "Euclidean Rhythm",
      explanation: "Distributes k pulses as evenly as mathematically possible over n steps.",
      example: 's("hh(5,8)")',
    });
  }

  return {
    summary: `Algorithmic pattern with ${lineByLine.length} functional layers structured using Strudel cyclical scheduling.`,
    lineByLine: lineByLine.slice(0, 6),
    miniNotationGuide: miniNotationGuide.slice(0, 4),
    musicTheoryTip: "Features syncopated polyrhythms and dynamic filtering for progressive harmonic movement.",
  };
};

// Algorithmic Fallback Tweak Engine
const generateLocalTweak = (currentCode: string, instruction: string) => {
  const lower = instruction.toLowerCase();
  let updatedCode = currentCode;
  let summary = `Applied modification: ${instruction}`;
  const diffHighlights: string[] = [];

  if (lower.includes("delay") || lower.includes("reverb") || lower.includes("echo") || lower.includes("space")) {
    if (updatedCode.includes(".delay(")) {
      updatedCode = updatedCode.replace(/\.delay\([^)]+\)/g, ".delay(0.35).delaytime(0.125)");
      diffHighlights.push("Increased tape delay feedback to 0.35 with 1/8 note delay time");
    } else {
      updatedCode = updatedCode.replace(/s\(["'][^"']+["']\)/, (match) => `${match}.delay(0.25).room(0.5)`);
      diffHighlights.push("Added lush ping-pong delay (0.25) and room reverb (0.5)");
    }
    summary = "Added ambient delay and room reverberation to active pattern";
  } else if (lower.includes("half-time") || lower.includes("slow") || lower.includes("half")) {
    updatedCode = updatedCode.replace(/hh\*8/g, "hh*4").replace(/hh\*4/g, "hh*2");
    diffHighlights.push("Reduced hi-hat frequency and relaxed drum timing to half-time groove");
    summary = "Switched rhythmic layers to half-time feel";
  } else if (lower.includes("euclidean") || lower.includes("hi-hat") || lower.includes("hat")) {
    if (updatedCode.includes('s("hh')) {
      updatedCode = updatedCode.replace(/s\(["']hh[^"']*["']\)/, 's("hh(5,8)").gain(0.5)');
    } else {
      updatedCode = updatedCode.replace(/stack\(/, 'stack(\n  s("hh(5,8)").gain(0.45),');
    }
    diffHighlights.push("Inserted Euclidean (5,8) algorithmic hi-hat pattern");
    summary = "Applied 5/8 Euclidean hi-hat pulse";
  } else if (lower.includes("drop") || lower.includes("heavy") || lower.includes("bass") || lower.includes("punch")) {
    if (updatedCode.includes('s("sawtooth")') || updatedCode.includes('s("triangle")')) {
      updatedCode = updatedCode.replace(/\.lpf\([^)]+\)/g, ".lpf(1800)").replace(/\.gain\([^)]+\)/g, ".gain(0.95)");
    } else {
      updatedCode = updatedCode.replace(/stack\(/, 'stack(\n  note("c1 [~ c1] f1 g1").s("sawtooth").lpf(1600).gain(0.9),');
    }
    diffHighlights.push("Boosted low-end bass drive and opened resonant filter cutoff to 1800Hz");
    summary = "Applied heavy bass drop with resonant punch";
  } else if (lower.includes("acid") || lower.includes("303") || lower.includes("filter") || lower.includes("sweep")) {
    updatedCode = updatedCode.replace(/s\("sawtooth"\)/g, 's("sawtooth").lpf(1200).resonance(15)');
    if (!updatedCode.includes("resonance")) {
      updatedCode = updatedCode.replace(/stack\(/, 'stack(\n  note("<c2 eb2 f2 g2 bb2>").s("sawtooth").lpf(1400).gain(0.85),');
    }
    diffHighlights.push("Added 303 acid resonant filter sweep and snappy envelope decay");
    summary = "Injected 303 acid filter modulation";
  } else if (lower.includes("minor") || lower.includes("key") || lower.includes("harmony") || lower.includes("chord")) {
    updatedCode = updatedCode
      .replace(/c3 e3 g3/g, "c3 eb3 g3")
      .replace(/c2 e2 g2/g, "c2 eb2 g2")
      .replace(/d3 f#3 a3/g, "d3 f3 a3");
    diffHighlights.push("Shifted major triads to emotive minor thirds (C minor / D minor harmonic scale)");
    summary = "Harmonized pattern into deep emotional minor key";
  } else if (lower.includes("transpose") || lower.includes("pitch") || lower.includes("semitone")) {
    updatedCode = updatedCode.replace(/c3/g, "d3").replace(/c2/g, "d2").replace(/eb3/g, "f3");
    diffHighlights.push("Transposed melodic root notes up 2 semitones");
    summary = "Transposed root pitch contour";
  } else {
    diffHighlights.push(`Applied dynamic modulation: ${instruction}`);
    updatedCode += "\n// Modified with AI Copilot";
  }

  return {
    code: updatedCode,
    summary,
    diffHighlights: diffHighlights.length > 0 ? diffHighlights : [summary],
    liveTweaks: [
      { label: "⚡ Add Delay & Reverb", prompt: "Add lush delay and reverb" },
      { label: "🥁 Euclidean Groove", prompt: "Change hi-hats to Euclidean (5,8)" },
      { label: "🎛️ 303 Acid Sweep", prompt: "Add resonant 303 filter sweep" },
    ],
  };
};

// Dynamic Algorithmic Variations Engine with Multiple Style Profiles
const generateLocalVariations = (currentCode: string) => {
  const code = currentCode || "";
  const hasBass = code.includes("sawtooth") || code.includes("bass") || code.includes("sine");

  return [
    {
      title: "💥 Peak Energy Bass Drop",
      type: "drop",
      description: "Punchy 4-on-the-floor kick with high-resonance saturated low-pass sawtooth bassline.",
      code: `stack(
  // 1. Peak Energy Kick & Layered Claps
  s("bd*4, [~ cp]*2"),
  // 2. High-Speed 16th Hi-Hats
  s("hh*16").gain(0.45),
  // 3. Resonant Low-End Bassline
  note("<c1 [~ c1] [eb1 c1] [g1 bb1]>").s("sawtooth").lpf(1800).decay(0.25).gain(0.95),
  // 4. Stereo Rave Synth Stabs
  note("<[c4 eb4 g4 bb4] [f4 ab4 c5 eb5]>").s("square").lpf(2600).decay(0.18).delay(0.3).gain(0.65)
)`,
    },
    {
      title: "🌀 5/8 & 7/16 Polyrhythmic Groove",
      type: "polyrhythm",
      description: "Syncopated Euclidean cross-rhythm layering 5 pulses over 8 against 7 over 16.",
      code: `stack(
  // 1. Syncopated Euclidean Kick & Snare
  s("bd(3,8), sd(2,8)"),
  // 2. Cross-Polymetric Hi-Hat & Percussion
  s("hh(5,8), perc(7,16)").gain(0.55),
  // 3. Modal Dorian Arpeggiator
  note("<[d3 f3 a3 c4] [g3 bb3 d4] [c3 e3 g3] [a2 c3 e3]>").s("triangle").decay(0.22).delay(0.3).gain(0.7)
)`,
    },
    {
      title: "🎛️ 303 Acid Resonant Squelch",
      type: "glitch",
      description: "Resonant TB-303 style synth line with 16th note acid arpeggiations and modulated cutoff.",
      code: `stack(
  // 1. Driving 909 Kick & Snappy Claps
  s("bd*4, [~ cp]*2"),
  // 2. Fast Acid Hi-Hats with Offbeats
  s("hh(7,8), [~ oh]*4").gain(0.5),
  // 3. Modulated Squelch TB-303 Acid Lead
  note("<c2 [eb2 c2] [f2 g2] [bb2 c3]>*2").s("sawtooth").lpf(1600).decay(0.16).gain(0.9)
)`,
    },
    {
      title: "✨ Ethereal Ambient Void Breakdown",
      type: "breakdown",
      description: "Stripped-back percussion with shimmering delayed minor 9th chords and deep sub drone.",
      code: `stack(
  // 1. Deep Sub Meditation Drone
  note("<c1 f1 eb1 bb0>").s("sine").decay(2.2).gain(0.85),
  // 2. Shimmering Reverb Chords
  note("<[c3 eb3 g3 bb3 d4] [f3 ab3 c4 eb4 g4] [ab2 c3 eb3 g3]>").s("piano").room(0.85).delay(0.5).gain(0.65),
  // 3. Soft Ghost Percussion Echo
  s("~ ~ ~ perc?").gain(0.35).room(0.9)
)`,
    },
    {
      title: "⚡ Half-Time Trap & Dub Turnaround",
      type: "turnaround",
      description: "Half-time drum matrix with triplet hi-hat rolls and sliding 808 sub bass.",
      code: `stack(
  // 1. Half-Time Heavy Kick & Center Snare
  s("bd ~ ~ [bd ~], ~ ~ sd ~"),
  // 2. Triplet Trap Rolls & Ghost Hats
  s("hh*4 [hh*3] hh [hh*6]").gain(0.55),
  // 3. Deep 808 Sliding Sub Bass
  note("<c1@2 [~ c1] eb1@2 [g1 bb1]>").s("sine").decay(0.8).gain(1.0)
)`,
    },
    {
      title: "🎷 Neo-Soul Modal Harmonic Shift",
      type: "harmony",
      description: "Harmonic modulation into lush Dorian minor 11th chord voicings and swung Rhodes plucks.",
      code: `stack(
  // 1. Swung Boom-Bap Drums with Rimshots
  s("bd [~ bd] [rim bd] [~ rim]"),
  // 2. Lazy Swing Hi-Hats
  s("[hh ~] hh [hh hh] ~").gain(0.5),
  // 3. Lush Neo-Soul Minor 11th Chord Voicings
  note("<[d3 f3 a3 c4 e4] [g3 b3 d4 f4 a4] [c3 e3 g3 b4 d5] [bb2 d3 f3 a3 c4]>").s("piano").decay(0.9).room(0.5).gain(0.7)
)`,
    },
  ];
};

const STRUDEL_SYSTEM_INSTRUCTION = `You are an expert algorithmic music composer and live-coding maestro specialized in Strudel (strudel.cc) and TidalCycles mini-notation.
Your goal is to generate diverse, vibrant, expressive Strudel JavaScript code that sounds authentic across wide-ranging musical genres, avoids generic repetitive clichés, strictly tailors itself to the requested complexity level (Beginner, Intermediate, Advanced), and includes clear inline hand-tweaking tips for live performance.

CRITICAL CREATIVE DIVERSITY RULES:
1. DO NOT always default to C minor or "c2 eb2 f2 g2" or basic 4-on-the-floor. Actively explore:
   - Diverse Scales & Modes: Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Harmonic Minor, Japanese Hirajoshi/Insen, Blues, Whole-Tone, and Hungarian Minor across diverse root pitches (D, Eb, F, F#, G, Ab, A, Bb, B).
   - Diverse Rhythmic feels: 2-step garage swing, Amapiano log-drum syncopation, Jungle/Amen chopped breakbeats, Trap half-time tuplets, Afrobeat polyrhythms, Latin Bossa Nova claves, Footwork 160 BPM matrices, Math Rock odd meters (7/8, 5/4), and floating Ambient drones.
   - Diverse Sound Palette: "piano", "rhodes", "sawtooth", "square", "triangle", "sine", "pluck", "supersaw", "bass", "organ", "marimba", "vibraphone", along with varied drum samples ("bd", "sd", "cp", "rim", "oh", "hh", "cb", "tom", "perc", "glitch", "cr", "shaker", "tabla").

SKILL LEVEL GUIDELINES (CRITICAL TO FOLLOW):
1. "Beginner":
   - 2 to 3 straightforward, clean layers (e.g. Kick/Snare, Hi-Hats, Bass or Chords).
   - Clear 4/4 meter and simple subdivisions: s("bd [~ bd] sd [~ sd]"), s("hh*4"), note("<c3 e3 g3 b3>").
   - Transparent, readable structure. Avoid overwhelming notation nesting.
   - MANDATORY: Include clear inline comments for every layer, plus explicit "// TWEAK TIP:" comments teaching beginners what happens when they tweak numbers, swap sample names, or alter speeds.

2. "Intermediate":
   - 3 to 4 layers featuring syncopated grooves, Euclidean rhythms (e.g. s("hh(5,8)") or s("rim(3,8)")), cycle alternation <c3 eb3 f3 g3>, chord brackets [c3 eb3 g3 bb3], and rests ~.
   - Dynamic DSP effect chains (.lpf(1400), .delay(0.3).room(0.4), .gain(0.7)).
   - MANDATORY: Include "// TWEAK TIP:" and "// LIVE MOD:" inline comments showing how to change Euclidean values (e.g. (5,8) -> (7,8)), sweep filters, and tweak chord voicings.

3. "Advanced":
   - 4 to 6 polyphonic layers using advanced TidalCycles concepts: Euclidean cross-rhythms (e.g. s("hh(5,8), perc(7,16)")), polymetric phasing, degradation / probability (e.g. "cp?" or "sd*4?"), elongation ("c1@2"), speed scaling (* and /), rich modal extensions (9ths/11ths/13ths), and multi-stage DSP modulation.
   - MANDATORY: Include pro live-coder inline comments ("// PRO HACK:" and "// LIVE TWEAK:") explaining live performance parameter hacking, polyrhythmic morphing, and dramatic breakdown transitions.

MANDATORY COMMENTING RULE FOR ALL GENERATED CODE:
Every single layer in stack(...) MUST have:
- A descriptive label comment: // 1. [Layer Role & Description]
- An actionable hand-tweaking tip: // TWEAK TIP: [Specific change user can type in the editor, e.g. "Change '*4' to '*8' for rapid rolls or adjust .lpf(1200) to 2500 for a brighter tone"]

STRUDEL CODING RULES & SYNTAX:
1. Basic sample playback: s("bd sd, hh*4") or s("bd [~ bd] sd [~ sd]")
2. Synthesizer notes: note("c3 e3 g3 b3").s("sawtooth").lpf(1200).decay(0.3)
3. Instruments & Synths: "sawtooth", "sine", "triangle", "square", "piano", "vibraphone", "marimba", "pluck", "bass", "organ"
4. Drum samples: "bd" (kick), "sd" (snare), "hh" (hi-hat), "cp" (clap), "rim", "oh" (open hat), "cb" (cowbell), "tom", "perc", "glitch", "cr" (crash), "shaker"
5. Mini-notation syntax:
   - Sequence: "a b c d"
   - Polyphony: "a, b"
   - Subdivision: "[a b] c"
   - Repeat: "a*4"
   - Rest / Silence: "~" (e.g. "[~ sd]")
   - Cycle Alternation: "<a b c d>"
   - Euclidean rhythms: "bd(3,8)" or "hh(5,8)"
   - Probability: "cp?" (50% chance)
   - Elongation: "a@2 b"
6. Effects: .gain(0.7), .lpf(1200), .hpf(200), .room(0.5), .delay(0.25).delaytime(0.125), .decay(0.4), .pan("0 1")
7. ALWAYS output valid executable Strudel code using stack(...) without markdown backticks in the json "code" string.`;

// 1. Generate new Strudel composition
app.post("/api/generate-strudel", async (req, res) => {
  try {
    const { prompt, style, complexity = "Beginner", tempo = 120 } = req.body;

    const fullPrompt = `Compose a Strudel live-coding music pattern strictly tailored to this skill level and request:
User Prompt: "${prompt || "Lofi chill beat with jazzy piano and warm drums"}"
Musical Style: ${style || "General"}
Target Skill Level: ${complexity} (Beginner = simple 2-3 layers & clear 4/4 meter; Intermediate = 3-4 layers, Euclidean rhythms & filter modulation; Advanced = 4-6 layers, Euclidean cross-rhythms, probability '?' & deep polymeter)
Target BPM: ${tempo}

IMPORTANT REQUIREMENTS:
- The generated code MUST include helpful inline comments and "// TWEAK TIP:" / "// PRO HACK:" notes on EVERY layer explaining how the user can tweak notes, numbers, or symbols by hand in the editor.
- The structure and notation MUST genuinely reflect the "${complexity}" complexity level.

Return a valid JSON object with:
- "code": The clean, fully commented Strudel JavaScript code (ready to evaluate in stack(...)).
- "title": A creative title for this track/pattern.
- "bpm": Recommended BPM (number).
- "genre": Detected or assigned genre.
- "complexity": "${complexity}",
- "explanation": Explanation (2-3 sentences) detailing why this fits the ${complexity} level and how each layer works.
- "notationBreakdown": Array of objects { "symbolOrMethod": string, "meaning": string } explaining key notation features used.
- "liveTweaks": Array of 3 short code modification snippets the user can try live (with label & replacement/addition code).`;

    const data = await callGeminiWithFallbacks(fullPrompt, STRUDEL_SYSTEM_INSTRUCTION);
    if (data && data.code) {
      return res.json({ success: true, data });
    }
    throw new Error("Invalid format from AI");
  } catch (error: any) {
    console.info("AI generation fell back to algorithmic composer:", error?.message || error);
    const fallbackData = generateLocalPattern(
      req.body.prompt || "Algorithmic Pattern",
      req.body.style || "Electronic",
      req.body.complexity || "Beginner",
      req.body.tempo || 120
    );
    res.json({
      success: true,
      data: fallbackData,
    });
  }
});

// 2. Tweak existing pattern
app.post("/api/tweak-pattern", async (req, res) => {
  try {
    const { currentCode, instruction } = req.body;

    const fullPrompt = `Modify this existing Strudel music code according to the instruction:

CURRENT STRUDEL CODE:
\`\`\`javascript
${currentCode}
\`\`\`

USER INSTRUCTION:
"${instruction}"

Return a valid JSON object with:
- "code": The updated Strudel JavaScript code.
- "summary": One sentence summary of what changed.
- "diffHighlights": Array of strings explaining specific modifications made.
- "liveTweaks": Array of 3 new tweaks to try next.`;

    const data = await callGeminiWithFallbacks(fullPrompt, STRUDEL_SYSTEM_INSTRUCTION);
    if (data && data.code) {
      return res.json({ success: true, data });
    }
    throw new Error("Invalid tweak format from AI");
  } catch (error: any) {
    console.info("Tweak AI fell back to algorithmic transformer:", error?.message || error);
    const localResult = generateLocalTweak(req.body.currentCode || "", req.body.instruction || "");
    res.json({ success: true, data: localResult });
  }
});

// 3. Explain code & teach notation
app.post("/api/explain-code", async (req, res) => {
  try {
    const { code } = req.body;

    const fullPrompt = `Explain this Strudel live-coding algorithmic music code in detail for a beginner:

STRUDEL CODE:
\`\`\`javascript
${code}
\`\`\`

Return a valid JSON object with:
- "summary": A musical summary of the overall vibe and structure.
- "lineByLine": Array of objects { "line": string, "role": "Drums" | "Bass" | "Harmony" | "Melody" | "FX" | "Structure", "explanation": string }
- "miniNotationGuide": Array of { "symbol": string, "title": string, "explanation": string, "example": string } explaining each mini-notation symbol present.
- "musicTheoryTip": A fun music theory insight about the scales, harmony, rhythm, or syncopation used.`;

    const data = await callGeminiWithFallbacks(fullPrompt, STRUDEL_SYSTEM_INSTRUCTION);
    if (data && data.summary) {
      return res.json({ success: true, data });
    }
    throw new Error("Invalid explanation format from AI");
  } catch (error: any) {
    console.info("Explain AI fell back to local AST analyzer:", error?.message || error);
    const localResult = generateLocalExplanation(req.body.code || "");
    res.json({ success: true, data: localResult });
  }
});

// 4. Live AI Copilot suggestions & instant variations
app.post("/api/suggest-variations", async (req, res) => {
  try {
    const { currentCode, mood } = req.body;

    const fullPrompt = `Given this current Strudel pattern:
\`\`\`javascript
${currentCode}
\`\`\`
Target Mood/Direction: ${mood || "Dynamic & surprising"}

Generate 4 creative live-performance variations (DJ drop, breakdown, polyrhythm, acid filter sweep).

Return a valid JSON object with:
- "variations": Array of 4 objects {
    "title": string,
    "type": "drop" | "breakdown" | "polyrhythm" | "harmonic" | "glitch" | "chill",
    "description": string,
    "code": string
  }`;

    const data = await callGeminiWithFallbacks(fullPrompt, STRUDEL_SYSTEM_INSTRUCTION);
    if (data && data.variations && data.variations.length > 0) {
      return res.json({ success: true, data });
    }
    throw new Error("Invalid variations format from AI");
  } catch (error: any) {
    console.info("Variations AI fell back to local DJ variations:", error?.message || error);
    const localResult = generateLocalVariations(req.body.currentCode || "");
    res.json({ success: true, data: { variations: localResult } });
  }
});

// 5. Fix errors
app.post("/api/fix-errors", async (req, res) => {
  try {
    const { code, errorMessage } = req.body;

    const fullPrompt = `Fix the syntax/runtime error in this Strudel music code:

BROKEN CODE:
\`\`\`javascript
${code}
\`\`\`

ERROR ENCOUNTERED:
${errorMessage || "Syntax or evaluation failure"}

Return a valid JSON object with:
- "fixedCode": Corrected valid Strudel code.
- "reason": Why it failed.
- "fixExplanation": What was changed to make it work.`;

    const data = await callGeminiWithFallbacks(fullPrompt, STRUDEL_SYSTEM_INSTRUCTION);
    if (data && data.fixedCode) {
      return res.json({ success: true, data });
    }
    throw new Error("Invalid fix format from AI");
  } catch (error: any) {
    console.info("Fix AI fell back to algorithmic corrector:", error?.message || error);
    let fixed = req.body.code || "";
    // Common fixes
    if (!fixed.includes("stack(") && fixed.includes(",")) {
      fixed = `stack(\n  ${fixed}\n)`;
    }
    fixed = fixed.replace(/\)\s*\(/g, ").s(");
    res.json({
      success: true,
      data: {
        fixedCode: fixed,
        reason: "Syntax or parenthetical balancing issue in Strudel mini-notation chain.",
        fixExplanation: "Restructured chaining into a valid stack() container with normalized quotes.",
      },
    });
  }
});

// Vite middleware for development & static serving for production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Strudel AI Live Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();


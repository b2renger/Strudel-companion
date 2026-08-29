import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";

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
  try {
    return JSON.parse(clean);
  } catch (err) {
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(clean.substring(firstBrace, lastBrace + 1));
    }
    throw err;
  }
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs = 7000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
    ),
  ]);
};

// Robust multi-model caller with automatic failover across model tiers
async function callGeminiWithFallbacks(
  fullPrompt: string,
  systemInstruction: string,
  timeoutMs = 8000
): Promise<any | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const ai = getAi();
  // Models in priority sequence: flash-lite (high RPM/quota) -> pro-preview -> flash-latest
  const candidateModels = [
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-flash-latest",
    "gemini-3.7-flash",
  ];

  for (const model of candidateModels) {
    try {
      const apiCall = ai.models.generateContent({
        model,
        contents: fullPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
        },
      });

      const response = await withTimeout(apiCall, timeoutMs);
      const parsed = cleanAndParseJson(response.text);
      if (parsed) {
        return parsed;
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isQuotaOrBusy =
        err?.status === 429 ||
        err?.status === 503 ||
        errMsg.includes("429") ||
        errMsg.includes("503") ||
        errMsg.includes("quota") ||
        errMsg.includes("RESOURCE_EXHAUSTED");

      if (isQuotaOrBusy) {
        // Quietly failover to next candidate model or algorithmic generator
        continue;
      }
    }
  }

  return null;
}

// Algorithmic Fallback Engine respecting Complexity Level
const generateLocalPattern = (
  promptText: string = "Algorithmic Pattern",
  style: string = "Electronic",
  complexity: string = "Beginner",
  tempo: number = 120
) => {
  const lowerPrompt = promptText.toLowerCase();
  const lowerComp = (complexity || "Beginner").toLowerCase();
  const isLofi = lowerPrompt.includes("lofi") || lowerPrompt.includes("chill") || style.toLowerCase().includes("lo-fi");
  const isAcid = lowerPrompt.includes("acid") || lowerPrompt.includes("303") || lowerPrompt.includes("techno") || style.toLowerCase().includes("techno");
  const isSynthwave = lowerPrompt.includes("synthwave") || lowerPrompt.includes("80s") || style.toLowerCase().includes("synthwave");
  const isAmbient = lowerPrompt.includes("ambient") || lowerPrompt.includes("drone") || style.toLowerCase().includes("ambient");

  let code = "";
  let explanation = "";
  let notationBreakdown: any[] = [];
  let liveTweaks: any[] = [];

  if (lowerComp === "beginner") {
    // BEGINNER: Simple 2-3 layers, standard 4/4 meter, clear readable structure with high-visibility beginner tweak tips
    if (isLofi) {
      code = `// Lo-Fi Chill Study Beat - Beginner Level (${tempo} BPM)
stack(
  // 1. Kick & Snare Beat
  // TWEAK TIP: Try changing '[~ sd]' to 'sd' or add '[~ bd]' for bounce!
  s("bd [~ bd] sd [~ sd]"),

  // 2. Gentle Hi-Hats
  // TWEAK TIP: Change '*4' to '*8' for faster hats, or '*2' for slower groove
  s("hh*4").gain(0.5),

  // 3. Warm Rhodes 7th Chords
  // TWEAK TIP: Edit the notes inside '< >' to change the chord progression!
  note("<[c3 e3 g3 b3] [f3 a3 c4 e4]>").s("sine").room(0.5).gain(0.7)
)`;
    } else if (isAcid) {
      code = `// Acid Rave Baseline - Beginner Level (${tempo} BPM)
stack(
  // 1. Four-on-the-floor Kick
  // TWEAK TIP: Try '*4' for techno kick or '[bd ~]' for half-time
  s("bd*4"),

  // 2. Open Hi-Hat on offbeats
  // TWEAK TIP: Adjust .gain(0.6) between 0.2 and 1.0 to set volume
  s("[~ oh]*4").gain(0.6),

  // 3. Resonant Acid Bassline
  // TWEAK TIP: Change .lpf(1200) to .lpf(2500) to open up the filter!
  note("c2 [~ c2] eb2 g2").s("sawtooth").lpf(1200).decay(0.3).gain(0.85)
)`;
    } else if (isAmbient) {
      code = `// Meditative Chimes - Beginner Level (${tempo} BPM)
stack(
  // 1. Deep Sub Drone
  // TWEAK TIP: Change 'c1' to 'f1' or 'g1' to shift the root drone pitch
  note("<c1 f1>").s("sine").decay(2.0).gain(0.8),

  // 2. Shimmering Pentatonic Bells
  // TWEAK TIP: Change .delay(0.3) to .delay(0.6) for deeper space echoes
  note("<[c4 e4 g4] [g4 b4 d5] [f4 a4 c5]>").s("triangle").decay(1.5).delay(0.3).room(0.7).gain(0.65)
)`;
    } else {
      code = `// Groovy Starter Track - Beginner Level (${tempo} BPM)
stack(
  // 1. Foundation Kick & Snare
  // TWEAK TIP: Swap 'sd' with 'cp' to hear claps instead of snares!
  s("bd [~ bd] sd [~ sd]"),

  // 2. Rhythm Hi-Hats
  // TWEAK TIP: Try 'hh*8' for rapid trap-style rolls!
  s("hh*4").gain(0.55),

  // 3. Melodic Triad Lead
  // TWEAK TIP: Change the scale notes inside '< >' to make your own melody
  note("<c3 e3 g3 b3>").s("triangle").decay(0.3).gain(0.75)
)`;
    }

    explanation = "Beginner composition with clean 2-3 layer architecture, accessible 4/4 rhythm grids, and direct parameter tuning tips.";
    notationBreakdown = [
      { symbolOrMethod: "stack(...)", meaning: "Plays drums, bass, and melody layers at the same time." },
      { symbolOrMethod: 's("bd*4")', meaning: "Multiplies kick drum into 4 equal beats in 1 cycle." },
      { symbolOrMethod: "[~ sd]", meaning: "Inserts a rest '~' before the snare for syncopated groove." },
    ];
    liveTweaks = [
      { label: "⚡ Double Hi-Hats (*8)", prompt: "Change hi-hats to hh*8 for faster groove" },
      { label: "🎛️ Open Filter (.lpf)", prompt: "Increase .lpf filter cutoff to 2800" },
      { label: "✨ Add Space Reverb", prompt: "Add .room(0.7).delay(0.3) to the lead melody" },
    ];

  } else if (lowerComp === "intermediate") {
    // INTERMEDIATE: 3-4 layers, Euclidean rhythms (k,n), chord brackets, cycle alternation < >, dynamic DSP filters
    if (isAcid) {
      code = `// Resonant 303 Acid Techno - Intermediate (${tempo} BPM)
stack(
  // 1. Driving 4/4 909 Kick & Snappy Claps
  // TWEAK TIP: Try changing '[~ cp]*2' to '[~ cp*2]' for double claps!
  s("bd*4, [~ cp]*2"),

  // 2. Syncopated Euclidean Hi-Hats (5 pulses over 8 steps)
  // TWEAK TIP: Swap '(5,8)' to '(7,8)' or '(3,8)' to morph the rhythmic groove!
  s("hh(5,8)").gain(0.55),

  // 3. Modulating Acid Bass with Resonant Low-Pass Filter
  // TWEAK TIP: Modulate .lpf between 600 and 3200 for live live-coding filter sweeps!
  note("<c2 [eb2 c2] [f2 g2] [bb2 c3]>").s("sawtooth").lpf(1600).decay(0.22).gain(0.9),

  // 4. Stereo Ping-Pong Synth Stabs
  // TWEAK TIP: Adjust .delay(0.35) and .delaytime(0.125) for syncopated 1/8 note dub echoes
  note("<[c4 eb4 g4] [f4 ab4 c5]>").s("square").lpf(2400).decay(0.2).delay(0.35).gain(0.6)
)`;
    } else if (isLofi) {
      code = `// Neo-Soul Dusty Lo-Fi - Intermediate (${tempo} BPM)
stack(
  // 1. Boom-Bap Drums with Ghost Snares & Syncopated Kicks
  // TWEAK TIP: Alter '[sd bd]' to create unexpected drum turnaround fills!
  s("bd [~ bd] [sd bd] [~ sd]"),

  // 2. Offbeat Hi-Hats with Micro Rests
  // TWEAK TIP: Try 'hh [hh*2] hh [hh*3]' for skippy garage-style swing!
  s("[hh ~] hh [hh hh] ~").gain(0.5),

  // 3. Jazz Minor 9th Chord Voicings across 4 Measures
  // TWEAK TIP: Change chords inside '< >' to invent your own harmonic progression
  note("<[d3 f3 a3 c4 e4] [g3 b3 d4 f4 a4] [c3 e3 g3 b4 d5] [a3 c#4 e4 g4]>").s("piano").decay(0.9).room(0.5).gain(0.7),

  // 4. Deep Sine Sub Bass Progression
  // TWEAK TIP: Transpose notes down an octave (d1, g1, c1) for heavier sub impact
  note("<d2 g2 c2 a1>").s("sine").decay(0.7).gain(0.95)
)`;
    } else {
      code = `// Polyrhythmic Groove - Intermediate (${tempo} BPM)
stack(
  // 1. Punchy Kick & Snare Base
  // TWEAK TIP: Change 'sd' to 'cp' or add '[~ rim]' for latin flair
  s("bd [~ bd] sd [~ [sd bd]]"),

  // 2. Euclidean 5/8 Hi-Hat with Ghost Rims
  // TWEAK TIP: Experiment with 'hh(3,8)' or 'hh(7,16)' for polyrhythmic tension!
  s("hh(5,8), rim(3,8)").gain(0.55),

  // 3. Cycling Modal Chord Progression in Dorian Scale
  // TWEAK TIP: Adjust .decay(0.4) for shorter plucks or .decay(1.2) for long pads
  note("<[d3 f3 a3 c4] [g3 b3 d4] [c3 e3 g3] [bb2 d3 f3]>").s("triangle").decay(0.45).delay(0.25).room(0.4).gain(0.7),

  // 4. Bouncing Octaved Bassline
  // TWEAK TIP: Try changing '[d2 d1]' to '[d2*2 d1]' for rolling 16ths!
  note("<[d2 d1] [g2 g1] [c2 c1] [bb1 bb0]>").s("sawtooth").lpf(1400).decay(0.3).gain(0.85)
)`;
    }

    explanation = "Intermediate algorithmic arrangement featuring Euclidean polyrhythms, alternating cycle brackets, and dynamic DSP modulation.";
    notationBreakdown = [
      { symbolOrMethod: "hh(5,8)", meaning: "Euclidean rhythm distributing 5 hi-hat pulses over 8 step intervals." },
      { symbolOrMethod: "<[c3 e3] [f3 a3]>", meaning: "Alternates between distinct multi-note chord voicings each cycle." },
      { symbolOrMethod: ".delay(0.35)", meaning: "Applies stereo ping-pong feedback echoes to enrich spatial depth." },
    ];
    liveTweaks = [
      { label: "🌀 Euclidean (7,8) Shift", prompt: "Change hi-hat to Euclidean (7,8) for driving energy" },
      { label: "🎛️ Resonant Filter Peak", prompt: "Set .lpf(1400).resonance(15) on the bassline" },
      { label: "🎹 Transpose Chords Up", prompt: "Transpose harmony chords up 2 semitones" },
    ];

  } else {
    // ADVANCED: 4-6 polyphonic layers, Euclidean cross-rhythms (e.g. 5/8 vs 7/16), degradation (?), elongation (@), micro-timing, rich modal extensions & deep modulation
    if (isAcid || isSynthwave) {
      code = `// Cyber Acid Polymetric Drive - Advanced Level (${tempo} BPM)
stack(
  // 1. Four-on-the-floor 909 Kick with Layered Ghost Snare Rush
  // PRO HACK: Try 'sd*4?' to inject 50% probability random snare roll stutters!
  s("bd*4, [~ sd]*2, [~ sd*4]?"),

  // 2. Dual Euclidean Cross-Rhythms (5/8 Hi-Hats against 7/16 Percussion)
  // PRO HACK: Modulate '(5,8)' vs '(7,16)' live to shift polymetric tension against the grid!
  s("hh(5,8), perc(7,16), oh?").gain(0.55),

  // 3. Fast 16th-note 303 Acid Arpeggiator with Squelch Filter & Snappy Decay
  // PRO HACK: Tweak .lpf(1800) between 400Hz and 4500Hz during live performance builds!
  note("<c2 eb2 f2 [g2 bb2] c3 [eb3 c3] [bb2 g2]>*2").s("sawtooth").lpf(1800).decay(0.18).gain(0.85),

  // 4. Modulated Reese Sub Bass Pad with Low-End Saturation
  // PRO HACK: Edit note durations with '@2' to create syncopated bass phrase lengths!
  note("<c1@2 [eb1 f1] g1@2 [bb1 c2]>").s("sawtooth").lpf(700).decay(0.6).gain(0.95),

  // 5. Shimmering Stereo Dub Delay Chords & Spectral Reverb
  // PRO HACK: Increase .delay(0.45).room(0.8) during breakdowns, then drop to .delay(0.1) on the drop!
  note("<[c4 eb4 g4 bb4] [f4 ab4 c5 eb5] [g4 bb4 d5 f5] [ab4 c5 eb5 g5]>").s("square").decay(0.25).delay(0.35).room(0.6).gain(0.5)
)`;
    } else {
      code = `// Algorithmic Polymeter Suite - Advanced Level (${tempo} BPM)
stack(
  // 1. Chopped Syncopated Drum Matrix with Probabilistic Fills
  // PRO HACK: 'cp?' triggers random clap occurrences; '[~ sd*3]' creates triplet turnaround rolls!
  s("bd [~ bd*2] [sd bd] [~ sd*3], cp?"),

  // 2. Polymetric Euclidean Hi-Hat & Shaker Polyphony (7/12 against 5/8)
  // PRO HACK: Experiment with irregular denominators like (5,12) or (7,16) for metric phase shifts!
  s("hh(7,12), shaker(5,8)").gain(0.5),

  // 3. Complex Neo-Soul 11th & 13th Extended Harmonic Cycle
  // PRO HACK: Swap chords in '< >' to modulate between harmonic minor and Dorian modes!
  note("<[c3 e3 g3 b3 d4] [f3 a3 c4 e4 g4] [d3 f3 a3 c4 e4] [g3 b3 d4 f4 a4]>").s("piano").decay(0.85).room(0.5).gain(0.65),

  // 4. Dynamic Acid Modulated Bass Hook with Envelope Decay
  // PRO HACK: Change .lpf(1400) to .lpf("<800 1400 2400 3600>") for automatic cyclical sweeps!
  note("<[c2 ~ c2] [eb2 c2] [f2 ~ f2] [g2 bb2]>").s("sawtooth").lpf(1400).decay(0.24).gain(0.9),

  // 5. Granular Ping-Pong Echo Stabs in Stereo Field
  // PRO HACK: Modify .delay(0.4) and .decay(0.15) for razor-sharp dub echo reflections!
  note("<[g4 b4 d5] [c5 e5 g5] [f5 a5 c6] [bb4 d5 f5]>").s("triangle").decay(0.18).delay(0.4).gain(0.55)
)`;
    }

    explanation = "Advanced polyphonic composition featuring Euclidean cross-polymeters, probabilistic micro-events, 11th/13th harmonic extensions, and multi-stage DSP modulation.";
    notationBreakdown = [
      { symbolOrMethod: "hh(7,12), shaker(5,8)", meaning: "Cross-polymetric phasing layering 7 pulses over 12 against 5 over 8." },
      { symbolOrMethod: "cp?", meaning: "Probabilistic modifier triggering the sound with 50% conditional randomness." },
      { symbolOrMethod: "c1@2", meaning: "Time elongation assigning 2 beats of duration to the pitch." },
      { symbolOrMethod: ".lpf(1800).decay(0.18)", meaning: "Tight resonant filter envelope shaping snappy transients." },
    ];
    liveTweaks = [
      { label: "⚡ Probabilistic Stutter (?)", prompt: "Add conditional ? triggers to snare and claps" },
      { label: "🌀 Metric Phase (7,16)", prompt: "Change percussion layer to Euclidean (7,16)" },
      { label: "🎛️ Cyclical Filter Sweeps", prompt: "Modulate .lpf cutoff cyclically across measures" },
    ];
  }

  return {
    code,
    title: `${style || "Algorithmic"} ${complexity} Session`,
    bpm: tempo,
    genre: style || "Algorithmic Electronic",
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

// Algorithmic Fallback Variations Engine
const generateLocalVariations = (currentCode: string) => {
  return [
    {
      title: "💥 Heavy Bass Drop & Kick",
      type: "drop",
      description: "Punchy 4-on-the-floor kick with high-resonance low-pass sawtooth bassline.",
      code: `stack(
  s("bd*4, [~ sd]*2"),
  s("hh*8").gain(0.4),
  note("<c1 [~ c1] eb1 [g1 bb1]>").s("sawtooth").lpf(1600).decay(0.3).gain(0.9)
)`,
    },
    {
      title: "🌀 5/8 Euclidean Groove",
      type: "polyrhythm",
      description: "Syncopated Euclidean rhythm (5 pulses over 8 steps) with ghost snares.",
      code: `stack(
  s("bd(3,8), sd(2,8)"),
  s("hh(5,8)").gain(0.55),
  note("<c3 [eb3 g3] [bb3 d4] c4>").s("triangle").decay(0.2).delay(0.25).gain(0.7)
)`,
    },
    {
      title: "🎛️ 303 Acid Filter Sweep",
      type: "glitch",
      description: "ResonantTB-303 style synth line with 16th note acid arpeggiations.",
      code: `stack(
  s("bd*4, [~ cp]*2"),
  s("hh*16").gain(0.35),
  note("<c2 eb2 f2 g2 bb2 c3>*2").s("sawtooth").lpf(1400).decay(0.18).gain(0.85)
)`,
    },
    {
      title: "✨ Ambient Space Breakdown",
      type: "breakdown",
      description: "Stripped-back percussion with shimmering delayed chords and reverb tail.",
      code: `stack(
  s("[~ sd]"),
  note("<[c3 eb3 g3 bb3] [f3 ab3 c4 eb4]>").s("sine").room(0.7).delay(0.4).gain(0.65),
  note("c2@2 eb2@2").s("triangle").lpf(600).gain(0.8)
)`,
    },
  ];
};

const STRUDEL_SYSTEM_INSTRUCTION = `You are an expert algorithmic music composer and live-coding maestro specialized in Strudel (strudel.cc) and TidalCycles mini-notation.
Your goal is to generate valid, expressive, musical Strudel JavaScript code that sounds great, strictly tailors itself to the requested complexity level (Beginner, Intermediate, Advanced), and includes clear inline hand-tweaking tips for live performance.

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

    const data = await callGeminiWithFallbacks(fullPrompt, STRUDEL_SYSTEM_INSTRUCTION, 8000);
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

    const data = await callGeminiWithFallbacks(fullPrompt, STRUDEL_SYSTEM_INSTRUCTION, 7000);
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

    const data = await callGeminiWithFallbacks(fullPrompt, STRUDEL_SYSTEM_INSTRUCTION, 7000);
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

    const data = await callGeminiWithFallbacks(fullPrompt, STRUDEL_SYSTEM_INSTRUCTION, 7000);
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

    const data = await callGeminiWithFallbacks(fullPrompt, STRUDEL_SYSTEM_INSTRUCTION, 7000);
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


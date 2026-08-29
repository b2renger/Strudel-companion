# Strudel AI Live Studio 🎛️ 🎹

An in-browser algorithmic music live-coding studio and interactive playground powered by Strudel/TidalCycles mini-notation, procedural Web Audio synthesis, real-time audio visualization, and an intelligent AI music copilot.

---

## 🌟 Key Features

### 1. Algorithmic Live Coding & Mini-Notation Engine
* **TidalCycles Notation**: Full support for rhythmic syntax including:
  * **Euclidean Rhythms**: `(3,8)`, `(5,8)`, `(7,16)` for syncopated polyrhythms.
  * **Subdivisions & Nesting**: `[bd sd]`, `[bd [~ cp]]`.
  * **Speed & Polymeter**: `*2`, `/2`, `[c3 e3 g3, ~ b3]`.
  * **Alternating Cycles**: `<c3 f3 g3 a3>` progression sequencing.
  * **Probability & Degradation**: `hh?0.5`, `bd?0.8`.
  * **Rests & Pauses**: `~`.
* **Sound Generators & Synth Voices**: `sine`, `sawtooth`, `square`, `triangle`, `supersaw`, `pluck`, `piano`, `fm`, `rhodes`, `808`, `909`, `acid`, `ambient`.
* **Real-time DSP Chains**: `.lpf()`, `.hpf()`, `.lpq()`, `.decay()`, `.attack()`, `.sustain()`, `.release()`, `.room()`, `.delay()`, `.delaytime()`, `.delayfeedback()`, `.pan()`, `.gain()`, `.fast()`, `.slow()`.

### 2. AI Music Generation & Live Copilot
* **Natural Language to Code**: Generate complex, polyphonic algorithmic music from natural language prompts (e.g., *"128 BPM cyberpunk bassline with aggressive acid filter sweep and 909 drums"*).
* **Tiered Complexity**: Tailored generation for **Beginner**, **Intermediate**, and **Advanced** skill tiers.
* **Instant Transformations**: Quick one-click musical variations:
  * 🔥 *The Drop* (strips intros and unleashes peak energy)
  * 🧊 *The Breakdown* (filters out drums, leaves atmospheric pads)
  * 🌀 *Euclidean Shift* (re-grooves tracks with syncopated Euclidean rhythms)
  * 🎹 *Harmonic Inversion* (replaces chords with jazz/neo-soul voicings)
  * ⚡ *Glitch & Fill* (adds randomized micro-repeats and stutter fills)
* **Natural Language Tweaker**: Request conversational adjustments (e.g. *"Make the drums punchier and open up the lowpass filter"*).

### 3. Procedural Web Audio Engine (Zero External Sample Dependency)
* Fully client-side procedural synthesis running in the browser's `AudioContext`.
* Synthesized analog drum machines (punchy sub-bass 808 kicks, snappy noise snares, crisp metallic hi-hats, procedural claps).
* Algorithmic impulse response reverb convolver, feedback delay line, and resonant biquad filters.
* Rock-solid lookahead clock scheduler preventing audio buffer underruns and timing jitter.

### 4. Interactive AST Token Parser & Code Inspector
* Custom tokenizer parses Strudel code into abstract syntax layers and semantic tokens.
* Click any token in the code editor to open the **Token Inspector**:
  * Adjust numeric parameters via interactive sliders.
  * Cycle sound waveforms or drum sample types with live previews.
  * Wrap expressions in Euclidean rhythms or cycle brackets.
* Line-by-line musical theory breakdown identifying layer roles (Drums, Bass, Harmony, Melody, FX).

### 5. Real-Time Performance Visualizers & Telemetry
* **Oscilloscope**: Real-time waveform rendering with smooth zero-crossing stabilization.
* **FFT Spectrum Analyzer**: 64-band frequency spectrum with dynamic peak falloff.
* **Euclidean Radar**: Circular step radar tracking 16-step cycles and active polyphonic voice pulses.
* **Live Voice Meters**: Activity monitors for Drums, Bass, Chords, and Melody channels.

### 6. Curated Library & Notation Cheatsheet
* Built-in multi-genre presets across Cyberpunk, Lo-Fi, Deep Space Ambient, UK Garage, Acid Techno, and Chiptune.
* Interactive **TidalCycles Mini-Notation Reference Guide** with copyable patterns and audio demonstrations.

---

## 🏛️ Architecture Overview

```
├── src/
│   ├── engine/
│   │   └── audioEngine.ts          # Core Web Audio synthesis engine & scheduler
│   ├── utils/
│   │   └── strudelTokenParser.ts   # Strudel mini-notation lexical analyzer & AST parser
│   ├── components/
│   │   ├── AIPromptBar.tsx         # Natural language prompt interface & token suggestions
│   │   ├── AILiveCopilot.tsx       # AI variation cards and conversational code tweaker
│   │   ├── CodeEditor.tsx          # Dual-mode code editor (Raw Text & Visual Track Lanes)
│   │   ├── InteractiveCodeHighlighter.tsx # Semantic syntax highlighting with token clicks
│   │   ├── LineByLineBreakdown.tsx  # Music theory & layer analysis inspector
│   │   ├── NotationGuide.tsx       # TidalCycles mini-notation reference guide
│   │   ├── PatternVisualizer.tsx   # Canvas-based oscilloscope, FFT & Euclidean radar
│   │   ├── PresetSelectorModal.tsx # Preset catalog with filter tags & previews
│   │   ├── PromptSuggestionEngine.tsx # Smart autocomplete and genre token palette
│   │   ├── StudioHeader.tsx        # Master transport, BPM, DSP controls, & theme toggle
│   │   └── TokenInspectorModal.tsx # Parameter slider & token modifier modal
│   ├── data/
│   │   └── presets.ts              # Hand-crafted multi-track presets
│   ├── types.ts                    # Global TypeScript interfaces & data contracts
│   ├── index.css                   # Tailwind CSS v4 styling & color tokens
│   ├── App.tsx                     # Main layout & application coordinator
│   └── main.tsx                    # React application entry point
├── server.ts                       # Express backend proxying AI calls with multi-model failover
├── package.json                    # Dependencies & build configuration
└── vite.config.ts                  # Vite build & asset pipeline config
```

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (version 18.0 or higher recommended)
* A modern web browser with Web Audio API support (Chrome, Edge, Firefox, Safari)

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone <repository-url>
cd strudel-ai-studio
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and provide your Gemini API key (optional for core synthesizer, required for AI prompt generation):
```bash
cp .env.example .env
```
Inside `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```
*(Note: If no API key is provided, the application automatically falls back to an intelligent procedural rule-based code generator).*

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production
```bash
npm run build
npm start
```

---

## ⌨️ Live Coding Quickstart Cheatsheet

```javascript
// 1. 4-on-the-floor Beat with Euclidean Snare & Open Hats
s("bd*4, ~ [sd, cp](3,8), [hh*2 [hh oh]]*2")
  .lpf(8000)
  .room(0.2)

// 2. Acid Bassline with Cycling Filter
note("<c2 [eb2 g2] bb1 <f2 g2>>")
  .sound("sawtooth")
  .lpf(sine.range(400, 3200).slow(4))
  .decay(0.2)
  .gain(0.8)

// 3. Ambient Dream Chords
chord("<Cm9 Fm7 Gm7 Abmaj7>")
  .sound("supersaw")
  .lpf(1400)
  .room(0.8)
  .delay(0.4)
```

---

## 🛠️ Tech Stack

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Motion.
* **Audio**: Native Web Audio API, Canvas 2D Oscilloscope & FFT spectrum analyzer.
* **Parser**: Custom Strudel / TidalCycles AST Tokenizer.
* **AI Engine**: Google Gen AI SDK (`@google/genai`) with multi-tier fallback architecture and deterministic algorithmic fallback.
* **Backend**: Express + Vite middleware bundling with `esbuild`.

---

## 📄 License
MIT License. Built for algorithmic music creators, live coders, and sonic explorers.

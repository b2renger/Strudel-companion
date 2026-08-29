# Architecture & Migration Plan: In-Browser Client-Side Gemma & GitHub Pages Deployment

This document outlines the detailed architectural blueprint and implementation plan to transition **Strudel AI Live Studio** from a Node.js/Express server-side Gemini API architecture to a **100% static, client-side application** running local **Gemma** via WebGPU in the browser and hosted on **GitHub Pages**.

---

## 🎯 Primary Goals

1. **Zero Backend & Zero API Costs**: Eliminate the Node.js/Express proxy server, allowing the app to run as static HTML/JS/CSS on GitHub Pages.
2. **Local AI Inference**: Execute Gemma 2B / Gemma 2 2B models directly in the user's browser using WebGPU acceleration (`@mlc-ai/web-llm` / Chrome Built-in Prompt API).
3. **Rock-Solid Audio Isolation**: Ensure that heavy local neural network inference never interrupts the Web Audio synthesis clock, prevents audio stutter, or causes frame drops.
4. **Offline Capability & Zero Weight Re-downloads**: Cache quantized model weights permanently in browser storage (Cache API / IndexedDB) after initial download.
5. **Seamless Fallback**: Maintain instantaneous rule-based algorithmic generation when WebGPU is unavailable or when the user prefers instant offline mode.

---

## 🏗️ Architectural Evolution

```
CURRENT ARCHITECTURE (Full-Stack):
┌────────────────┐     HTTP /api/ai/generate      ┌─────────────────────────┐     HTTPS API Call     ┌───────────────────┐
│ Browser Client │ ─────────────────────────────> │ Node/Express server.ts  │ ─────────────────────> │ Gemini Cloud API  │
│ (React + Audio)│ <───────────────────────────── │ (Multi-model failover)  │ <───────────────────── │ (Server-side key) │
└────────────────┘       JSON Code + Metadata     └─────────────────────────┘      Streamed JSON     └───────────────────┘

TARGET ARCHITECTURE (100% Client-Side on GitHub Pages):
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ BROWSER RUNTIME (Static SPA hosted on GitHub Pages)                                                   │
│                                                                                                        │
│  ┌─────────────────────────┐               postMessage()               ┌─────────────────────────────┐ │
│  │ Main UI & Audio Thread  │ ────────────────────────────────────────> │ Dedicated Web Worker        │ │
│  │  - React 19 UI State    │                                           │  - WebLLM Engine / WebGPU   │ │
│  │  - Code Editor / AST    │ <──────────────────────────────────────── │  - Gemma 2B Instruct Model  │ │
│  │  - Web Audio Synthesizer│             Streamed Tokens & AST         │  - Strudel Grammar Filter   │ │
│  │  - Canvas Oscilloscope  │                                           └──────────────┬──────────────┘ │
│  └─────────────────────────┘                                                          │                │
│                                                                               IndexedDB Cache / CDN    │
│                                                                                       ▼                │
│                                                                        ┌─────────────────────────────┐ │
│                                                                        │ In-Browser Model Storage    │ │
│                                                                        │ (gemma-2b-it-q4f16_1)       │ │
│                                                                        └─────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Phased Implementation Plan

### Phase 1: Client-Side WebLLM & Web Worker Pipeline
* **Install Dependency**: Add `@mlc-ai/web-llm` to client dependencies.
* **Create Web Worker (`src/workers/aiWorker.ts`)**:
  * Offload `MLCEngine` / WebGPU execution into a separate worker thread.
  * Handle model initialization lifecycle (`initProgressCallback`), token streaming, cancellation, and response formatting.
  * Post intermediate token streams and progress percentages back to the UI thread.
* **Worker Client Hook (`src/hooks/useLocalGemma.ts`)**:
  * Provide reactive state for download progress (`0-100%`), engine readiness, inference latency, and cancellation hooks.

### Phase 2: System Prompts & Structured Grammar Adaptation
* **Migrate Server Prompting into Client Modules (`src/ai/prompts.ts`)**:
  * Port the Strudel notation rules, few-shot generation examples, music theory constraints, and formatting schemas into optimized prompt templates tailored for Gemma 2B context windows.
* **Client-Side JSON & Code Parsing (`src/ai/outputParser.ts`)**:
  * Extract Strudel patterns, explanations, and tweak variations from raw streamed model completions using tolerant regex and AST validators.

### Phase 3: Chrome Built-in AI (Gemini Nano) Integration
* **Detect `window.ai` / `ai.languageModel`**:
  * Check for Chrome's native built-in AI API availability.
  * If native Gemini Nano is present, allow zero-download instant inference without downloading external weight bundles.
* **Tiered Selection UI**:
  * Allow users to select their AI Engine mode in the Studio Header:
    1. ⚡ **Chrome Built-in AI (Nano)** *(0 MB download)*
    2. 🧠 **Local WebGPU Gemma 2B** *(~1.3 GB cached download)*
    3. 🚀 **Instant Algorithmic Fallback** *(0 MB, instant heuristic)*
    4. ☁️ **Gemini Cloud API** *(Optional by entering user's own client key)*

### Phase 4: Model Weight Caching & Memory Management
* **IndexedDB & Cache API Storage**:
  * WebLLM automatically caches compiled WASM shaders and quantized model weights (`q4f16_1` or `q4f32_1`) in the browser cache.
  * Implement clear cache / manage storage diagnostics in the settings dialog.
* **Memory Limits & Resource Safeguards**:
  * Cap WebGPU buffer allocation and set model context size to 2048 tokens to keep VRAM usage strictly under 2.0 GB.

### Phase 5: GitHub Pages Build Pipeline & Static Routing
* **Update `vite.config.ts`**:
  * Set `base: './'` or `base: process.env.GITHUB_PAGES ? '/strudel-ai-studio/' : '/'`.
  * Ensure Web Worker bundling is enabled (`worker: { format: 'es' }`).
* **Add GitHub Actions Workflow (`.github/workflows/deploy.yml`)**:
  * Automatically run `npm ci`, `npm run build`, and deploy `dist/` to GitHub Pages via `actions/deploy-pages@v4`.
* **Headers & COOP/COEP Support**:
  * Add `coi-serviceworker` if cross-origin isolation is required for high-performance `SharedArrayBuffer` threading.

---

## 🔬 Performance & Stability Matrix

| Dimension | Cloud Gemini API | Local WebGPU Gemma 2B | Chrome Built-in AI (Nano) |
| :--- | :--- | :--- | :--- |
| **Hosting Requirement** | Node.js Backend Server | 100% Static (GitHub Pages) | 100% Static (GitHub Pages) |
| **API Costs** | Cloud Quota / Token Cost | $0 (Zero API calls) | $0 (Zero API calls) |
| **Download Footprint** | 0 MB | ~1.3 GB (one-time cache) | 0 MB (built into browser) |
| **Network Dependency** | Active Internet Connection | Fully Offline once cached | Fully Offline |
| **Audio Thread Safety** | Non-blocking HTTP | Worker thread non-blocking | Non-blocking browser API |
| **Generation Speed** | ~1.0 - 2.5s network trip | 25 - 60 tokens/sec on GPU | 30 - 70 tokens/sec on GPU |

---

## 🛠️ Step-by-Step Execution Checklist for Feature Branch

- [ ] **Branch**: Create `feature/client-side-gemma-ghpages`
- [ ] **Dependencies**: `npm install @mlc-ai/web-llm`
- [ ] **Worker**: Implement `src/workers/aiWorker.ts` with WebLLM engine initialization
- [ ] **State & Hooks**: Create `useLocalGemma` React hook with download progress bars
- [ ] **Prompt Engineering**: Adapt system instructions for Gemma-2B / Nano context efficiency
- [ ] **Build Config**: Configure `vite.config.ts` for static relative paths and static production output
- [ ] **GitHub Action**: Create `.github/workflows/deploy.yml` for automated GitHub Pages publishing
- [ ] **Verification**: Test audio playback concurrently during high-load WebGPU text generation

# Architecture & status

This replaces `CLIENT_SIDE_GEMMA_PLAN.md`, which described a migration from a
Node/Express + server-side Gemini setup to a static client-side app. That
migration is **done** — the server is deleted — so a forward-looking plan is no
longer the useful document. This one records how the thing works now, and the
reasoning behind the decisions that are easy to get wrong twice.

---

## Where it landed

```
┌──────────────────────────────────────────────────────────────────────────┐
│ BROWSER (static site on GitHub Pages)                                    │
│                                                                          │
│  Main thread                                 Web Worker                  │
│  ┌────────────────────────┐  postMessage   ┌──────────────────────────┐  │
│  │ React UI               │ ─────────────► │ @mlc-ai/web-llm          │  │
│  │ Web Audio synthesiser  │ ◄───────────── │ WebGPU inference         │  │
│  │ Canvas visualisers     │   streamed     └──────────────────────────┘  │
│  └────────────────────────┘                        │                     │
│            │                                       ▼                     │
│            │                              Cache Storage (weights)        │
│            ▼                                                             │
│   ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────────┐  │
│   │ Rule-based      │   │ LanguageModel    │   │ fetch → Google       │  │
│   │ generator       │   │ (Gemini Nano)    │   │ (user's own key)     │  │
│   └─────────────────┘   └──────────────────┘   └──────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

No server. No build-time secrets. The only network calls at runtime are the
optional model download and the optional Gemini request.

---

## Decisions worth not re-litigating

### Every AI call reports which engine produced it

`aiManager` returns `AIEngineResult<T>` — `{ data, producedBy, requestedEngine,
degraded }` — and there is exactly one place a fallback can occur
(`withFallback`), which is required to emit an error and name what really ran.

This exists because the previous design wrapped all fifteen call sites in
`try { … } catch { return heuristic }` with no user-visible signal. A missing
server, a worker that was never created, and a genuine model answer were
indistinguishable on screen. Every engine had been broken for a long time and
nobody could tell. **If you add an engine, it must participate in this
contract** — otherwise "does it work?" becomes unanswerable again.

### The audio engine validates with Strudel but plays with its own synth

Real Strudel loads drum samples from a CDN. Bundling a sample pack would cost
tens of megabytes; fetching it at runtime would break offline use. So:

- `@strudel/transpiler` **validates** — real syntax errors, and code exported to
  strudel.cc is code strudel.cc accepts.
- The custom Web Audio synthesiser **plays** — no downloads, works offline.

`evaluate()` must be able to fail. It previously could not: nothing in the parse
chain threw, and unrecognised input fell back to a canned `bd sd, hh*4` layer, so
*any* string reported success. That single fallback is why `errorMessage` was
always null and the entire "Fix with AI" path was unreachable dead code.

### One source of truth for sound names

`src/audio/vocabulary.ts` feeds both the synthesiser's drum lookup and the AI
prompt's vocabulary section. Hardcoding a palette in the prompt is what led to
the model being coached to emit `glitch`, `supersaw` and `marimba` — names the
engine rendered as a plain sawtooth or, worse, a sustained middle C.

**Adding a voice means editing that file and its branch in `renderDrumSound` /
`renderMelodySynth`.** The prompt then updates itself.

### Local models ask for fenced code, not nested JSON

Asking a 1B model for JSON with escaped newlines inside string values is close to
the worst case for structured output. Worse, when such a reply is truncated,
`jsonrepair` closes the string and returns a *well-formed object containing a
half-written pattern* — which then silently overwrote the user's work.

So local models get a fenced block plus labelled lines. It is cheaper in output
tokens, and a truncated reply is detectable (unclosed fence) rather than
silently repaired. Gemini uses `responseSchema` instead, which is real
constrained decoding.

`outputParser.ts` throws `AIParseError` rather than inventing a fallback
pattern — a canned answer presented as model output is the same lie as a silent
fallback.

### Variations are generated one per call

Three complete patterns in one reply needs roughly 2,100 output tokens. That
overran every local model's budget *every time* and truncated mid-pattern. It is
now three sequential calls, so a later failure still leaves the earlier
variations usable.

### The worker never resolves a request with a load event

`ensureEngine` tags its progress and readiness messages `phase: 'init'`, and the
manager ignores them for request resolution. Previously init replied with the
*calling request's* id, so the first generation after a model load resolved with
`undefined` — the UI reported failure, and the model's real output was discarded
when it arrived moments later.

### Model IDs and the f16 trap

`src/ai/models.ts` carries an explicit `needsF16` flag per model. Do not rely on
web-llm's `required_features`: it is populated for `gemma-2-2b` only, so the
`q4f16_1` Llama/Qwen/SmolLM2 builds genuinely need f16 while declaring nothing,
and the failure surfaces as a raw WGSL compile error *after the full download*.

`Llama-3.2-1B-Instruct-q4f32_1-MLC` is in the catalogue specifically because it
is the only offered build that runs on GPUs without `shader-f16` — which is every
Qualcomm chip, and therefore most Android phones.

### The API key threat model

The key belongs to the user and never leaves their browser except in the request
to Google. There is no server to protect it from. `localStorage` over
`sessionStorage` is deliberate: a tool you reopen constantly is unusable if the
key must be re-pasted, and neither choice mitigates XSS on this origin — a
Content-Security-Policy does. The mitigation that actually matters is an
HTTP-referrer restriction on the key, which the settings UI tells the user to
set.

The key is deliberately kept out of `SavedSession` objects, which are exported to
JSON and shared.

---

## Verification checklist

`npm test` covers the pure logic — parsers, validators, vocabulary. The list
below is what it *cannot* reach: anything needing a DOM, an AudioContext, WebGPU
or a real network. Check these by hand after touching the relevant area.

**Deployment**
- [ ] `npm run lint` and `npm test` pass
- [ ] `npm run build` succeeds and `dist/` contains hashed assets
- [ ] Deployed site loads at the project path (not just at `/`)
- [ ] Reload with the network disabled still loads the app

**Engines**
- [ ] Each engine produces a pattern, and the "Written by" badge names it
- [ ] Killing the network mid-request shows an error, not a silent template
- [ ] Reloading with the local engine selected still works (worker is lazy)
- [ ] Switching models frees the previous one and loads the new one
- [ ] Cancel actually stops a download
- [ ] With no API key, Gemini is offered as unavailable rather than failing silently

**Audio**
- [ ] `s("bd*4").pan(0.3)` plays a kick, not an inaudible low tone
- [ ] `s("bd*4, ~ [sd, cp](3,8)")` plays all three parts
- [ ] Hush stops sound immediately, not after the current cycle
- [ ] Tempo is accurate against a metronome at 120 BPM
- [ ] Generating a pattern on iPhone produces audible sound

**Editor**
- [ ] Clicking the fourth `hh` in a pattern edits the fourth, not the first
- [ ] Removing `.gain` from a chain containing `.decay(0.3)` leaves valid code
- [ ] Invalid code shows a readable error and enables "Fix this with AI"

**Mobile (390px)**
- [ ] No horizontal scrolling or clipped controls
- [ ] The Eval button is reachable
- [ ] Modal action buttons are not under the browser chrome

---

## Known gaps

- `npm test` covers the parsers, validators and vocabulary only. There is no
  DOM, audio or end-to-end coverage; the checklist above is the substitute.
- The mini-notation subset is documented in the README; `chord()`, signals and
  sample banks are unimplemented and fail validation rather than mis-play.
- The token inspector only edits constructs the parser recognises.
- `@strudel/core` is not imported directly; it is kept because
  `@strudel/transpiler` depends on it. Nothing else in `package.json` is unused.

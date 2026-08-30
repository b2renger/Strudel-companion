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

### Model output is repaired before it is trusted

`src/ai/sanitizeCode.ts` sits between every engine and the editor. It exists
because a live session trace showed four distinct ways a model's answer reached
the user broken, and one way it reached them *silently* broken.

The prompt no longer asks for the things that caused most of it — comments used
to be requested explicitly, on every layer — but models volunteer them anyway,
so the repair pass stays. It strips comments (with a string-aware scanner, not
a regex), collapses chained `.s()` selectors, removes stray `.~`, turns a
dangling `.` back into the comma it ate, unquotes numeric effect arguments and
drops non-numeric Euclid arguments.

The important one is the last: it removes layers that provably cannot make a
sound. `s("rhodes")` is not a drum name, so `isDrumName` sends it down the
melodic path, `noteToFrequency` fails its regex and the event is dropped — the
layer is *silent*. Before this, `evaluate()` counted it, the trace counted it,
and the user heard nothing. A pattern whose layers are all dead is rejected
outright rather than handed over, on the same principle as the parser: an
honest failure beats silence with no error to react to.

Every edit it makes is recorded in `repairs` and logged, so a repaired pattern
can never be mistaken for one the model got right. It never invents music — it
only deletes what cannot sound and rewrites what is unambiguously a typo.

`audioEngine.evaluate()` repeats the playability check independently and
reports the result on `EvalEvent.silentTokens`, which the editor renders as an
amber strip. Two layers of the same check, because the sanitiser only sees
model output and the engine also has to cope with what the user types.

### Truncated model output is salvaged, not discarded

The worker used to throw the moment `finish_reason === 'length'`. In one
session that discarded three tweaks that had each spent 37 seconds generating
2,400+ characters — with, almost certainly, a complete pattern in the first
few hundred. It now parses the reply first and only reports the truncation if
the salvage also fails.

That is safe only because the reverse guard exists too: `outputParser`'s
bracket recovery is bounded so it cannot turn a genuinely cut-off reply into a
plausible half-pattern. It truncates back to the last cleanly closed layer,
gives up past two unclosed brackets, and only runs on text that contained
comments in the first place. There are explicit negative-control tests for
this; if you loosen it, keep them passing.

Generation also stops as soon as the answer is structurally complete
(`completionIsDone`). Small models do not reliably stop after a strict-format
answer — they start a second pattern, or explain themselves, until the cap.

### The truncation invariant, and the test that enforces it

For every prefix of a complete reply, parsing must either return exactly the
code the whole reply gives, or throw. Nothing in between.

Violating it is the worst failure this codebase has: a cut-off answer accepted
as a finished one reaches the user as their working pattern being overwritten
by a fragment, reported as a successful edit. Cloud and Nano do not report a
`finish_reason`, so nothing else would notice.

Three separate review rounds each found a hole in this by hand, in three
different places — a bracket recovery guarded only by "the text contained a
`//`"; a `|| json.code.trim()` fallback that shipped what `jsonrepair` had
closed up; and a comment-must-contain-a-bracket rule that `// euclid (7,16)
hats` satisfies. There is now a test that slices every reply shape at every
character position and checks the invariant on all three parsers — roughly
4,400 prefixes across 39 shape/parser pairs. Keep it green; it is the only
thing here that finds the next one automatically.

Two rules follow from the same reasoning and are load-bearing:

- **A comment may only be credited with closing a bracket it did not open.**
  The recovery for "the trailing comment swallowed the `)`" exists for a real
  Gemini reply, but a model cut off mid-comment also ends inside one. The
  discriminator is that the genuine case leaves an *unmatched* closer in the
  comment; a balanced `(7,16)` is the comment's own text.
- **The last fenced block wins, not the first.** Every tweak, fix and variation
  prompt quotes the user's current pattern in a fence, and models restate it
  before answering. Taking the first block set the editor to what it already
  said while the summary described an edit that had been discarded. `App.tsx`
  additionally reports a tweak whose result is byte-identical to its input.

### The system prompt travels in the system channel only

Every prompt builder returns the **task**. It does not prepend
`STRUDEL_SYSTEM_PROMPT` or `STRUDEL_SYNTAX_CARD`.

All three engines have their own system channel — Gemini's
`systemInstruction`, Nano's `initialPrompts`, web-llm's system message — and
every one of them was *also* receiving a copy embedded in the user turn,
because the builders prepended it. Roughly 550 wasted tokens per call, and on
Nano's small window enough to crowd out the actual request.

`withSystemPrompt()` covers the one case that genuinely needs it: a chat
template with no system turn, where the rules have to travel inside the user
message.

Related: patterns quoted *into* a prompt have their comments stripped by
`forModel()`. The starter presets and the procedural composer both write
`// TWEAK TIP:` comments, so a tweak request was showing the model the exact
same-line comment form the system prompt forbids two paragraphs earlier. A
contradictory demonstration beats a stated rule with a small model.

### The tempo comes from the request, not the slider

`extractBpmFromPrompt()` reads a tempo out of whatever the user asked for —
a suggestion or free text — and it beats the BPM slider.

This was the shape of the bug: the suggestion list is full of prompts that name
a tempo ("138 BPM Acid Techno", "at 113 BPM"), clicking one set the prompt text
and *nothing else*, and the prompt then told the model `BPM: <slider>`. The
model correctly echoed the number it was given, so an entire session of
generations came out at the same tempo while every request asked for a
different one. The model was never wrong; the prompt was.

Two related labels were leaking into prompts the same way. "All Styles" is a UI
string, and it was being quoted as a genre — the model was asked to write in
the style of "All Styles" while the description said Amapiano. And the default
complexity was "Beginner", which caps a pattern at 2–3 layers with no
polymeter, while most of the suggestion list describes exactly the material
that rules out.

There is a test that every suggestion whose *title* promises a tempo actually
names it in the text the model sees. Two did not.

### Prompt text may only name sounds the engine has

`vocabulary.ts` tells the model that `303`, `808`, `909`, `cabasa`, `supersaw`,
`organ` and the rest are unsupported. The suggestion list was simultaneously
handing it "squelchy resonant 303 sawtooth bassline" and "warm organ stabs" to
copy, which is where the `s("303")` and `s("sub bass")` layers came from.

Anything a model sees now names a timbre the engine can actually produce — "a
squelchy resonant sawtooth bassline under a fast low-pass envelope". Titles,
tags and descriptions keep the genre vocabulary, because those are read by a
human. A test enforces the boundary; if you add a suggestion, it will tell you.

### Nothing from a pattern is trusted as a number

Every value parsed out of a pattern — gain, pan, cutoff, decay, room, delay,
`.fast`, `.slow`, `.cpm`, `.cps` — is clamped before it can reach Web Audio,
with a fallback for anything non-finite.

Web Audio does not tolerate what a text editor will happily produce. A
non-finite value in `setValueAtTime` throws, `createBuffer` with a zero length
throws, and both land inside the scheduler. `.slow(0)` is `1/0`, which made the
repeat loop unbounded and froze the tab outright; `.decay(0)` gave the hi-hat a
zero-length buffer; `.cpm(0)` wrote straight past `setBpm`'s clamp and made
every scheduled time non-finite. Strudel's own transpiler accepts all three, so
validation is not the place to catch them.

Two backstops sit behind the clamps, because the next unguarded number should
be a visible error rather than a dead engine:

- `scheduleLoop` is wrapped. A throw stops playback cleanly and emits a failed
  evaluation event instead of leaving `isRunning` true with no scheduler.
- `play()` never rejects. Every call site in `App.tsx` is a bare
  `audioEngine.play();`, so a rejection would be an unhandled promise rejection
  with nothing on screen. `App` subscribes to evaluation events, so a fault
  that happens *after* evaluation still reaches the error banner.

### Device gating is a block, not a warning

`tier: 'mobile-low'` was computed on every probe and read by nothing. An
iPhone — whose GPU does have `shader-f16` — was offered the 1.9 GB Gemma with
an enabled button, and the storage gate could not help, because browser quota
is tens of GB and says nothing about whether the phone can hold the weights.

`MOBILE_MAX_MODEL_MB` is 1200, which is not arbitrary: the 1129 MB
`Llama-3.2-1B-Instruct-q4f32_1-MLC` is the only build in the catalogue with
`needsF16: false`, i.e. the only model a Qualcomm Android device can run at
all. A tighter ceiling would leave every Android phone with no local option,
which is worse than one download with a clear warning. `maxStorageBufferBinding
Size` is checked too — a model that cannot fit a single binding fails during
load, long after the download.

The engine picker also waits for the probe before offering anything. It used to
render an enabled button reading "about 0 MB" in the window before the async
probe resolved, which is reachable simply by reloading with the local engine
remembered and opening the panel.

## Verification checklist

`npm test` covers the pure logic — parsers, validators, vocabulary. The list
below is what it *cannot* reach: anything needing a DOM, an AudioContext, WebGPU
or a real network. Check these by hand after touching the relevant area.

**Deployment**
- [ ] `npm run lint` and `npm test` pass
- [ ] `npm run build` succeeds and `dist/` contains hashed assets
- [ ] Deployed site loads at the project path (not just at `/`)
- [ ] Reload with the network disabled still loads the app
- [ ] The install prompt appears (needs the manifest icons)
- [ ] `caches.keys()` shows no `model-weights` after loading a model

**Engines**
- [ ] Each engine produces a pattern, and the "Written by" badge names it
- [ ] No generated pattern contains a `//` comment
- [ ] Clicking a suggestion that names a tempo moves the BPM slider to it
- [ ] Asking for "something at 90 bpm" in free text produces a 90 BPM pattern
- [ ] A local-model tweak finishes in single-digit seconds, not ~37
- [ ] With Gemini's first chain model down, the fallback happens within ~12s
      and the trace records WHY the first attempt was abandoned
- [ ] Killing the network mid-request shows an error, not a silent template
- [ ] Reloading with the local engine selected still works (worker is lazy)
- [ ] Switching models frees the previous one and loads the new one
- [ ] Cancel actually stops a download, and does NOT replace the pattern
- [ ] After a worker crash, pressing "Download model" again spawns a new one
- [ ] Backgrounding the tab mid-download does not abort it
- [ ] With no API key, Gemini is offered as unavailable rather than failing silently

**Audio**
- [ ] `s("bd*4").pan(0.3)` plays a kick, not an inaudible low tone
- [ ] `s("bd*4, ~ [sd, cp](3,8)")` plays all three parts
- [ ] Hush stops sound immediately, not after the current cycle — and logs
      `STOPPED (hush)` exactly once
- [ ] Tempo is accurate against a metronome at 120 BPM
- [ ] Generating a pattern on iPhone produces audible sound
- [ ] Typing `s("rhodes")` by hand shows the amber "Silent:" strip
- [ ] Typing `s("shaker(e,i)")` shows a readable error, not `Invalid array length`
- [ ] The number of layers you hear matches the number the trace reports
- [ ] `s("bd*4").slow(0)` does not freeze the tab
- [ ] `s("hh*8").decay(0)` and `s("bd*4").cpm(0)` keep playing, or stop with a
      visible error — never stop silently with the transport still on PLAY
- [ ] Volume, LPF and reverb are all reachable at 390px

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

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

### Installing it, and updating it without interrupting a set

The app is installable on desktop and mobile. Three decisions are load-bearing.

**Updates wait for the user.** The service worker was registered with
`registerType: 'autoUpdate'`, which is `skipWaiting` + `clientsClaim`: a newly
installed worker takes control of the *open* page immediately, while that page
is still running the previous bundle. Its lazily imported chunks — the 362 kB
`@strudel/transpiler`, fetched the first time a pattern is validated — are
addressed by a content hash the new precache no longer holds. Deploying while
somebody was playing could silently drop their validation to structural-only.
It is now `prompt`: the new version waits, `PwaControls` offers it, and the
user reloads when they are between patterns rather than mid-set.

Because we register the worker ourselves in `src/pwa.ts` (to receive the update
and offline callbacks), `injectRegister` is `null`. Leaving it on would
register the worker twice.

**Installation is offered differently per browser.** Chromium fires
`beforeinstallprompt`, which must be captured, cannot be replayed outside a
user gesture, and is single-use. Safari fires nothing and exposes no API at
all, so on iOS the only honest thing is to show the Share → Add to Home Screen
steps. `pwa.ts` resolves this to one of `prompt` / `ios-manual` / `installed` /
`unavailable`, and re-resolves it when `beforeinstallprompt` or `appinstalled`
arrives — both can fire well after load.

**`id` is derived from `base`, and that matters more than it looks.** Unlike
every other URL member, `id` resolves against the manifest's *origin* rather
than its URL. Writing `id: '.'` therefore claims `https://<user>.github.io/` —
the account root, shared by every project page that user publishes — so two of
this owner's PWAs would install as the same app.

iOS ignores the manifest entirely: the installed appearance comes from the
`apple-*` meta tags in `index.html`, and `apple-touch-icon` must be its own
square PNG because iOS does not honour `purpose: maskable`. With
`status-bar-style: black-translucent` the page runs *under* the status bar,
which is why the viewport is `viewport-fit=cover` and the layout pads with
`env(safe-area-inset-*)`. Without both, the header sits beneath the clock and
the bottom of the editor hides behind the home indicator.

`npm run verify:pwa` checks the built output against what a browser actually
requires. It exists because every one of these failures is silent — a manifest
with no icons does not error anywhere, Chrome simply never offers to install,
and you find out when a user says there is no install button. The deploy
workflow runs it before publishing.

### Variations belong to exactly one pattern

The variation list is cleared whenever the live pattern stops being the one
they were generated from, and a new batch REPLACES the old one rather than
being appended to it.

Held past their source they are worse than useless: the panel offers three
confident-looking alternatives that have nothing to do with what you can hear.
Three separate paths were producing exactly that — batches accumulated across
clicks, a cold start restored the most recent session's variations *without*
its code (the editor opens on a starter preset), and the auto-save wrote
variations into whichever session happened to be active regardless of whether
its code matched.

They survive exactly two things: pressing Run again without editing, and
clicking one of the variations on offer — its siblings are still alternatives
to the same source, which is what makes A/B-ing them during a set possible. Any
other evaluation retires them.

### Rule-based variations are built from the live pattern, and verified

`src/ai/variationEngine.ts` parses the pattern into layers and applies one
transform at a time, weighted toward MICRO edits — one layer, one parameter:
ghost a single hit, open one hat of eight, hold one note, rotate a `<a b c>`
sequence by one, nudge a gain or a pan. In a live set the useful move is
usually one small thing.

What it replaced was a fixed list of canned regexes that were presented as
variations whether or not they had changed anything. Measured against the same
techno pattern, 120 of the old generator's variations included **20 that were
byte-identical to the pattern already playing**, 23 that carried `//` comments,
and 9 with a quoted `.pan("…")` argument this engine ignores by design. Clicking
one did nothing at all, roughly one time in six.

Every candidate now has to survive four checks before it is offered: it must
differ from the source, differ from the others in its batch, still parse, and
come in under a change budget. A transform that does not apply to this pattern
is dropped, not dressed up.

**The budget is the important one.** A DJ switches into a variation over the
pattern already playing, so it has to still be recognisably the same track — a
variation that has rewritten every layer is a different track and is useless
mid-bar. `countChangedLayers()` measures it, and a micro transform that comes
back having touched more than one layer is rejected rather than trusted, even
though its own title claims otherwise.

Structural moves are offered ONLY when the mood names one. Under the default
"Dynamic & Surprising" every macro used to be eligible, so a click could return
three patterns that had each rewritten everything. Now the default is 100%
single-layer edits, and picking "Heavy Drops" or "Ambient Reverb" — an explicit
request for a big move — yields exactly one of them alongside three small ones.

The same discipline applies to the AI engines, which have no budget we can
enforce inside the model: `VARIATION_RECIPES` describes small moves rather than
"peak energy — full kick, open filter, maximum drive", the prompt says in as
many words that every other layer must come back character for character
identical, and `aiManager` measures the result and drops a variation that came
back unchanged.

### The original beat is snapshotted automatically

Requesting variations pins a card for the pattern they were made from at the
front of the list.

Without it there is no way back. The batch replaces the previous one, applying
a variation overwrites the editor, and "Undo, restore my pattern" only covers a
generate or a tweak — so trying three variations in a row left the beat you
started from gone for good. It is an ordinary card, so returning is one click,
and because it is IN the list the batch survives clicking it.

### A model download must be able to survive a phone

web-llm's Cache API backend is, in full:

```js
const result = await this.cache.match(request);
if (result === undefined) await this.cache.add(request);
```

`Cache.add()` does a single fetch and rejects on any failure with
`Failed to execute 'add' on 'Cache': Cache.add() encountered a network error`.
No retry, no resume, and nothing in that message a musician can act on. Spread
across the ~40 shards of an 879 MB model on mobile data, one hiccup anywhere
kills the whole download — which is exactly how it reached a user.

Three things address it, in order of how much they help:

- **Retry, which genuinely resumes.** `addToCache` checks the cache before
  fetching, so every shard that already arrived is skipped on the next attempt.
  Two attempts per backend, with a short backoff.
- **A storage-backend escalation.** web-llm also has an IndexedDB backend whose
  implementation retries internally. It is the escalation, not the default,
  because web-llm's own docs say the Cache API is better tested — and because
  the two are separate storage, so switching restarts the download. The UI says
  so rather than letting the progress bar quietly reset.
- **A message worth reading**, in `src/ai/modelLoadErrors.ts`: what happened,
  that the pieces already downloaded are kept, and that Gemini needs no
  download at all. Failures that another attempt cannot fix — no adapter, no
  `shader-f16` — are classified as permanent and fail immediately instead of
  making the user wait through retries.

The service worker is deliberately not in this path. `verify:pwa` fails the
build if `sw.js` ever gains a route over the model hosts or a
`setDefaultHandler`: web-llm stores the weights itself, a second route stored
every shard again (a 900 MB model occupying ~1.8 GB), and putting a handler in
front of the most fragile thing the app does has no upside.

### The model catalogue is checked against web-llm, not typed from memory

`WEBGPU_MODELS` is a hand-written subset of web-llm's 165 prebuilt models, and
three of its fields will silently do damage if they drift: a wrong `id` fails
the load only after the user has committed to a download, a wrong `vramMB`
feeds the mobile ceiling and the storage gate, and a wrong `needsF16` either
hides a model that works or offers one that cannot start.

Tests assert all three against `prebuiltAppConfig` directly — ids exist, sizes
match within 2 MB, and `needsF16` agrees with the quantisation in the id.

The default is chosen after the hardware probe, not before. `DEFAULT_MODEL_ID`
is an f16 build sized for a desktop, which a Qualcomm GPU cannot load at all —
so the picker would have opened on a blocked model. A user's own choice is
never overridden.

### The local models are constrained to a grammar, not asked nicely

web-llm supports `response_format: { type: 'grammar', grammar }`, backed by
XGrammar, which masks the sampler at every step. A token that would break the
grammar cannot be chosen.

`src/ai/strudelGrammar.ts` generates an EBNF from `src/audio/vocabulary.ts` —
the same source the engine and the prompts read — so every failure the session
traces are full of stops being repairable and becomes **unrepresentable**:
`s("rhodes")`, `s("303")`, `s("shaker(e,i)")`, `.pan("0 1")`, `.delaytime()`,
`//` comments, unclosed brackets, two source calls chained, a missing layer
separator, a dangling dot.

Two things make this safe to ship without being able to run XGrammar here:

- **It fails soft.** If the runtime rejects the grammar — unsupported, or
  malformed — the first failure disables it for the session and the request is
  retried unconstrained. The cost is one extra attempt, not a broken app.
- **It is verified offline.** `test/ebnf.ts` is a small recognizer for the same
  EBNF subset, and the tests assert that the grammar accepts every pattern the
  procedural composer produces (144 of them) and rejects each of the eleven
  failures above. Without that, "these are impossible now" would be an assertion
  with nothing behind it.

That second test is the one that matters in both directions. Constraining a
model to something our own composer's output would fail is a capability
regression wearing a safety measure's clothes — and an earlier, flatter version
of the nesting rules did exactly that, rejecting 24 of 144 patterns because it
allowed a suffix on a single hit but not on a group.

## Verification checklist

`npm test` covers the pure logic — parsers, validators, vocabulary. The list
below is what it *cannot* reach: anything needing a DOM, an AudioContext, WebGPU
or a real network. Check these by hand after touching the relevant area.

**Deployment**
- [ ] `npm run lint` and `npm test` pass
- [ ] `npm run build` succeeds and `dist/` contains hashed assets
- [ ] Deployed site loads at the project path (not just at `/`)
- [ ] Reload with the network disabled still loads the app
- [ ] `npm run verify:pwa` passes after a build
- [ ] Desktop Chrome offers to install; the installed window opens standalone
- [ ] Android Chrome installs, and long-pressing the icon shows both shortcuts
- [ ] iOS Safari: the Install pill shows the Share-sheet steps, not a button
- [ ] Installed on iPhone, the header clears the notch and the transport clears
      the home indicator
- [ ] Deploying while the app is open shows "A new version is ready" rather
      than swapping chunks underneath it
- [ ] Turning off the network shows the offline pill, and playback continues
- [ ] Clicking the taskbar icon focuses the open window instead of opening a
      second one (launch_handler)
- [ ] `caches.keys()` shows no `model-weights` after loading a model

**Engines**
- [ ] Each engine produces a pattern, and the "Written by" badge names it
- [ ] No generated pattern contains a `//` comment
- [ ] The trace says CONSTRAINED by the Strudel grammar on the first local call
- [ ] If it says the grammar was rejected, generation still works unconstrained
- [ ] Clicking a suggestion that names a tempo moves the BPM slider to it
- [ ] Every variation offered actually sounds different from what is playing
- [ ] Editing the pattern and pressing Run empties the variation list
- [ ] Clicking a variation keeps its siblings, so they can be A/B-ed
- [ ] Under the default mood every variation changes exactly one layer
- [ ] "Heavy Drops" returns one big move and three small ones
- [ ] The "Original" snapshot card restores the beat the batch was made from
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
- [ ] Killing the network mid-download gives a readable message, and pressing
      download again resumes rather than starting over
- [ ] With no API key, Gemini is offered as unavailable rather than failing silently
- [ ] On a Qualcomm phone the picker opens on a model that can actually run
- [ ] A parse failure prints what the model said, without enabling debug

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

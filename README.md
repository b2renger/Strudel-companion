# Strudel AI Live Studio 🎛️

A browser-based algorithmic music live-coding studio. You write TidalCycles-style
mini-notation, press Eval, and hear it — with an AI copilot that can write,
explain, tweak and vary patterns for you.

**Everything runs in your browser.** There is no backend, no account, and no
telemetry. It deploys as a static site to GitHub Pages, and once loaded it works
with the network cable unplugged.

---

## Quick start

Requires Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm test           # unit tests for the parsers and validators
npm run lint       # tsc --noEmit
npm run build      # static output in dist/
npm run preview    # serve the built site locally
```

`npm test` covers the pure logic — the mini-notation token parser, the pattern
validator, the sound vocabulary, and the model-output parser. Those are the
regex-heavy parts where a silent regression is both most likely and most
damaging. Anything needing a DOM, WebGPU or an AudioContext is not covered;
see the manual checklist in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## The AI engines

Four engines, chosen in the header. They are genuinely different trade-offs, not
tiers of the same thing.

| | Download | Speed | Offline | Data leaves device |
|---|---|---|---|---|
| **Built-in pattern rules** *(default)* | none | instant | yes | no |
| **Local model (WebGPU)** | 0.4–1.9 GB once | seconds to a minute | yes, once downloaded | no |
| **Chrome built-in AI** | managed by Chrome | fast | yes | no |
| **Gemini (your API key)** | none | ~1–2 s | **no** | **yes** |

**Built-in pattern rules** is the default because it is the only engine that
works with no key, no download and no network. It is *not* a language model, so
it does not truly understand your prompt — it matches genre keywords and then
*composes* a pattern: it picks a root and mode, a chord progression, a kick and
snare feel, hat density, and derives a bassline from the harmony. Every
generation is different, and everything it emits is guaranteed to play.

**Local model (WebGPU)** runs a real model in a Web Worker via
[web-llm](https://github.com/mlc-ai/web-llm). The picker measures your hardware
before offering anything, and recommends a model that will actually run. Weights
are cached by the browser, so it is a one-time download.

**Chrome built-in AI** uses Gemini Nano through the `LanguageModel` API
(Chrome 138+, desktop only — it does not exist on Android or iOS, and it needs
roughly 4 GB of video memory and 22 GB of free disk). The card is hidden
automatically where it cannot run.

**Gemini** calls Google's Generative Language API directly from your browser with
a key you paste in. The key is stored in this browser's `localStorage`, is never
sent anywhere except to Google, and can be removed with one click.

#### Where to paste the API key

Click the **AI engine chip in the header** to open the engine picker. If no key
is stored, the key form is the **first thing in that dialog**, above the engine
cards — paste and press **Save**.

Selecting **"Gemini, with your API key"** also scrolls to the field and focuses
it, and if Gemini is active without a key the app shows an **"Add API key"**
banner above the prompt bar.

`strudel.key()` in the browser console reports whether a key is saved.

> **If you use a Gemini key, restrict it.** Create a free key in
> [Google AI Studio](https://aistudio.google.com/apikey) and add an HTTP-referrer
> restriction for the domain you deploy to. A key on a public client-side site is
> only as safe as its restrictions. The free tier also allows only a handful of
> requests per minute — expect occasional rate limits.

### Which engine actually produced this pattern?

Every AI result carries the engine that really generated it, and the UI shows a
**"Written by: …"** badge above the editor. If your chosen engine fails, the app
falls back to the built-in rules — but it says so, names the reason, and offers
an Undo. No engine ever wears another's name.

### Seeing what the AI is doing

Open the browser console and type `strudel.help()`.

| Command | Shows |
|---|---|
| `strudel.report()` | everything below, in one go |
| `strudel.engines()` | which engines are available, and why not |
| `strudel.device()` | GPU, `shader-f16`, memory, storage, mobile detection |
| `strudel.models()` | which local models run here, and which is recommended |
| `strudel.cache()` | what is cached, storage used and free, whether it is persistent |
| `strudel.status()` | what the active engine is doing right now |
| `strudel.key()` | whether a Gemini key is stored (masked) |
| `strudel.debug(true)` | verbose logging of every AI call — persists across reloads |
| `strudel.cancel()` | abort the in-flight generation or download |

### Reporting a problem

Every session is recorded to an in-memory trace **whether or not verbose
logging is on**, so a problem can be captured after it happens rather than
reproduced with logging enabled. To hand someone a complete footprint:

```js
strudel.copy()    // whole session trace → clipboard, paste it into an issue
strudel.dump()    // print it instead
strudel.save()    // download it as a .txt
strudel.reset()   // clear it, then reproduce the problem cleanly
```

The trace contains an environment snapshot (browser, GPU, memory, storage,
caches, service worker, stored preferences — never the API key) followed by a
timestamped timeline:

```
00:04.132 ▶ [user]   CLICK Generate — "dark techno" | style=Techno | bpm=130
00:04.133 ▶ [ai]     METHOD: Local model (WebGPU) (webgpu-gemma)
00:04.133 ▶ [ai]     MODEL: Llama 3.2 1B — 879 MB, f16=true, ctx=4096, prompt=compact
00:04.134 ▶ [worker] Llama-3.2-1B-…-MLC is ALREADY IN CACHE — loading from disk, no download
00:06.881 ▶ [worker] ■ model resident in GPU memory — 2.7s
00:06.882   [worker] prompt (760 est. tokens, 2279 chars)
                     …the exact text sent to the model…
00:14.210 ▶ [worker] ■ generated 148 chunks / 512 chars (finish_reason=stop) — 7.3s
00:14.211   [worker] raw completion
                     …exactly what came back…
00:14.298 ▶ [ai]     RESULT accepted from Local model (WebGPU)
00:14.301 ▶ [audio]  EVALUATED OK — 5 layer(s) at 130 BPM
00:14.302 ▶ [audio]  PLAYING — ctx=running, 5 layer(s), 130 BPM
```

Failures are recorded in the same timeline, including the raw model text that
could not be parsed, uncaught errors, and network online/offline transitions.
Worker activity is forwarded to the same trace, so downloads and inference
appear inline rather than in a separate console.

`strudel.debug(true)` additionally prints all of this to the console live.
Verbose printing is on automatically in `npm run dev` and off in production, so
ordinary visitors get a clean console. Errors are always shown.

---

## Device requirements for local models

WebGPU support is not the same as being able to run a model, so the app probes
the real adapter (`navigator.gpu.requestAdapter()`) rather than trusting
`navigator.gpu` to exist.

The main constraint is the **`shader-f16`** WebGPU feature. Every `q4f16_1` build
needs it, and Qualcomm GPUs cannot provide it — which rules those builds out on
most Android phones. `Llama 3.2 1B (f32)` is included specifically as the build
that runs without f16.

The picker warns you, before any download starts, about:

- a GPU with no 16-bit shader support (and which model to use instead)
- a model larger than your device's reported memory can comfortably hold
- insufficient free browser storage (weights need ~1.6× their size while loading)
- a metered or slow connection
- running on a phone at all, where generation takes 30–90 seconds

**Selecting an engine never starts a download.** That takes a separate, explicit
button, and it can be cancelled.

---

## What the audio engine actually supports

The playback engine is a **custom Web Audio synthesiser**, not Strudel itself.
That is a deliberate trade-off: it means zero sample downloads, so audio works
completely offline. Strudel's own transpiler is used to **validate** your code,
so syntax errors are real errors and code exported to strudel.cc is code that
strudel.cc will accept.

`src/audio/vocabulary.ts` is the single source of truth for sound names — both
the synthesiser and the AI prompt are generated from it, so the model can never
be told about a sound that will not play.

**Drums** (each has its own voice): `bd` `sd` `hh` `oh` `cp` `rim` `cb` `tom`
`shaker` `cr`
Aliases: `kick`=`bd`, `snare`=`sd`, `hat`=`hh`, `clap`=`cp`, `cowbell`=`cb`,
`crash`=`cr`
Generic texture (all share one noise voice): `perc`

**Synth voices**: `piano` `rhodes` `pluck` `sawtooth` `square` `triangle` `sine`

**Mini-notation**: `bd*4` (repeat) · `bd(3,8)` (Euclidean) · `<a b c>` (alternate
per cycle) · `[bd sd] hh` (subdivide) · `bd, hh*8` (parallel) · `~` (rest) ·
`cp?` / `cp?0.3` (probability) · `a@2` (elongation)

**Effects**: `.gain()` `.lpf()` `.hpf()` `.room()` `.delay()` `.decay()`
`.pan()` `.fast()` `.slow()`

### Not supported

Be aware these are real Strudel features this engine does **not** implement:

- `chord("<Cm9 Fm7>")` — chord names
- Signals and continuous modulation: `sine.range(400, 3200)`, `perlin`, etc.
- `bd/2` — slow-division inside mini-notation (use `.slow(2)` on the layer)
- Sample banks (`.bank("RolandTR909")`) and any external sample pack
- Quoted patterns as effect arguments, e.g. `.pan("0 1")` — pass a number

Patterns using these will fail validation rather than play something wrong.

---

## Offline

- The app shell is precached by a service worker, so reloading with no network
  works.
- Fonts are system fonts. Nothing is fetched from a CDN at runtime.
- Model weights are cached by web-llm in Cache Storage. The app requests
  persistent storage before downloading and tells you if the browser refuses —
  browsers evict large caches under pressure, and Safari is especially eager, so
  you may have to download again.
- **Gemini is the one engine that needs the network.** Everything else works offline.

---

## Deploying to GitHub Pages

Push to `main`. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
builds and publishes automatically. Enable Pages once, under
**Settings → Pages → Source → GitHub Actions**.

The base path is derived from the repository name at build time, so forks and
renames need no code change:

```bash
PAGES_BASE="/your-repo-name/" npm run build   # what CI does
npm run build                                 # base '/', for a custom domain
```

CI runs `npm run lint` and `npm test` before building, so a type error or a
failing test never reaches the live site. The workflow also copies `index.html` to `404.html` (so deep links survive a
refresh) and adds `.nojekyll`.

---

## Architecture

```
src/
├── ai/
│   ├── aiManager.ts        Orchestrates all four engines. Every call returns
│   │                       AIEngineResult<T> carrying which engine really ran.
│   ├── models.ts           Local model catalogue (vram, f16 need, context)
│   ├── deviceProbe.ts      Real WebGPU adapter probe + per-model warnings
│   ├── geminiClient.ts     Direct browser → Google, plain fetch, responseSchema
│   ├── apiKeyStore.ts      Your Gemini key; documented threat model
│   ├── chromeBuiltInAi.ts  Gemini Nano via the LanguageModel API
│   ├── ruleBasedGenerator.ts  The offline template engine (12 genres)
│   ├── prompts.ts          Prompts; vocabulary generated from audio/vocabulary
│   └── outputParser.ts     Parses model output. Never invents music.
├── workers/aiWorker.ts     web-llm in a Worker, so audio never stalls
├── audio/
│   ├── vocabulary.ts       Single source of truth for sound names
│   └── validate.ts         Strudel transpiler + structural validation
├── engine/audioEngine.ts   Web Audio synthesiser, scheduler, DSP
├── utils/                  Token parser, session storage, REPL export
├── components/             React UI
└── types.ts                Shared contracts
```

**Why the split between validation and playback.** Real Strudel loads drum
samples from a CDN, which would break the offline goal. A custom synthesiser
keeps audio local; Strudel's transpiler keeps the syntax honest. You get real
error messages and truthful REPL export without shipping a sample pack.

---

## Known limitations

- Small local models (under ~1B parameters) produce simple and sometimes
  musically dull patterns, and occasionally fail to follow the output format at
  all. They are given a compact syntax card plus a worked example rather than
  the full rulebook, and a failed reply is retried once with a code-only
  prompt — but a 2B model or Gemini is noticeably better if you can run one.
  When a local model does fail, the badge says so and names the reason;
  `strudel.debug(true)` shows the raw reply that could not be parsed.
- Local generation on a phone is slow — 30 to 90 seconds is normal — and the
  browser may reclaim memory mid-run.
- The token inspector understands the subset of mini-notation listed above.
  Constructs outside it are left alone rather than edited.
- Test coverage is limited to the pure logic (`npm test`). Audio, WebGPU and
  UI behaviour are verified by hand against the checklist in `docs/`.

---

## Licence

MIT.

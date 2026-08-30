# A Strudel-only model

Status: **the data and the specification are built and verified. Nothing has
been trained.** Training and MLC compilation need PyTorch and a GPU, neither of
which exists on the machine this was written on, so those scripts are written
and documented but have never been executed. Treat every number below as
computed (they are) and every claim about a trained model as untested (it is).

## Why bother, when a 580 MB model already runs

Because on a phone it does not, reliably. The session traces are a catalogue of
size-related failures: `Cache.add()` giving up partway through an 879 MB
download, storage gates, a thirty-minute timeout, a load that dies when the
screen locks. Every one of those is a consequence of the model being large.

At roughly 9 MB the download stops being a download. It is smaller than the JS
bundle, so it precaches with the app: no progress bar, no resume logic, no
storage check, nothing to fail on mobile data.

## Where the size comes from

At small scale, **the vocabulary dominates**. Qwen2.5-0.5B is 945 MB — larger on
disk than the 1B Llama — because 151,936 tokens times 896 dimensions is about
28% of its parameters. Those tokens exist to spell Finnish, Python and emoji.

Strudel needs 140.

| | |
|---|---|
| Vocabulary | **140 real tokens** in 256 slots |
| Embedding (256 x 256) | 65,536 |
| Attention per layer | 262,144 |
| MLP per layer (SwiGLU, 704) | 540,672 |
| Per layer | 803,328 |
| x 6 layers | 4,819,968 |
| lm_head | 0 (tied) |
| **Total** | **4,885,760** |
| fp16 / q4f16_1 | **9.3 MB / 2.6 MB** |

`npm run corpus` prints this, computed from `src/ml/modelConfig.ts`. The tests
recompute it independently, and assert that a 151,936-token vocabulary would
make the model eight times larger — which is the whole argument in one line.

It is a **Llama** config, not because Llama is special but because MLC-LLM
already compiles that architecture to WebGPU. A bespoke transformer would mean
adding an architecture to the compiler before anything could run in a browser.

## The vocabulary is declared, not learned

`src/ml/tokenizer.ts` builds its vocabulary from `src/audio/vocabulary.ts` — the
same single source of truth the audio engine and the prompts read. A token the
engine cannot play cannot enter the vocabulary, so `s("rhodes")` and `s("303")`
are not merely discouraged, they are **unspellable**.

Notes are split into a pitch class and an octave digit (`eb3` -> `eb`, `3`).
Spelling each note whole would be 189 entries — more than the rest of the
vocabulary combined — for one saved position per note.

Two properties are tested against every pattern the composer can produce:

- **complete** — nothing valid encodes to `<unk>`
- **invertible** — `decode(encode(x)) === x`, byte for byte

Without the second, a trained model would be generating something that cannot be
turned back into code. There is also a test that coverage *fails* for input
outside the vocabulary, so the first proves something.

## The corpus

`npm run corpus` builds it from code already in the app — `proceduralComposer`
for whole tracks, `variationEngine` for edits of them. No scraping, no
licensing, no cleanup, and by construction it contains only patterns this engine
can play.

Nothing is admitted without passing the gates the app applies to model output:
it must validate, survive the sanitiser unchanged, and be fully covered by the
tokenizer.

```
samples          24,988
tokens total     4,159,484
tokens / sample  min 36  median 197  p95 273  max 299
complexity mix   advanced 14229, beginner 6234, intermediate 4525
rejected         invalid 0, unfixable 0, unstable 0, uncovered 0, duplicate 3812
```

Two decisions worth knowing about:

**The corpus holds the canonical form.** The composer writes `// TWEAK TIP:`
comments, which are useful to a human and forbidden in model output. Training on
the source form would teach the model to emit exactly what the rest of the app
strips, so each sample is what the sanitiser produces — and sanitising that
again has to be a no-op, or the corpus and the sanitiser disagree about what
valid output is.

**Sparse arrangements are synthesised.** The composer almost always writes five
or six layers, so its raw output is 99% "advanced" and the `<complexity:*>`
token would condition nothing. Truncating to the first 2, 3 or 4 layers gives
genuine simpler examples, and it is musically sound because the composer emits
drums first, then bass, then harmony.

Scaling is roughly linear at ~10k tokens per seed-genre with a steady 17%
duplicate rate: 400 seeds gives 4.2M tokens, 2,400 gives 24.6M. Reaching a
Chinchilla-optimal ~98M tokens needs about 9,600 seeds per genre.

## The limitation that governs everything

**A model trained on this learns the composer's distribution and nothing
beyond it.** If the grammar can generate it, the grammar can generate it
directly — faster, deterministically, at zero megabytes.

What a model buys is *interpreting prose*: mapping "dark rolling techno with
temple bells" onto musical intent. That capability is not in this corpus and
cannot be, because the corpus has no prose in it. The conditioning here is three
control tokens — genre, tempo, complexity — which is what the composer already
takes as input.

So this stack is worth building for what it is: a 9 MB model that emits valid
Strudel instantly on a phone, conditioned on structured intent. It is not a
replacement for a model that understands language, and the honest next step for
that is paired data from real use. The session trace already records the raw
material — prompt, accepted pattern, whether it was kept or undone — and wiring
that up is deliberately later work.

## Running it

```bash
npm run corpus                              # verified here
pip install -r scripts/train/requirements.txt
python scripts/train/build_tokenizer.py     # NOT run here
python scripts/train/train.py               # NOT run here — needs a GPU
scripts/train/export_mlc.sh                 # NOT run here — needs mlc_llm
```

`build_tokenizer.py` re-tokenizes the whole corpus with the HuggingFace
tokenizer and compares against the ids TypeScript computed, failing if they
disagree anywhere. The TypeScript encoder is greedy longest-match and Unigram
does Viterbi fewest-tokens; those coincide for this vocabulary, but "should
coincide" is not good enough — a single disagreement means training on one
tokenization and serving with another, and the symptom would be a model that
emits fluent nonsense.

`export_mlc.sh` produces the quantised shards, `mlc-chat-config.json` and the
WebGPU `.wasm` that web-llm loads. Hosting those and registering the model in
`src/ai/models.ts` is the last step, and is not done.

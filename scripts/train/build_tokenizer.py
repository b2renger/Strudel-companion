"""
Turns the app's vocabulary into a HuggingFace tokenizer, and PROVES the two
agree before any GPU time is spent.

The vocabulary lives in TypeScript (`src/ml/tokenizer.ts`) because the app reads
it too. This script consumes `data/tokenizer_vocab.json`, which the corpus
generator emits from that same source — nothing here restates the vocabulary.

The verification is the point. The TypeScript encoder is greedy longest-match;
a HuggingFace Unigram model does Viterbi fewest-tokens. Those coincide for this
vocabulary, but "should coincide" is not good enough: a single disagreement
means the model would be trained on one tokenization and served with another,
and the symptom would be a model that emits fluent nonsense. So every sample in
the corpus is re-tokenized here and compared against the ids the generator
already computed. A mismatch fails the build.

    python scripts/train/build_tokenizer.py
"""

import json
import pathlib
import sys

from tokenizers import Tokenizer, models

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
OUT = ROOT / "checkpoints" / "tokenizer.json"


def main() -> int:
    vocab_file = DATA / "tokenizer_vocab.json"
    corpus_file = DATA / "corpus.jsonl"
    if not vocab_file.exists() or not corpus_file.exists():
        print("Run `npm run corpus` first — it writes both files.", file=sys.stderr)
        return 1

    spec = json.loads(vocab_file.read_text())
    tokens = spec["tokens"]

    # Equal scores, so Viterbi minimises the number of pieces, which is what
    # longest-match greedy produces for a vocabulary with no ambiguous overlaps.
    tokenizer = Tokenizer(models.Unigram([(t, 0.0) for t in tokens], unk_id=3))

    mismatches = 0
    checked = 0
    with corpus_file.open() as handle:
        for line in handle:
            sample = json.loads(line)
            # The corpus stores <bos> <genre> <bpm> <complexity> ... <eos>; only
            # the pattern text is tokenized from characters.
            expected = sample["tokens"][4:-1]
            actual = tokenizer.encode(sample["code"], add_special_tokens=False).ids
            checked += 1
            if actual != expected:
                mismatches += 1
                if mismatches <= 3:
                    print(f"MISMATCH on: {sample['code'][:80]!r}", file=sys.stderr)
                    print(f"  typescript: {expected[:24]}", file=sys.stderr)
                    print(f"  tokenizers: {actual[:24]}", file=sys.stderr)

    if mismatches:
        print(
            f"\n{mismatches} of {checked} samples tokenize differently in Python and "
            "TypeScript. Training on this would produce a model that cannot be served.",
            file=sys.stderr,
        )
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    tokenizer.save(str(OUT))
    print(f"tokenizer verified on {checked:,} samples and written to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

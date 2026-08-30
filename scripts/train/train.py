"""
Trains the Strudel-only model.

Reads `data/model_config.json` and `data/corpus.jsonl`, both emitted by
`npm run corpus`, so the architecture is not restated here either.

This is small enough to be unremarkable: about 4.9M parameters over a few
million tokens. On a single consumer GPU it is minutes, not hours; on CPU it is
slow but possible. The interesting engineering was upstream — the vocabulary
and the corpus — not here.

    pip install -r scripts/train/requirements.txt
    npm run corpus
    python scripts/train/build_tokenizer.py
    python scripts/train/train.py
"""

import argparse
import json
import math
import pathlib

import torch
from torch.utils.data import DataLoader, Dataset
from transformers import LlamaConfig, LlamaForCausalLM

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
OUT = ROOT / "checkpoints" / "strudel-tiny"

PAD_ID = 0


class CorpusDataset(Dataset):
    def __init__(self, path: pathlib.Path, max_len: int):
        self.rows = []
        with path.open() as handle:
            for line in handle:
                ids = json.loads(line)["tokens"][:max_len]
                self.rows.append(ids)
        self.max_len = max_len

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, i: int):
        ids = self.rows[i]
        pad = self.max_len - len(ids)
        input_ids = torch.tensor(ids + [PAD_ID] * pad, dtype=torch.long)
        attention = torch.tensor([1] * len(ids) + [0] * pad, dtype=torch.long)
        # -100 is ignored by the loss, so the model is never trained to predict
        # padding.
        labels = torch.tensor(ids + [-100] * pad, dtype=torch.long)
        return {"input_ids": input_ids, "attention_mask": attention, "labels": labels}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--lr", type=float, default=3e-4)
    args = ap.parse_args()

    cfg_json = json.loads((DATA / "model_config.json").read_text())
    config = LlamaConfig(**cfg_json)
    model = LlamaForCausalLM(config)

    params = sum(p.numel() for p in model.parameters())
    print(f"parameters: {params:,}")
    print(f"fp16 on disk: {params * 2 / 1024 / 1024:.1f} MB")

    dataset = CorpusDataset(DATA / "corpus.jsonl", config.max_position_embeddings)
    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, drop_last=True)
    print(f"samples: {len(dataset):,}  steps/epoch: {len(loader):,}")

    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    model.to(device).train()
    optimiser = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    total_steps = len(loader) * args.epochs
    schedule = torch.optim.lr_scheduler.OneCycleLR(
        optimiser, max_lr=args.lr, total_steps=total_steps, pct_start=0.05
    )

    step = 0
    for epoch in range(args.epochs):
        running = 0.0
        for batch in loader:
            batch = {k: v.to(device) for k, v in batch.items()}
            loss = model(**batch).loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimiser.step()
            schedule.step()
            optimiser.zero_grad(set_to_none=True)

            running += loss.item()
            step += 1
            if step % 100 == 0:
                mean = running / 100
                print(f"epoch {epoch + 1} step {step}/{total_steps} loss {mean:.4f} ppl {math.exp(mean):.2f}")
                running = 0.0

    OUT.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(OUT)
    print(f"saved to {OUT}")
    print("next: scripts/train/export_mlc.sh")


if __name__ == "__main__":
    main()

#!/usr/bin/env bash
# Compiles the trained checkpoint into the WebGPU artifacts web-llm loads.
#
# web-llm cannot load a HuggingFace checkpoint. It loads MLC artifacts: quantised
# weight shards, an `mlc-chat-config.json`, and a `.wasm` of compiled WebGPU
# kernels. This is why the architecture is a Llama — MLC supports it already, so
# there is nothing to add to the compiler.
#
# Needs `mlc_llm` and its TVM runtime installed; see
# https://llm.mlc.ai/docs/install/mlc_llm.html
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/checkpoints/strudel-tiny"
OUT="$ROOT/checkpoints/strudel-tiny-MLC"
QUANT="${QUANT:-q4f16_1}"

test -d "$SRC" || { echo "No checkpoint at $SRC — run train.py first." >&2; exit 1; }
cp "$ROOT/checkpoints/tokenizer.json" "$SRC/tokenizer.json"

mkdir -p "$OUT"
mlc_llm convert_weight "$SRC" --quantization "$QUANT" -o "$OUT"
mlc_llm gen_config "$SRC" \
  --quantization "$QUANT" \
  --conv-template LM \
  --context-window-size 512 \
  -o "$OUT"
mlc_llm compile "$OUT/mlc-chat-config.json" \
  --device webgpu \
  -o "$OUT/strudel-tiny-$QUANT-webgpu.wasm"

echo
echo "Artifacts in $OUT"
du -sh "$OUT"
echo
echo "Host the weights, then register the model in src/ai/models.ts with an"
echo "appConfig entry pointing at the weight URL and the .wasm."

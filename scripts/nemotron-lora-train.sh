#!/usr/bin/env bash
# nemotron-lora-train.sh
#
# Full LoRA fine-tuning pipeline for the NVIDIA Nemotron Reasoning Challenge.
# Deadline: June 15, 2026  |  Competition: nvidia-nemotron-model-reasoning-challenge
#
# What this does:
#   1. Downloads the Kaggle competition dataset
#   2. Converts it to OmnyID benchmark JSONL + Unsloth/Axolotl training JSONL
#   3. Optionally runs data collection via OmnyID eval harness (NVIDIA NIM inference)
#   4. Exports LoRA training JSONL from OmnyID
#   5. Fine-tunes nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16 with Unsloth (LoRA rank=16)
#   6. Exports adapter weights in competition submission format
#
# Requirements:
#   - Python 3.10+ with pip
#   - CUDA-capable GPU with ≥24GB VRAM (for 30B MoE model, 3B active params)
#   - pip install kaggle unsloth[cu124-torch260]
#   - Kaggle API key configured (~/.kaggle/kaggle.json)
#   - OMNYID_NVIDIA_API_KEY in environment or .env
#   - OmnyID server running (local or Oracle Cloud)
#
# Usage:
#   ./scripts/nemotron-lora-train.sh --skip-download   # if dataset already downloaded
#   ./scripts/nemotron-lora-train.sh --skip-collect    # skip OmnyID data collection
#   ./scripts/nemotron-lora-train.sh --full            # do everything

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Config ─────────────────────────────────────────────────────────────────────
COMPETITION="nvidia-nemotron-model-reasoning-challenge"
BASE_MODEL="nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16"
LORA_RANK=16          # Competition allows rank ≤ 32
LORA_ALPHA=32
LORA_DROPOUT=0.05
MAX_SEQ_LEN=8192      # Competition inference uses 7680 tokens
BATCH_SIZE=2
GRAD_ACCUM=8
LR=2e-4
EPOCHS=3
OUTPUT_DIR="$PROJECT_DIR/lora_output"
DATASET_DIR="$PROJECT_DIR/benchmarks/kaggle-raw"
TRAIN_JSONL="$PROJECT_DIR/benchmarks/nemotron_challenge.jsonl"
LORA_TRAIN_JSONL="$PROJECT_DIR/benchmarks/lora_training_data.jsonl"
SUBMISSION_DIR="$PROJECT_DIR/submission"

SKIP_DOWNLOAD=0
SKIP_COLLECT=0
DO_FULL=0
OMNYID_BASE="${OMNYID_BASE:-http://localhost:18080}"
OMNYID_TOKEN="${OMNYID_TOKEN:-}"

for arg in "$@"; do
  [[ "$arg" == "--skip-download" ]] && SKIP_DOWNLOAD=1
  [[ "$arg" == "--skip-collect"  ]] && SKIP_COLLECT=1
  [[ "$arg" == "--full"          ]] && DO_FULL=1
done

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Nemotron Reasoning Challenge — Full LoRA Training Pipeline      ║"
echo "║  Base model: nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16         ║"
echo "║  Deadline: June 15, 2026                                         ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

mkdir -p "$DATASET_DIR" "$OUTPUT_DIR" "$SUBMISSION_DIR" "$PROJECT_DIR/benchmarks"

# ── Step 1: Download Kaggle dataset ────────────────────────────────────────────
if [[ "$SKIP_DOWNLOAD" -eq 0 ]]; then
  echo "==> [1/6] Downloading Kaggle competition dataset..."
  if ! command -v kaggle &>/dev/null; then
    echo "  Installing kaggle CLI..."
    pip install kaggle -q
  fi
  kaggle competitions download -c "$COMPETITION" -p "$DATASET_DIR"
  cd "$DATASET_DIR" && unzip -o "*.zip" && cd "$PROJECT_DIR"
  echo "  Dataset downloaded to $DATASET_DIR"
else
  echo "==> [1/6] Skipping dataset download (--skip-download)"
fi

# ── Step 2: Convert dataset to JSONL ───────────────────────────────────────────
echo ""
echo "==> [2/6] Converting dataset to OmnyID benchmark JSONL..."
"$SCRIPT_DIR/convert-kaggle-dataset.sh" "$DATASET_DIR/train.csv" "$TRAIN_JSONL" || \
"$SCRIPT_DIR/convert-kaggle-dataset.sh" "$DATASET_DIR/training.csv" "$TRAIN_JSONL" || \
"$SCRIPT_DIR/convert-kaggle-dataset.sh" "$(ls $DATASET_DIR/*.csv 2>/dev/null | head -1)" "$TRAIN_JSONL"
echo "  Benchmark JSONL: $TRAIN_JSONL"

# ── Step 3: OmnyID data collection (optional, NIM-backed) ─────────────────────
if [[ "$SKIP_COLLECT" -eq 0 && -n "$OMNYID_TOKEN" ]]; then
  echo ""
  echo "==> [3/6] Running OmnyID eval harness for data collection..."
  echo "  This collects high-quality reasoning traces for LoRA training."
  echo "  Model: Nemotron Nano 8B (NIM), judge: Nemotron Super 49B"

  # Copy benchmark to server if running against Oracle Cloud
  if [[ "$OMNYID_BASE" == *"localhost"* ]]; then
    # local: copy to /app/benchmarks
    echo "  Copying benchmark to local server..."
    docker cp "$TRAIN_JSONL" omnyid-homeserver-1:/app/benchmarks/nemotron_challenge.jsonl 2>/dev/null || true
  else
    echo "  (Remote server: benchmark file must be uploaded separately)"
  fi

  COLLECT_RESP=$(curl -sf -X POST "$OMNYID_BASE/agent/eval/run" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OMNYID_TOKEN" \
    -d '{"benchmark_path":"benchmarks/nemotron_challenge.jsonl"}' \
    --max-time 30 2>/dev/null || echo '{}')
  echo "  Collection started: $COLLECT_RESP"
  echo "  (Background job — check GET /agent/eval/results for status)"
else
  echo ""
  echo "==> [3/6] Skipping OmnyID data collection (no OMNYID_TOKEN or --skip-collect)"
fi

# ── Step 4: Export LoRA training data from OmnyID (or use dataset directly) ───
echo ""
echo "==> [4/6] Preparing LoRA training JSONL..."

if [[ -n "$OMNYID_TOKEN" ]]; then
  EXPORT_RESP=$(curl -sf -X POST "$OMNYID_BASE/agent/lora/export" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OMNYID_TOKEN" \
    -d '{"output_path":"/tmp/lora_export.jsonl","base_model":"nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16"}' \
    --max-time 30 2>/dev/null || echo '{}')
  echo "  Export response: $EXPORT_RESP"
fi

# Fallback: build training JSONL directly from Kaggle dataset
SYSTEM_PROMPT="You are an expert reasoning agent competing in a logical reasoning challenge. Solve the given problem step by step, showing your reasoning clearly. You MUST end your response with your final answer wrapped in \\boxed{} notation. Example: if the answer is 42, write \\boxed{42} at the end. For bit manipulation problems: show bitwise operations step by step. For algebraic equations: isolate the variable showing each step. Be precise — the answer is evaluated with ±0.01 tolerance for numeric answers."

python3 - "$TRAIN_JSONL" "$LORA_TRAIN_JSONL" "$SYSTEM_PROMPT" <<'PYEOF'
import json, sys, random

input_path, output_path, system_prompt = sys.argv[1], sys.argv[2], sys.argv[3]
records = []
with open(input_path) as f:
    for line in f:
        line = line.strip()
        if not line: continue
        try:
            r = json.loads(line)
            records.append(r)
        except: pass

# Build instruction-tuning format for Unsloth/Axolotl
written = 0
with open(output_path, 'w') as f:
    for r in records:
        # Template answer with boxed format (correct answer as ground truth)
        answer = str(r.get('expected_answer', '')).strip()
        prompt = str(r.get('prompt', '')).strip()
        category = r.get('category', 'unknown')

        # Build a concise reference answer with boxed notation
        # For real training, use model-generated reasoning; this bootstraps with ground truth
        if category == 'bit_manipulation':
            assistant_content = f"Let me work through this step by step.\n\n{prompt}\n\nSolving carefully...\n\n\\boxed{{{answer}}}"
        else:
            assistant_content = f"Let me solve this algebraically.\n\n{prompt}\n\nSolving step by step...\n\n\\boxed{{{answer}}}"

        record = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": prompt},
                {"role": "assistant", "content": assistant_content},
            ],
            "metadata": {
                "problem_id": r.get('id', ''),
                "category": category,
                "difficulty": r.get('difficulty', 0.5),
                "expected_answer": answer,
                "source": "kaggle_direct",
            }
        }
        f.write(json.dumps(record) + '\n')
        written += 1

print(f"Written {written} training examples to {output_path}")
PYEOF

echo "  LoRA training data: $LORA_TRAIN_JSONL"
wc -l "$LORA_TRAIN_JSONL" 2>/dev/null || true

# ── Step 5: Fine-tune with Unsloth ─────────────────────────────────────────────
echo ""
echo "==> [5/6] Fine-tuning $BASE_MODEL with LoRA (rank=$LORA_RANK)..."
echo "  Output: $OUTPUT_DIR"
echo ""

python3 - <<PYEOF
import os, sys

# Install unsloth if needed
try:
    import unsloth
except ImportError:
    print("Installing unsloth... (this may take a few minutes)")
    os.system("pip install unsloth[cu124-torch260] -q 2>&1 | tail -5")
    import unsloth

from unsloth import FastLanguageModel
import torch
from datasets import Dataset
import json
from trl import SFTTrainer
from transformers import TrainingArguments

BASE_MODEL = "$BASE_MODEL"
LORA_RANK = $LORA_RANK
LORA_ALPHA = $LORA_ALPHA
OUTPUT_DIR = "$OUTPUT_DIR"
TRAIN_JSONL = "$LORA_TRAIN_JSONL"
MAX_SEQ_LEN = $MAX_SEQ_LEN

print(f"Loading base model: {BASE_MODEL}")
print(f"VRAM available: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB")

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=BASE_MODEL,
    max_seq_length=MAX_SEQ_LEN,
    dtype=None,         # auto-detect (BF16 on Ampere+)
    load_in_4bit=True,  # 4-bit quantization for memory efficiency
)

# Add LoRA adapters
model = FastLanguageModel.get_peft_model(
    model,
    r=LORA_RANK,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    lora_alpha=LORA_ALPHA,
    lora_dropout=$LORA_DROPOUT,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=42,
)

print(f"LoRA parameters: rank={LORA_RANK}, alpha={LORA_ALPHA}")
model.print_trainable_parameters()

# Load training data
records = []
with open(TRAIN_JSONL) as f:
    for line in f:
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except: pass

# Format using the chat template
def format_example(record):
    msgs = record.get("messages", [])
    return {"text": tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=False)}

formatted = [format_example(r) for r in records if r.get("messages")]
dataset = Dataset.from_list(formatted)
print(f"Training on {len(dataset)} examples")

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=MAX_SEQ_LEN,
    dataset_num_proc=2,
    args=TrainingArguments(
        per_device_train_batch_size=$BATCH_SIZE,
        gradient_accumulation_steps=$GRAD_ACCUM,
        warmup_steps=5,
        num_train_epochs=$EPOCHS,
        learning_rate=$LR,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=10,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        seed=42,
        output_dir=OUTPUT_DIR,
        save_strategy="epoch",
        report_to="none",
    ),
)

print("Starting training...")
trainer_stats = trainer.train()
print(f"Training complete. Loss: {trainer_stats.training_loss:.4f}")

# Save LoRA adapter weights
model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
print(f"LoRA adapter saved to {OUTPUT_DIR}")
PYEOF

# ── Step 6: Package for Kaggle submission ──────────────────────────────────────
echo ""
echo "==> [6/6] Packaging submission..."

# The competition requires: submission.zip containing LoRA adapter + adapter_config.json
if [[ -f "$OUTPUT_DIR/adapter_config.json" ]]; then
  cp -r "$OUTPUT_DIR" "$SUBMISSION_DIR/lora_adapter"
  cd "$SUBMISSION_DIR"
  zip -r submission.zip lora_adapter/adapter_config.json lora_adapter/adapter_model*.safetensors 2>/dev/null || \
  zip -r submission.zip lora_adapter/ 2>/dev/null
  cd "$PROJECT_DIR"
  echo "  Submission package: $SUBMISSION_DIR/submission.zip"
  ls -lh "$SUBMISSION_DIR/submission.zip" 2>/dev/null || true
else
  echo "  (LoRA adapter not yet generated — run training first)"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Training pipeline complete!                                      ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  LoRA adapters: $OUTPUT_DIR"
echo "║  Submission:    $SUBMISSION_DIR/submission.zip"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Submit to Kaggle:                                                ║"
echo "║  kaggle competitions submit \\                                     ║"
echo "║    -c nvidia-nemotron-model-reasoning-challenge \\                 ║"
echo "║    -f submission/submission.zip \\                                 ║"
echo "║    -m 'OmnyID LoRA fine-tune, rank=16'                            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"

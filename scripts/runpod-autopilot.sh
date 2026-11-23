#!/usr/bin/env bash
# runpod-autopilot.sh
#
# Fully autonomous Nemotron training pipeline for RunPod.
# Run this once — it drives Phase 0 → Phase 1 → Phase 2 → submission pack.
# No Claude Code or external orchestration needed after launch.
#
# Usage (from /workspace on the RunPod pod):
#   chmod +x /workspace/runpod-autopilot.sh
#   nohup /workspace/runpod-autopilot.sh > /workspace/autopilot.log 2>&1 &
#   tail -f /workspace/autopilot.log
#
# To resume after an interruption, just re-run — all phases checkpoint.
#
# Phase flow:
#   Phase 0  →  CoT data generation (9 500 Kaggle problems, teacher models)
#               Triggers Phase 1 once PASS_THRESHOLD examples collected
#   Phase 1  →  SFT fine-tune on CoT data
#   Phase 2  →  GRPO RL on SFT checkpoint
#   Pack     →  Zip adapter weights for Kaggle submission

set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────────────
WORKSPACE="/workspace"
ENV_FILE="$WORKSPACE/runpod.env"
TRAINING_DATA="$WORKSPACE/training_data"
COT_JSONL="$TRAINING_DATA/cot_sft.jsonl"
STATS_FILE="$TRAINING_DATA/phase0_stats.json"
CHECKPOINT_FILE="$TRAINING_DATA/phase0_checkpoint.json"
LORA_OUTPUT="${LORA_OUTPUT:-$WORKSPACE/lora_output}"
SFT_SUBDIR="${SFT_SUBDIR:-sft_v1}"
GRPO_SUBDIR="${GRPO_SUBDIR:-grpo_v1}"
SFT_OUTPUT_DIR="$LORA_OUTPUT/$SFT_SUBDIR"
GRPO_OUTPUT_DIR="$LORA_OUTPUT/$GRPO_SUBDIR"
SUBMISSION_DIR="$WORKSPACE/submission"
LOG_DIR="$WORKSPACE/logs"
TMP_DIR="$WORKSPACE/tmp"
PREPARE_SFT_SCRIPT="$WORKSPACE/prepare_sft_data.py"
RAW_SFT_DATA="$TRAINING_DATA/cot_sft.jsonl"
CLEAN_SFT_DATA_DIR="$TRAINING_DATA/cleaned"
CLEAN_SFT_DATA="$CLEAN_SFT_DATA_DIR/cot_sft.cleaned.jsonl"
SFT_DONE_FLAG="$SFT_OUTPUT_DIR/done.flag"
GRPO_DONE_FLAG="$GRPO_OUTPUT_DIR/done.flag"

# Phase 0 triggers Phase 1 once this many quality examples are collected.
# 6500 = target for 0.96 score (2-reflection pipeline, compound bit-solver).
# Override: PASS_THRESHOLD=20 ./runpod-autopilot.sh   (smoke test only)
PASS_THRESHOLD="${PASS_THRESHOLD:-6500}"

# Phase 0 workers (concurrent API calls). 8 is safe for OpenRouter rate limits.
PHASE0_WORKERS="${PHASE0_WORKERS:-8}"

# Collection round tag written into each example's metadata (incremented on re-run).
PHASE0_ROUND="${PHASE0_ROUND:-1}"
RESUME_FROM_SFT_IF_AVAILABLE="${RESUME_FROM_SFT_IF_AVAILABLE:-1}"

# Stable GRPO defaults validated on single H100 80GB with NemotronH + Unsloth.
GRPO_STEPS="${GRPO_STEPS:-400}"
GRPO_GROUP_SIZE="${GRPO_GROUP_SIZE:-2}"
GRPO_MAX_SEQ_LEN="${GRPO_MAX_SEQ_LEN:-768}"
GRPO_MAX_PROMPT_LEN="${GRPO_MAX_PROMPT_LEN:-512}"
GRPO_MAX_COMPLETION_LEN="${GRPO_MAX_COMPLETION_LEN:-32}"
GRPO_GRAD_ACCUM="${GRPO_GRAD_ACCUM:-1}"
GRPO_LEARNING_RATE="${GRPO_LEARNING_RATE:-2e-6}"
GRPO_BETA="${GRPO_BETA:-0.02}"
GRPO_TEMPERATURE="${GRPO_TEMPERATURE:-0.6}"
PREPARE_SFT_MAX_PER_ID="${PREPARE_SFT_MAX_PER_ID:-2}"

# Kaggle competition slug
COMPETITION="nvidia-nemotron-model-reasoning-challenge"

mkdir -p "$TRAINING_DATA" "$LORA_OUTPUT" "$SUBMISSION_DIR" "$LOG_DIR" "$TMP_DIR"

# ── Load env ───────────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[ERROR] $ENV_FILE not found. Upload runpod.env to /workspace first."
  exit 1
fi
set -o allexport
# shellcheck disable=SC1090
source "$ENV_FILE"
set +o allexport

export TMPDIR="${TMPDIR:-$TMP_DIR}"
export TMP="$TMPDIR"
export TEMP="$TMPDIR"
export SFT_OUTPUT_DIR
export GRPO_OUTPUT_DIR
export HF_HOME="${HF_HOME:-$WORKSPACE/.hf_cache}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$WORKSPACE/.cache}"
export HF_HUB_CACHE="${HF_HUB_CACHE:-$HF_HOME/hub}"
export HUGGINGFACE_HUB_CACHE="${HUGGINGFACE_HUB_CACHE:-$HF_HOME/hub}"
export TRANSFORMERS_CACHE="${TRANSFORMERS_CACHE:-$HF_HOME/transformers}"
export HF_DATASETS_CACHE="${HF_DATASETS_CACHE:-$HF_HOME/datasets}"

mkdir -p "$HF_HOME" "$XDG_CACHE_HOME" "$HF_HUB_CACHE" "$TRANSFORMERS_CACHE" "$HF_DATASETS_CACHE"

# ── Helpers ────────────────────────────────────────────────────────────────────
log() { echo "[$(date '+%H:%M:%S')] $*"; }
fail_phase() {
  local phase_name="$1"
  local log_file="$2"
  log "[ERROR] ${phase_name} failed. Last 80 lines from ${log_file}:"
  tail -n 80 "$log_file" 2>/dev/null || true
  exit 1
}
pack_submission_zip() {
  local adapter_dir="$1"
  local submission_zip="$2"

  rm -f "$submission_zip"

  if command -v zip >/dev/null 2>&1; then
    (
      cd "$adapter_dir"
      zip -r "$submission_zip" . -i "adapter_model.safetensors" "adapter_config.json" \
        "tokenizer*" "special_tokens_map.json" 2>/dev/null || \
      zip -r "$submission_zip" .
    )
    return $?
  fi

  log "      'zip' not found; using Python zipfile fallback."
  ADAPTER_DIR_PY="$adapter_dir" SUBMISSION_ZIP_PY="$submission_zip" python3 - <<'PYEOF'
import os
import sys
import zipfile
from pathlib import Path

adapter_dir = Path(os.environ["ADAPTER_DIR_PY"])
submission_zip = Path(os.environ["SUBMISSION_ZIP_PY"])
preferred = [
    "adapter_model.safetensors",
    "adapter_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
]

files = [path for path in preferred if (adapter_dir / path).exists()]
if not files:
    files = [str(path.relative_to(adapter_dir)) for path in adapter_dir.rglob("*") if path.is_file()]

if not files:
    print(f"[WARN] No files found to package in {adapter_dir}", file=sys.stderr)
    sys.exit(1)

submission_zip.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(submission_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for rel_path in files:
        zf.write(adapter_dir / rel_path, arcname=rel_path)
PYEOF
}
kaggle_submission_auth_ready() {
  mkdir -p "$HOME/.kaggle"
  cat > "$HOME/.kaggle/kaggle.json" <<EOF
{"username":"${KAGGLE_USERNAME}","key":"${KAGGLE_KEY}"}
EOF
  chmod 600 "$HOME/.kaggle/kaggle.json"

  kaggle competitions submissions -c "$COMPETITION" >/dev/null 2>&1
}
describe_hf_token_scope() {
  if [[ -z "${HF_TOKEN:-}" ]]; then
    log "    [WARN] HF_TOKEN not set."
    return 0
  fi

  python3 - <<'PYEOF'
import os
from huggingface_hub import HfApi

token = os.environ.get("HF_TOKEN", "").strip()
if not token:
    raise SystemExit(0)

try:
    who = HfApi(token=token).whoami(token=token)
    auth = who.get("auth", {})
    access = auth.get("accessToken", {})
    role = access.get("role", "unknown")
    print(f"    HF token namespace: {who.get('name', 'unknown')}")
    print(f"    HF token role: {role}")
    fine = access.get("fineGrained", {})
    scoped = fine.get("scoped", [])
    if scoped:
        perms = sorted({perm for scope in scoped for perm in scope.get("permissions", [])})
        print(f"    HF token scoped permissions: {', '.join(perms)}")
except Exception as exc:
    print(f"    [WARN] Unable to inspect HF token scope: {exc}")
PYEOF
}
passed_so_far() {
  if [[ -f "$COT_JSONL" ]]; then
    wc -l < "$COT_JSONL" | tr -d ' '
  else
    echo 0
  fi
}

# ── Dependency check ───────────────────────────────────────────────────────────
log "=== Nemotron RunPod Autopilot ==="
log "PASS_THRESHOLD = $PASS_THRESHOLD"
log "PHASE0_WORKERS = $PHASE0_WORKERS"
log "RESUME_FROM_SFT_IF_AVAILABLE = $RESUME_FROM_SFT_IF_AVAILABLE"
log "GRPO_GROUP_SIZE = $GRPO_GROUP_SIZE"
log "GRPO_MAX_SEQ_LEN = $GRPO_MAX_SEQ_LEN"
log "GRPO_MAX_PROMPT_LEN = $GRPO_MAX_PROMPT_LEN"
log "GRPO_MAX_COMPLETION_LEN = $GRPO_MAX_COMPLETION_LEN"
log "GRPO_GRAD_ACCUM = $GRPO_GRAD_ACCUM"
log "GRPO_LEARNING_RATE = $GRPO_LEARNING_RATE"
log "GRPO_BETA = $GRPO_BETA"
log "GRPO_TEMPERATURE = $GRPO_TEMPERATURE"
log "PREPARE_SFT_MAX_PER_ID = $PREPARE_SFT_MAX_PER_ID"
log "SFT_OUTPUT_DIR = $SFT_OUTPUT_DIR"
log "GRPO_OUTPUT_DIR = $GRPO_OUTPUT_DIR"
describe_hf_token_scope

if ! python3 -c "import openai" 2>/dev/null; then
  log "Installing openai..."
  pip install openai -q
fi

# ── Step 1: Kaggle dataset ─────────────────────────────────────────────────────
# NOTE: The 7 LoRA examples collected on Oracle Cloud (simple arithmetic benchmark)
# are WRONG for this competition. This autopilot generates fresh CoT data from the
# actual Kaggle train.csv (pattern-discovery problems with demonstration pairs).
# Do NOT copy /benchmarks/sample.jsonl or any Oracle Cloud data to /workspace.

TRAIN_CSV="$WORKSPACE/kaggle-data/train.csv"
if [[ ! -f "$TRAIN_CSV" ]]; then
  log "[1/5] Downloading Kaggle dataset..."
  if ! python3 -c "import kaggle" 2>/dev/null; then
    pip install kaggle -q
  fi
  mkdir -p "$WORKSPACE/kaggle-data"
  kaggle_submission_auth_ready || true
  kaggle competitions download -c "$COMPETITION" -p "$WORKSPACE/kaggle-data"
  cd "$WORKSPACE/kaggle-data" && unzip -o "*.zip" && cd "$WORKSPACE"
  log "    Dataset ready at $WORKSPACE/kaggle-data/"
else
  log "[1/5] Kaggle dataset already present — skipping download."
fi

# ── Step 2: Phase 0 — CoT generation ──────────────────────────────────────────
CURRENT_PASSED=$(passed_so_far)
log "[2/5] Phase 0: CoT data generation (target: $PASS_THRESHOLD quality examples)"
log "      Currently have: $CURRENT_PASSED examples in $COT_JSONL"

if [[ "$RESUME_FROM_SFT_IF_AVAILABLE" == "1" && -f "$SFT_DONE_FLAG" ]]; then
  log "      Existing SFT checkpoint detected — skipping further Phase 0 collection for resume."
elif [[ "$CURRENT_PASSED" -ge "$PASS_THRESHOLD" ]]; then
  log "      Already at/above threshold — skipping Phase 0 generation."
else
  log "      Starting phase0-cot-generate.py (workers=$PHASE0_WORKERS)..."
  log "      Will stop automatically once $PASS_THRESHOLD examples pass quality gate."

  # Phase 0 run strategy:
  #   Pass 1  — processes all unprocessed problems (resuming from checkpoint)
  #   Pass 2  — retries all previously failed problems (API may have recovered)
  # Both passes use 2-reflection quality gate (no verifier) for max throughput.
  # Add --verify to the command for a slower 3-reflection final top-up run.

  run_phase0_pass() {
    local extra_flags="$1"
    local log_suffix="$2"
    PYTHONUNBUFFERED=1 python3 "$WORKSPACE/phase0-cot-generate.py" \
      --workers "$PHASE0_WORKERS" \
      --round   "$PHASE0_ROUND"  \
      $extra_flags \
      >> "$LOG_DIR/phase0${log_suffix}.log" 2>&1 &
    echo $!
  }

  log "      Pass 1: unprocessed problems (round $PHASE0_ROUND)..."
  PHASE0_PID=$(run_phase0_pass "" "")
  PHASE0_ROUND=$((PHASE0_ROUND + 1))

  log "      phase0 PID=$PHASE0_PID — monitoring for threshold..."
  LAST_REPORT=0
  while kill -0 "$PHASE0_PID" 2>/dev/null; do
    CURRENT_PASSED=$(passed_so_far)
    if [[ "$CURRENT_PASSED" -ge "$PASS_THRESHOLD" ]]; then
      log "      Threshold reached ($CURRENT_PASSED >= $PASS_THRESHOLD). Stopping Phase 0."
      kill "$PHASE0_PID" 2>/dev/null || true
      wait "$PHASE0_PID" 2>/dev/null || true
      break
    fi
    # Log progress every 100 new examples
    if [[ "$CURRENT_PASSED" -ge $((LAST_REPORT + 100)) ]]; then
      LAST_REPORT=$CURRENT_PASSED
      log "      Phase 0 progress: $CURRENT_PASSED / $PASS_THRESHOLD quality examples"
    fi
    sleep 10
  done

  CURRENT_PASSED=$(passed_so_far)
  log "      Pass 1 finished. Quality examples so far: $CURRENT_PASSED"

  # Pass 2: retry previously failed problems (API keys may have recovered).
  # Skip if already at threshold.
  if [[ "$CURRENT_PASSED" -lt "$PASS_THRESHOLD" ]]; then
    log "      Pass 2: retrying failed problems (round $PHASE0_ROUND)..."
    PHASE0_PID=$(run_phase0_pass "--retry-failed" "_retry")
    PHASE0_ROUND=$((PHASE0_ROUND + 1))

    LAST_REPORT=$CURRENT_PASSED
    while kill -0 "$PHASE0_PID" 2>/dev/null; do
      CURRENT_PASSED=$(passed_so_far)
      if [[ "$CURRENT_PASSED" -ge "$PASS_THRESHOLD" ]]; then
        log "      Threshold reached on retry pass ($CURRENT_PASSED >= $PASS_THRESHOLD). Stopping."
        kill "$PHASE0_PID" 2>/dev/null || true
        wait "$PHASE0_PID" 2>/dev/null || true
        break
      fi
      if [[ "$CURRENT_PASSED" -ge $((LAST_REPORT + 100)) ]]; then
        LAST_REPORT=$CURRENT_PASSED
        log "      Pass 2 progress: $CURRENT_PASSED / $PASS_THRESHOLD"
      fi
      sleep 10
    done
    log "      Pass 2 finished. Total quality examples: $(passed_so_far)"
  fi

  CURRENT_PASSED=$(passed_so_far)
  log "      Phase 0 complete. Total quality examples: $CURRENT_PASSED / $PASS_THRESHOLD"
fi

if [[ "$(passed_so_far)" -lt 20 ]]; then
  log "[ERROR] Fewer than 20 examples collected — check $LOG_DIR/phase0.log for backend errors."
  exit 1
fi

# ── Step 3: Phase 1 — SFT fine-tuning ─────────────────────────────────────────
if [[ -f "$PREPARE_SFT_SCRIPT" && -f "$RAW_SFT_DATA" ]]; then
  log "[2.5/5] Preparing cleaned SFT corpus..."
  mkdir -p "$CLEAN_SFT_DATA_DIR"
  if python3 "$PREPARE_SFT_SCRIPT" --max-per-id "$PREPARE_SFT_MAX_PER_ID" > "$LOG_DIR/prepare_sft.log" 2>&1; then
    if [[ -f "$CLEAN_SFT_DATA" ]]; then
      log "      Cleaned corpus ready: $CLEAN_SFT_DATA"
      export SFT_DATA_FILE="$CLEAN_SFT_DATA"
    fi
  else
    log "      [WARN] Corpus preparation failed; falling back to raw Phase 0 data."
    tail -n 80 "$LOG_DIR/prepare_sft.log" 2>/dev/null || true
  fi
fi

if [[ -f "$SFT_DONE_FLAG" ]]; then
  log "[3/5] Phase 1 (SFT) already complete — skipping."
else
  log "[3/5] Phase 1: SFT fine-tuning on $(passed_so_far) CoT examples..."

  # Install Unsloth + TRL only when needed (large install)
  if ! python3 -c "import unsloth" 2>/dev/null; then
    log "      Installing unsloth + trl (this takes ~2 min)..."
    pip install "unsloth[cu124-torch260]" trl -q
  fi

  # Fix torchao/peft version conflict: peft>=0.15 added a strict torchao version
  # check that fails with torch 2.6.0. Pinning peft==0.14.0 resolves this.
  PEFT_VER=$(python3 -c "import peft; print(peft.__version__)" 2>/dev/null || echo "none")
  if [[ "$PEFT_VER" > "0.14.0" ]] || [[ "$PEFT_VER" == "none" ]]; then
    log "      Pinning peft==0.14.0 (fixes torchao compatibility with torch 2.6)..."
    pip install "peft==0.14.0" "torchao==0.8.0" -q 2>/dev/null || true
  fi

  if ! env \
    OUTPUT_DIR="$LORA_OUTPUT" \
    SFT_SUBDIR="$SFT_SUBDIR" \
    python3 "$WORKSPACE/phase1-sft-train.py" \
    > "$LOG_DIR/phase1.log" 2>&1; then
    fail_phase "Phase 1 (SFT)" "$LOG_DIR/phase1.log"
  fi

  touch "$SFT_DONE_FLAG"
  log "      Phase 1 complete. Adapter at: $SFT_OUTPUT_DIR/"
fi

# ── Step 4: Phase 2 — GRPO RL ─────────────────────────────────────────────────
if [[ -f "$GRPO_DONE_FLAG" ]]; then
  log "[4/5] Phase 2 (GRPO) already complete — skipping."
else
  log "[4/5] Phase 2: GRPO RL training on top of SFT checkpoint..."
  log "      GRPO config: steps=$GRPO_STEPS, k=$GRPO_GROUP_SIZE, seq=$GRPO_MAX_SEQ_LEN, prompt=$GRPO_MAX_PROMPT_LEN, completion=$GRPO_MAX_COMPLETION_LEN, grad_accum=$GRPO_GRAD_ACCUM"

  if ! python3 -c "import trl" 2>/dev/null; then
    pip install trl -q
  fi

  if ! env \
    SFT_INPUT_DIR="$SFT_OUTPUT_DIR" \
    GRPO_OUTPUT_DIR="$GRPO_OUTPUT_DIR" \
    GRPO_STEPS="$GRPO_STEPS" \
    GRPO_GROUP_SIZE="$GRPO_GROUP_SIZE" \
    GRPO_LEARNING_RATE="$GRPO_LEARNING_RATE" \
    GRPO_BETA="$GRPO_BETA" \
    GRPO_TEMPERATURE="$GRPO_TEMPERATURE" \
    GRPO_MAX_SEQ_LEN="$GRPO_MAX_SEQ_LEN" \
    GRPO_MAX_PROMPT_LEN="$GRPO_MAX_PROMPT_LEN" \
    GRPO_MAX_COMPLETION_LEN="$GRPO_MAX_COMPLETION_LEN" \
    GRPO_GRAD_ACCUM="$GRPO_GRAD_ACCUM" \
    PYTHONUNBUFFERED=1 \
    python3 "$WORKSPACE/phase2-grpo-train.py" \
    > "$LOG_DIR/phase2.log" 2>&1; then
    fail_phase "Phase 2 (GRPO)" "$LOG_DIR/phase2.log"
  fi

  touch "$GRPO_DONE_FLAG"
  log "      Phase 2 complete. Adapter at: $GRPO_OUTPUT_DIR/"
fi

# ── Step 5: Pack submission ────────────────────────────────────────────────────
log "[5/5] Packing Kaggle submission..."

ADAPTER_DIR="$GRPO_OUTPUT_DIR"
SUBMISSION_ZIP="$SUBMISSION_DIR/submission.zip"

cd "$ADAPTER_DIR"
cd "$WORKSPACE"

if ! pack_submission_zip "$ADAPTER_DIR" "$SUBMISSION_ZIP"; then
  log "[WARN] Submission zip creation failed."
fi

if [[ -f "$SUBMISSION_ZIP" ]]; then
  log "    Submission packed: $SUBMISSION_ZIP ($(du -sh "$SUBMISSION_ZIP" | cut -f1))"
else
  log "[WARN] Submission zip not created — check $ADAPTER_DIR contents."
fi

if kaggle_submission_auth_ready; then
  log "    Kaggle submission auth check passed."
else
  log "    [WARN] Kaggle submission auth check failed."
  log "           This account/key can access data but cannot submit to $COMPETITION right now."
  log "           Accept the competition rules or update KAGGLE_USERNAME/KAGGLE_KEY before submitting."
fi

# ── Step 5b: Push adapter to HuggingFace Hub (persistent off-RunPod storage) ──
# The adapter (~150MB) is pushed so it survives pod termination.
# /workspace (network volume, 200GB) already preserves the full training state.
HF_REPO="${HF_REPO:-}"
HF_REPO_SLUG="${HF_REPO_SLUG:-nemotron-nano-30b-reasoning-lora}"
log "[5b] Pushing GRPO adapter to HuggingFace Hub..."

if [[ -n "${HF_TOKEN:-}" ]]; then
  python3 - <<'PYEOF'
import os, sys
from pathlib import Path
try:
    from huggingface_hub import HfApi, create_repo
    token    = os.environ["HF_TOKEN"]
    repo_id  = os.environ.get("HF_REPO", "").strip()
    repo_slug = os.environ.get("HF_REPO_SLUG", "nemotron-nano-30b-reasoning-lora").strip()
    adapter  = Path(os.environ.get("GRPO_OUTPUT_DIR", "/workspace/lora_output/grpo_v1"))
    api      = HfApi(token=token)
    if not repo_id:
        whoami = api.whoami(token=token)
        namespace = (
            whoami.get("name")
            or whoami.get("fullname")
            or whoami.get("email", "").split("@", 1)[0]
        )
        if not namespace:
            raise RuntimeError("Unable to resolve Hugging Face namespace from token.")
        repo_id = f"{namespace}/{repo_slug}"
    create_repo(repo_id, repo_type="model", private=True, exist_ok=True, token=token)
    api.upload_folder(
        folder_path=str(adapter),
        repo_id=repo_id,
        repo_type="model",
        commit_message="Nemotron autopilot: Phase 0→1→2 adapter",
        token=token,
    )
    print(f"  Pushed to: https://huggingface.co/{repo_id}")
except Exception as e:
    print(f"  [WARN] HF push failed: {e} — adapter is safe in /workspace")
PYEOF
else
  log "    [WARN] HF_TOKEN not set — skipping HuggingFace upload."
  log "           Adapter is preserved in $GRPO_OUTPUT_DIR/"
fi

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Nemotron Autopilot complete!                                 ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Quality examples : $(passed_so_far) in /workspace/training_data/"
echo "║  SFT adapter      : $SFT_OUTPUT_DIR/"
echo "║  GRPO adapter     : $GRPO_OUTPUT_DIR/"
echo "║  Submission zip   : $SUBMISSION_DIR/submission.zip"
if [[ -n "${HF_REPO:-}" ]]; then
  echo "║  HF backup        : https://huggingface.co/$HF_REPO"
else
  echo "║  HF backup        : auto-derived from HF_TOKEN namespace"
fi
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  NOTE: /workspace is a 200GB network volume — persists after  ║"
echo "║  pod stop. You can safely stop the pod to save GPU cost.      ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  To submit to Kaggle:"
echo "║  kaggle competitions submit \\"
echo "║    -c nvidia-nemotron-model-reasoning-challenge \\"
echo "║    -f $SUBMISSION_DIR/submission.zip \\"
echo "║    -m 'Phase 0→1→2 autopilot: compound solver + 2-reflect'"
echo "╚══════════════════════════════════════════════════════════════╝"

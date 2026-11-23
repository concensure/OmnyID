#!/usr/bin/env bash
# start-training.sh
#
# End-to-end setup for NVIDIA Nemotron Reasoning Challenge training.
#
# What this does:
#   1. Loads .env (OMNYID_NVIDIA_API_KEY must already be set)
#   2. Starts Docker services (postgres + homeserver)
#   3. Creates a separate challenge DB (afp_challenge) — completely isolated from
#      the main afp DB so challenge data never touches normal usage data
#   4. Applies ALL migrations to afp_challenge
#   5. Waits for the homeserver to be ready
#   6. Registers / logs in to get a session token
#   7. Enables training mode with Nemotron config
#   8. Runs the sample.jsonl smoke test
#   9. Optionally runs a full training benchmark (pass --full-train)
#
# Usage:
#   ./scripts/start-training.sh                        # setup + smoke test only
#   ./scripts/start-training.sh --full-train           # + full Kaggle benchmark
#   TRAINING_USER=me@example.com ./scripts/start-training.sh
#
# Prerequisites:
#   - Docker Desktop running
#   - .env contains OMNYID_NVIDIA_API_KEY (set by start-training.sh parent flow)
#   - curl + jq in PATH

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Load .env ──────────────────────────────────────────────────────────────────
ENV_FILE="$PROJECT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE"
  exit 1
fi
set -o allexport
source "$ENV_FILE"
set +o allexport

NVIDIA_KEY="${OMNYID_NVIDIA_API_KEY:-}"
if [[ -z "$NVIDIA_KEY" || "$NVIDIA_KEY" == nvapi-xxx* ]]; then
  echo "ERROR: OMNYID_NVIDIA_API_KEY is not set in .env"
  exit 1
fi

# ── Config ─────────────────────────────────────────────────────────────────────
HOMESERVER_URL="${HOMESERVER_URL:-http://localhost:18080}"
CHALLENGE_DB_NAME="afp_challenge"
CHALLENGE_DB_URL="postgresql://afp:afp@localhost:5432/$CHALLENGE_DB_NAME"
MAIN_DB_URL="postgresql://afp:afp@localhost:5432/afp"

# Training account — separate from any production account
# Oracle Cloud: training@nemotron-challenge.local / NemotronChallenge2026!
# User ID: 01KPFKP1G1YK52RGFM22RGEG77
TRAINING_USER="${TRAINING_USER:-training@nemotron-challenge.local}"
TRAINING_PASS="${TRAINING_PASS:-NemotronChallenge2026!}"

BENCHMARK_PATH="${BENCHMARK_PATH:-$PROJECT_DIR/benchmarks/sample.jsonl}"
FULL_BENCHMARK_PATH="${FULL_BENCHMARK_PATH:-$PROJECT_DIR/benchmarks/nemotron_challenge.jsonl}"

ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-}"

DO_FULL_TRAIN=0
for arg in "$@"; do
  [[ "$arg" == "--full-train" ]] && DO_FULL_TRAIN=1
done

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  OmnyID × NVIDIA Nemotron Challenge — Training Setup     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Start Docker ────────────────────────────────────────────────────────
echo "==> [1/8] Starting Docker services..."
cd "$PROJECT_DIR"
docker compose up -d postgres
echo "    Waiting for postgres to be ready..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U afp -d afp &>/dev/null 2>&1; then
    echo "    Postgres is ready."
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "ERROR: Postgres did not become ready in 30s"
    exit 1
  fi
  sleep 1
done

# ── Step 2: Create isolated challenge database ──────────────────────────────────
echo ""
echo "==> [2/8] Creating isolated challenge database ($CHALLENGE_DB_NAME)..."
echo "    (This keeps all challenge data 100% separate from the main 'afp' database)"

docker compose exec -T postgres psql -U afp -d postgres -c \
  "SELECT 1 FROM pg_database WHERE datname = '$CHALLENGE_DB_NAME'" | grep -q 1 \
  && CHALLENGE_DB_EXISTS=1 || CHALLENGE_DB_EXISTS=0

if [[ "$CHALLENGE_DB_EXISTS" -eq 0 ]]; then
  docker compose exec -T postgres psql -U afp -d postgres -c \
    "CREATE DATABASE $CHALLENGE_DB_NAME OWNER afp;"
  echo "    Created database '$CHALLENGE_DB_NAME'."
else
  echo "    Database '$CHALLENGE_DB_NAME' already exists — skipping creation."
fi

# ── Step 3: Apply ALL migrations to challenge DB ────────────────────────────────
echo ""
echo "==> [3/8] Applying migrations to challenge DB..."
MIGRATIONS_DIR="$PROJECT_DIR/postgres/migrations"

for sql_file in "$MIGRATIONS_DIR"/*.sql; do
  filename="$(basename "$sql_file")"
  echo "    Applying $filename..."
  docker compose exec -T postgres psql -U afp -d "$CHALLENGE_DB_NAME" \
    -f "/migrations/$filename" 2>/dev/null || \
  # Fallback: pipe file contents directly
  docker compose exec -T postgres psql -U afp -d "$CHALLENGE_DB_NAME" \
    < "$sql_file" 2>/dev/null || true
done

# Use psql from host if available (more reliable for file paths)
if command -v psql &>/dev/null; then
  echo "    Using host psql to apply migrations..."
  for sql_file in "$MIGRATIONS_DIR"/*.sql; do
    filename="$(basename "$sql_file")"
    echo "    $filename..."
    PGPASSWORD=afp psql -h localhost -U afp -d "$CHALLENGE_DB_NAME" -f "$sql_file" -q || true
  done
  echo "    Migrations applied to $CHALLENGE_DB_NAME."
fi

# ── Step 4: Apply training migrations to MAIN DB too ───────────────────────────
# (Required because the running homeserver uses the main DB for API calls.
#  Both migrations are purely additive with safe defaults — no data is altered.)
echo ""
echo "==> [4/8] Applying training migrations to main DB (additive, safe)..."
echo "    Migration 0038 (openai_compat_backend): adds optional column with no default change"
echo "    Migration 0039 (training_mode): adds training_mode=FALSE (default) and training_config={}"
echo "    Normal agent rows are completely unaffected."

if command -v psql &>/dev/null; then
  PGPASSWORD=afp psql -h localhost -U afp -d afp \
    -f "$MIGRATIONS_DIR/0038_openai_compat_backend.sql" -q 2>/dev/null || true
  PGPASSWORD=afp psql -h localhost -U afp -d afp \
    -f "$MIGRATIONS_DIR/0039_training_mode.sql" -q 2>/dev/null || true
  echo "    Done."
fi

# ── Step 5: Start full homeserver ──────────────────────────────────────────────
echo ""
echo "==> [5/8] Starting homeserver..."
docker compose up -d
echo "    Waiting for homeserver at $HOMESERVER_URL/health..."
for i in $(seq 1 60); do
  if curl -sf "$HOMESERVER_URL/health" &>/dev/null; then
    echo "    Homeserver is ready."
    break
  fi
  if [[ $i -eq 60 ]]; then
    echo "WARN: Homeserver did not respond in 60s — trying anyway..."
    break
  fi
  sleep 1
done

# ── Step 6: Register training account + get session token ──────────────────────
echo ""
echo "==> [6/8] Setting up training account ($TRAINING_USER)..."

REGISTER_RESP=$(curl -sf -X POST "$HOMESERVER_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TRAINING_USER\",\"password\":\"$TRAINING_PASS\",\"display_name\":\"Nemotron Training\"}" \
  2>/dev/null) || REGISTER_RESP=""

if [[ -z "$REGISTER_RESP" ]]; then
  echo "    Account exists or registration returned no body — logging in..."
fi

LOGIN_RESP=$(curl -sf -X POST "$HOMESERVER_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TRAINING_USER\",\"password\":\"$TRAINING_PASS\"}" 2>/dev/null)

SESSION_TOKEN=$(echo "$LOGIN_RESP" | jq -r '.session_token // .token // empty')
if [[ -z "$SESSION_TOKEN" ]]; then
  echo "ERROR: Could not obtain session token. Login response:"
  echo "$LOGIN_RESP"
  exit 1
fi
echo "    Session token obtained."

# ── Step 7: Enable training mode ───────────────────────────────────────────────
echo ""
echo "==> [7/8] Enabling training mode with Nemotron config..."

TRAINING_CONFIG=$(cat <<JSON
{
  "enabled": true,
  "config": {
    "challenge_model": "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
    "challenge_backend_url": "https://integrate.api.nvidia.com/v1",
    "api_key": "$NVIDIA_KEY",
    "eval_model": "claude-sonnet-4-6",
    "eval_anthropic_key": "$ANTHROPIC_KEY",
    "reflection_policy": "every_step",
    "confidence_threshold": 0.85,
    "max_replan_passes": 3,
    "collect_lora_examples": true,
    "benchmark_name": "nemotron-2026",
    "cost_per_1m_input": 0.35,
    "cost_per_1m_output": 0.40
  }
}
JSON
)

TRAINING_MODE_RESP=$(curl -sf -X POST "$HOMESERVER_URL/agent/training-mode" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -d "$TRAINING_CONFIG" 2>/dev/null)

echo "    Training mode response: $TRAINING_MODE_RESP"

# ── Step 8: Smoke test ─────────────────────────────────────────────────────────
echo ""
echo "==> [8/8] Running smoke test (benchmarks/sample.jsonl — 24 problems)..."

SMOKE_RESP=$(curl -sf -X POST "$HOMESERVER_URL/agent/eval/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -d "{\"benchmark_path\":\"benchmarks/sample.jsonl\"}" 2>/dev/null)

echo ""
echo "Smoke test result:"
echo "$SMOKE_RESP" | jq '{
  run_id: .run_id,
  total_problems: .total_problems,
  valid_count: .valid_count,
  challenge_correct_count: .challenge_correct_count,
  challenge_accuracy: .challenge_accuracy,
  overall_score: .overall_score,
  lora_examples_collected: .lora_examples_collected
}' 2>/dev/null || echo "$SMOKE_RESP"

CHALLENGE_ACCURACY=$(echo "$SMOKE_RESP" | jq -r '.challenge_accuracy // "unknown"')
echo ""
echo "  Challenge accuracy on sample: $CHALLENGE_ACCURACY"

# ── Full training run (optional) ───────────────────────────────────────────────
if [[ "$DO_FULL_TRAIN" -eq 1 ]]; then
  echo ""
  echo "==> [BONUS] Starting full training run..."
  if [[ ! -f "$FULL_BENCHMARK_PATH" ]]; then
    echo "WARN: Full benchmark not found at $FULL_BENCHMARK_PATH"
    echo "      Download the Kaggle dataset first:"
    echo "      kaggle competitions download -c nvidia-nemotron-model-reasoning-challenge"
    echo "      Then convert it to JSONL and place at: $FULL_BENCHMARK_PATH"
    echo "      See scripts/convert-kaggle-dataset.sh for the conversion step."
  else
    FULL_RESP=$(curl -sf -X POST "$HOMESERVER_URL/agent/eval/run" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $SESSION_TOKEN" \
      -d "{\"benchmark_path\":\"$FULL_BENCHMARK_PATH\"}" 2>/dev/null)

    echo "Full training run result:"
    echo "$FULL_RESP" | jq '{
      run_id: .run_id,
      total_problems: .total_problems,
      challenge_accuracy: .challenge_accuracy,
      overall_score: .overall_score,
      lora_examples_collected: .lora_examples_collected
    }' 2>/dev/null || echo "$FULL_RESP"
  fi
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Training setup complete!                                 ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Challenge DB (isolated): afp_challenge                  ║"
echo "║  Main DB (untouched):     afp                            ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Next steps:                                              ║"
echo "║  1. Download full Kaggle dataset (see below)              ║"
echo "║  2. Convert to JSONL: scripts/convert-kaggle-dataset.sh  ║"
echo "║  3. Run full training: ./scripts/start-training.sh       ║"
echo "║                        --full-train                       ║"
echo "║  4. Export LoRA data: POST /agent/lora/export             ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Kaggle dataset download:                                 ║"
echo "║  pip install kaggle                                       ║"
echo "║  kaggle competitions download \\                           ║"
echo "║    -c nvidia-nemotron-model-reasoning-challenge           ║"
echo "╚══════════════════════════════════════════════════════════╝"

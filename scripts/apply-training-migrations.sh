#!/usr/bin/env bash
# apply-training-migrations.sh
#
# Applies the two DB migrations required for the Phase 14 training harness.
# Run this ONCE against your PostgreSQL instance before using training mode.
#
# Prerequisites:
#   - psql CLI in PATH
#   - DATABASE_URL environment variable set, e.g.:
#       export DATABASE_URL="postgresql://user:pass@host:5432/omnyid"
#   - Or pass individual PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE vars
#
# Usage:
#   chmod +x scripts/apply-training-migrations.sh
#   DATABASE_URL=postgresql://... ./scripts/apply-training-migrations.sh

set -euo pipefail

MIGRATIONS_DIR="$(dirname "$0")/../postgres/migrations"

if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: DATABASE_URL is not set."
    echo "  Export it before running:"
    echo "    export DATABASE_URL=\"postgresql://user:pass@host:5432/omnyid\""
    exit 1
fi

echo "==> Applying migration 0038_openai_compat_backend.sql ..."
psql "$DATABASE_URL" -f "$MIGRATIONS_DIR/0038_openai_compat_backend.sql"
echo "    Done."

echo "==> Applying migration 0039_training_mode.sql ..."
psql "$DATABASE_URL" -f "$MIGRATIONS_DIR/0039_training_mode.sql"
echo "    Done."

echo ""
echo "✓ Migrations applied successfully."
echo ""
echo "Next steps:"
echo "  1. Set OMNYID_NVIDIA_API_KEY in your server environment (see below)"
echo "  2. POST /agent/training-mode to enable training with your NVIDIA model"
echo "  3. POST /agent/eval/run with benchmark_path=benchmarks/sample.jsonl to smoke-test"
echo ""
echo "Required environment variable for NVIDIA NIM / challenge API:"
echo "  OMNYID_NVIDIA_API_KEY=nvapi-xxxxxxxx..."
echo ""
echo "Optional: separate judge model (strongly recommended):"
echo "  Set in training_config.eval_anthropic_key (Anthropic Claude as judge)"
echo "  OR set training_config.eval_backend_url + training_config.eval_model"

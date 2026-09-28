#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/bin"
LOG_FILE="$TMP_DIR/docker.log"
STATE_FILE="$TMP_DIR/state"
cat >"$STATE_FILE" <<'EOF'
pass=0
vacuum=0
EOF

cat >"$TMP_DIR/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
log_file="${OMNYID_PRUNE_SYNTHETIC_SELFTEST_LOG:?}"
state_file="${OMNYID_PRUNE_SYNTHETIC_SELFTEST_STATE:?}"
printf '[fake-docker] %s\n' "$*" >>"$log_file"

if [[ "$1" == "ps" ]]; then
  printf 'omnyid-postgres-1\n'
  exit 0
fi

if [[ "$1" == "exec" ]]; then
  args=("$@")
  sql="${args[${#args[@]}-1]}"
  if [[ "$*" == *"psql -U"* && "$sql" == *"SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'user\\_%' ESCAPE '\\';"* ]]; then
    printf '3\n'
    exit 0
  fi
  if [[ "$*" == *"psql -U"* && "$sql" == *"synthetic_message_prune_counts"* ]]; then
    pass_value="$(grep '^pass=' "$state_file" | cut -d= -f2)"
    if [[ "$pass_value" == "0" ]]; then
      printf 'curator_backlink_dupes=20\n'
      printf 'curator_card_dupes=40\n'
      printf 'ingestion_topology_dupes=50\n'
      printf 'maintenance_summary_dupes=10\n'
    else
      printf 'curator_backlink_dupes=0\n'
      printf 'curator_card_dupes=0\n'
      printf 'ingestion_topology_dupes=0\n'
      printf 'maintenance_summary_dupes=0\n'
    fi
    exit 0
  fi
fi

if [[ "$1" == "exec" && "$2" == "-i" ]]; then
  cat >/dev/null
  sed -i 's/^pass=.*/pass=1/' "$state_file"
  exit 0
fi

if [[ "$1" == "exec" && "$*" == *"ANALYZE;"* ]]; then
  sed -i 's/^vacuum=.*/vacuum=1/' "$state_file"
  exit 0
fi

printf '[fake-docker] unexpected invocation: %s\n' "$*" >&2
exit 1
EOF
chmod +x "$TMP_DIR/bin/docker"

export PATH="$TMP_DIR/bin:$PATH"
export OMNYID_PRUNE_SYNTHETIC_SELFTEST_LOG="$LOG_FILE"
export OMNYID_PRUNE_SYNTHETIC_SELFTEST_STATE="$STATE_FILE"
mkdir -p "$TMP_DIR/project/.secrets" "$TMP_DIR/project/scripts"
cp "$SCRIPT_DIR/omnyid-prune-synthetic-message-spam.sh" "$TMP_DIR/project/scripts/omnyid-prune-synthetic-message-spam.sh"
cp "$SCRIPT_DIR/prune-maintenance-summary-spam.sql" "$TMP_DIR/project/scripts/prune-maintenance-summary-spam.sql"
cp "$SCRIPT_DIR/prune-curator-artifact-spam.sql" "$TMP_DIR/project/scripts/prune-curator-artifact-spam.sql"
cp "$SCRIPT_DIR/prune-ingestion-topology-spam.sql" "$TMP_DIR/project/scripts/prune-ingestion-topology-spam.sql"
chmod +x "$TMP_DIR/project/scripts/omnyid-prune-synthetic-message-spam.sh"
printf 'fallback-secret\n' >"$TMP_DIR/project/.secrets/postgres_password"

output="$(
  cd "$TMP_DIR/project"
  POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
    ./scripts/omnyid-prune-synthetic-message-spam.sh --vacuum-mode analyze
)"

[[ "$output" == *"before maintenance_summary_dupes=10 curator_card_dupes=40 curator_backlink_dupes=20 ingestion_topology_dupes=50 total_dupes=120"* ]]
[[ "$output" == *"after maintenance_summary_dupes=0 curator_card_dupes=0 curator_backlink_dupes=0 ingestion_topology_dupes=0 total_dupes=0 deleted_total=120"* ]]
grep -F "ANALYZE;" "$LOG_FILE" >/dev/null
grep -F "exec -i omnyid-postgres-1" "$LOG_FILE" >/dev/null

dry_run_log_count_before="$(wc -l < "$LOG_FILE")"
dry_run_output="$(
  cd "$TMP_DIR/project"
  POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
    ./scripts/omnyid-prune-synthetic-message-spam.sh --vacuum-mode vacuum_full --dry-run
)"
[[ "$dry_run_output" == *"dry run only; no rows deleted"* ]]
if [[ "$dry_run_output" == *"VACUUM (FULL, ANALYZE)"* ]]; then
  echo "[omnyid-prune-synthetic-message-spam-selftest] unexpected vacuum full output during dry run" >&2
  exit 1
fi
dry_run_log_tail="$(tail -n +"$((dry_run_log_count_before + 1))" "$LOG_FILE" || true)"
if [[ "$dry_run_log_tail" == *"VACUUM (FULL, ANALYZE);"* ]]; then
  echo "[omnyid-prune-synthetic-message-spam-selftest] unexpected vacuum full during dry run" >&2
  exit 1
fi

printf '[omnyid-prune-synthetic-message-spam-selftest] passed\n'

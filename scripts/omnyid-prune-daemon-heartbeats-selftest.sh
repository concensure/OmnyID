#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/bin"
LOG_FILE="$TMP_DIR/docker.log"
STATE_FILE="$TMP_DIR/delete-state"
printf '0' >"$STATE_FILE"

cat >"$TMP_DIR/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
log_file="${OMNYID_PRUNE_SELFTEST_LOG:?}"
state_file="${OMNYID_PRUNE_SELFTEST_STATE:?}"
printf '[fake-docker] %s\n' "$*" >>"$log_file"

if [[ "$1" == "ps" ]]; then
  printf 'omnyid-postgres-1\n'
  exit 0
fi

if [[ "$1" == "exec" ]]; then
  args=("$@")
  sql="${args[${#args[@]}-1]}"
  if [[ "$sql" == "SELECT count(*) FROM daemon_heartbeats;" ]]; then
    if grep -q 'vacuumed' "$state_file"; then
      printf '200\n'
    else
      printf '1000\n'
    fi
    exit 0
  fi
  if [[ "$sql" == *"SELECT count(*) FROM daemon_heartbeats WHERE created_at < NOW() - make_interval(hours => 48);"* ]]; then
    if grep -q 'vacuumed' "$state_file"; then
      printf '0\n'
    else
      printf '800\n'
    fi
    exit 0
  fi
  if [[ "$sql" == *"SELECT COALESCE(to_char(min(created_at)"* ]]; then
    if [[ "$sql" == *"WHERE created_at < NOW() - make_interval(hours => 48)"* ]]; then
      printf '2026-04-15T00:00:00+00\n'
    else
      if grep -q 'vacuumed' "$state_file"; then
        printf '2026-08-20T04:00:00+00\n'
      else
        printf '2026-04-15T00:00:00+00\n'
      fi
    fi
    exit 0
  fi
  if [[ "$sql" == *"SELECT COALESCE(to_char(max(created_at)"* ]]; then
    printf '2026-08-22T04:00:00+00\n'
    exit 0
  fi
  if [[ "$sql" == *"WITH doomed AS ("* ]]; then
    current="$(cat "$state_file")"
    case "$current" in
      0)
        printf '1' >"$state_file"
        printf '500\n'
        ;;
      1)
        printf '2' >"$state_file"
        printf '300\n'
        ;;
      *)
        printf '2' >"$state_file"
        printf '0\n'
        ;;
    esac
    exit 0
  fi
  if [[ "$sql" == "ANALYZE daemon_heartbeats;" ]]; then
    printf 'vacuumed' >"$state_file"
    exit 0
  fi
fi

printf '[fake-docker] unexpected invocation: %s\n' "$*" >&2
exit 1
EOF
chmod +x "$TMP_DIR/bin/docker"

export PATH="$TMP_DIR/bin:$PATH"
export OMNYID_PRUNE_SELFTEST_LOG="$LOG_FILE"
export OMNYID_PRUNE_SELFTEST_STATE="$STATE_FILE"
mkdir -p "$TMP_DIR/project/.secrets" "$TMP_DIR/project/scripts"
cp "$SCRIPT_DIR/omnyid-prune-daemon-heartbeats.sh" "$TMP_DIR/project/scripts/omnyid-prune-daemon-heartbeats.sh"
chmod +x "$TMP_DIR/project/scripts/omnyid-prune-daemon-heartbeats.sh"
printf 'fallback-secret\n' >"$TMP_DIR/project/.secrets/postgres_password"

output="$(
  cd "$TMP_DIR/project"
  POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
    ./scripts/omnyid-prune-daemon-heartbeats.sh --retention-hours 48 --batch-size 10000 --vacuum-mode analyze
)"

[[ "$output" == *"before_total_rows=1000 before_stale_rows=800"* ]]
[[ "$output" == *"deleted_batch=500 deleted_total=500 batch_count=1"* ]]
[[ "$output" == *"deleted_batch=300 deleted_total=800 batch_count=2"* ]]
[[ "$output" == *"after_total_rows=200 after_stale_rows=0"* ]]
[[ "$output" == *"note=plain DELETE reduces live-row history immediately"* ]]

grep -F "ANALYZE daemon_heartbeats;" "$LOG_FILE" >/dev/null
grep -F "ORDER BY created_at ASC" "$LOG_FILE" >/dev/null

dry_run_output="$(
  cd "$TMP_DIR/project"
  POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
    ./scripts/omnyid-prune-daemon-heartbeats.sh --retention-hours 48 --batch-size 5000 --vacuum-mode vacuum_full --dry-run
)"
[[ "$dry_run_output" == *"dry run only; no rows deleted"* ]]
if grep -F "VACUUM (FULL, ANALYZE) daemon_heartbeats;" "$LOG_FILE" >/dev/null; then
  echo "[omnyid-prune-daemon-heartbeats-selftest] unexpected vacuum full during dry run" >&2
  exit 1
fi

printf '[omnyid-prune-daemon-heartbeats-selftest] passed\n'

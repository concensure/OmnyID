#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_PARENT="$SCRIPT_DIR/.tmp"
mkdir -p "$TMP_PARENT"
TMP_DIR="$(mktemp -d "$TMP_PARENT/restore-selftest.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "[omnyid-restore-selftest] expected output to contain: $needle" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "[omnyid-restore-selftest] expected output to omit: $needle" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

mkdir -p "$TMP_DIR/bin" "$TMP_DIR/backup-root/20260818T000000Z/seaweedfs"
printf '{}' >"$TMP_DIR/backup-root/20260818T000000Z/manifest.json"
printf 'fake-gzip-stream' >"$TMP_DIR/backup-root/20260818T000000Z/postgres.dump.gz"
printf 'blob' >"$TMP_DIR/backup-root/20260818T000000Z/seaweedfs/example.bin"

cat >"$TMP_DIR/bin/psql" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '[fake-psql] %s\n' "$*" >>"${OMNYID_RESTORE_SELFTEST_LOG:?}"
EOF
chmod +x "$TMP_DIR/bin/psql"

cat >"$TMP_DIR/bin/gzip" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "-cd" ]]; then
  printf 'decoded-pg-dump'
  exit 0
fi
echo "[fake-gzip] unsupported args: $*" >&2
exit 1
EOF
chmod +x "$TMP_DIR/bin/gzip"

cat >"$TMP_DIR/bin/pg_restore" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cat >/dev/null
printf '[fake-pg_restore] %s\n' "$*" >>"${OMNYID_RESTORE_SELFTEST_LOG:?}"
EOF
chmod +x "$TMP_DIR/bin/pg_restore"

cat >"$TMP_DIR/bin/mc" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '[fake-mc] %s\n' "$*" >>"${OMNYID_RESTORE_SELFTEST_LOG:?}"
EOF
chmod +x "$TMP_DIR/bin/mc"

log_path="$TMP_DIR/commands.log"
output="$(
  PATH="$TMP_DIR/bin:$PATH" \
  OMNYID_RESTORE_SELFTEST_LOG="$log_path" \
  OMNYID_PG_HOST=127.0.0.1 \
  OMNYID_PG_PORT=5432 \
  OMNYID_PG_USER=afp \
  OMNYID_PG_PASSWORD=afp \
  OMNYID_PG_DB=afp \
  OMNYID_SEAWEEDFS_ALIAS=restore-test \
  OMNYID_SEAWEEDFS_BUCKET=attachments \
  bash "$SCRIPT_DIR/omnyid-restore.sh" "$TMP_DIR/backup-root"
)"

command_log="$(cat "$log_path")"

assert_contains "$output" "[omnyid-restore] Dropping afp (if exists) and recreating..."
assert_contains "$output" "[omnyid-restore] Postgres restore complete."
assert_contains "$output" "[omnyid-restore] SeaweedFS restore complete."
assert_contains "$command_log" "[fake-psql] --host=127.0.0.1 --port=5432 --username=afp --dbname=postgres --command=DROP DATABASE IF EXISTS afp;"
assert_contains "$command_log" "[fake-psql] --host=127.0.0.1 --port=5432 --username=afp --dbname=postgres --command=CREATE DATABASE afp;"
assert_not_contains "$command_log" "DROP DATABASE IF EXISTS afp; CREATE DATABASE afp;"
assert_contains "$command_log" "[fake-pg_restore] --host=127.0.0.1 --port=5432 --username=afp --dbname=afp --no-owner --no-acl --exit-on-error"
assert_contains "$command_log" "[fake-mc] mirror --overwrite $TMP_DIR/backup-root/20260818T000000Z/seaweedfs/ restore-test/attachments"

parallel_log_path="$TMP_DIR/commands-parallel.log"
parallel_workdir="$TMP_DIR/restore-work"
mkdir -p "$parallel_workdir"
parallel_output="$(
  PATH="$TMP_DIR/bin:$PATH" \
  OMNYID_RESTORE_SELFTEST_LOG="$parallel_log_path" \
  OMNYID_PG_HOST=127.0.0.1 \
  OMNYID_PG_PORT=5432 \
  OMNYID_PG_USER=afp \
  OMNYID_PG_PASSWORD=afp \
  OMNYID_PG_DB=afp \
  OMNYID_PG_RESTORE_JOBS=2 \
  OMNYID_PG_RESTORE_WORKDIR="$parallel_workdir" \
  OMNYID_RESTORE_SKIP_SEAWEEDFS=1 \
  bash "$SCRIPT_DIR/omnyid-restore.sh" "$TMP_DIR/backup-root"
)"

parallel_command_log="$(cat "$parallel_log_path")"
assert_contains "$parallel_output" "[omnyid-restore] Expanding Postgres dump for parallel restore (2 jobs)..."
assert_contains "$parallel_command_log" "[fake-pg_restore] --host=127.0.0.1 --port=5432 --username=afp --dbname=afp --no-owner --no-acl --exit-on-error --jobs=2 $parallel_workdir/postgres.restore"

echo "[omnyid-restore-selftest] passed"

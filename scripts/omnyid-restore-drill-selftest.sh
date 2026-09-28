#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_PARENT="$SCRIPT_DIR/.tmp"
mkdir -p "$TMP_PARENT"
TMP_DIR="$(mktemp -d "$TMP_PARENT/restore-drill-selftest.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "[omnyid-restore-drill-selftest] expected output to contain: $needle" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "[omnyid-restore-drill-selftest] expected output to omit: $needle" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

find_python() {
  local candidate
  for candidate in python3 python python3.exe python.exe; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

if ! REAL_PYTHON="$(find_python)"; then
  echo "[omnyid-restore-drill-selftest] no Python interpreter available" >&2
  exit 1
fi

mkdir -p "$TMP_DIR/bin" "$TMP_DIR/scripts" "$TMP_DIR/backup-root/20260815T000000Z/seaweedfs"
cp "$SCRIPT_DIR/omnyid-restore-drill.sh" "$TMP_DIR/scripts/omnyid-restore-drill.sh"
chmod +x "$TMP_DIR/scripts/omnyid-restore-drill.sh"

cat >"$TMP_DIR/scripts/omnyid-backup-verify.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-backup-verify] $1"
EOF
chmod +x "$TMP_DIR/scripts/omnyid-backup-verify.sh"

cat >"$TMP_DIR/scripts/omnyid-restore.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-restore] skip_seaweedfs=${OMNYID_RESTORE_SKIP_SEAWEEDFS:-unset} backup=$1"
EOF
chmod +x "$TMP_DIR/scripts/omnyid-restore.sh"

cat >"$TMP_DIR/backup-root/20260815T000000Z/manifest.json" <<'EOF'
{
  "timestamp": "20260815T000000Z",
  "postgres_db": "afp",
  "postgres_dump_bytes": 16,
  "postgres_live_db_bytes": 32,
  "seaweedfs_bucket": "attachments",
  "seaweedfs_file_count": 3
}
EOF

printf 'fake-backup-dump' >"$TMP_DIR/backup-root/20260815T000000Z/postgres.dump.gz"
printf 'one' >"$TMP_DIR/backup-root/20260815T000000Z/seaweedfs/file-one.bin"
printf 'two' >"$TMP_DIR/backup-root/20260815T000000Z/seaweedfs/file-two.bin"
printf 'three' >"$TMP_DIR/backup-root/20260815T000000Z/seaweedfs/file-three.bin"

cat >"$TMP_DIR/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

cmd="$1"
shift || true
full="$cmd $*"

case "$cmd" in
  run)
    if [[ "$full" == *"pgvector/pgvector:pg18"* ]]; then
      exit 0
    fi
    if [[ "$full" == *"bash /usr/local/bin/omnyid-restore.sh /backup"* ]]; then
      exit 0
    fi
    if [[ "$full" == *"server /data --address"* ]]; then
      exit 0
    fi
    if [[ "$full" == *"mc find "* ]]; then
      echo "3"
      exit 0
    fi
    if [[ "$full" == *"mc alias set"* ]] || [[ "$full" == *"mc mb --ignore-existing"* ]] || [[ "$full" == *"mc mirror --overwrite /backup/seaweedfs/"* ]]; then
      exit 0
    fi
    exit 0
    ;;
  exec)
    if [[ "$full" == *"pg_isready"* ]]; then
      exit 0
    fi
    if [[ "$full" == *"count(*) FROM information_schema.tables"* ]]; then
      echo "12"
      exit 0
    fi
    if [[ "$full" == *"SELECT EXISTS"* ]]; then
      echo "t"
      exit 0
    fi
    if [[ "$full" == *"count(*) FROM omnyid_schema_migrations"* ]]; then
      echo "82"
      exit 0
    fi
    echo "[fake-docker] exec $*" >&2
    exit 0
    ;;
  rm)
    exit 0
    ;;
  *)
    echo "[fake-docker] unsupported command: $cmd $*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$TMP_DIR/bin/docker"

cat >"$TMP_DIR/bin/df" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "-B1" && "${2:-}" == "/" ]]; then
  printf 'Filesystem 1B-blocks Used Available Use%% Mounted on\n'
  printf '/dev/fake 1000 100 9999999999 1%% /\n'
  exit 0
fi
echo "[fake-df] unsupported args: $*" >&2
exit 1
EOF
chmod +x "$TMP_DIR/bin/df"

cat >"$TMP_DIR/bin/python3" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec "__REAL_PYTHON__" "$@"
EOF
python_wrapper_path="$TMP_DIR/bin/python3"
python_wrapper_contents="$(cat "$python_wrapper_path")"
printf '%s\n' "${python_wrapper_contents/__REAL_PYTHON__/$REAL_PYTHON}" >"$python_wrapper_path"
chmod +x "$TMP_DIR/bin/python3"

output="$(
  PATH="$TMP_DIR/bin:$PATH" \
  OMNYID_RESTORE_DRILL_TIMEOUT_SECS=1 \
  bash "$TMP_DIR/scripts/omnyid-restore-drill.sh" "$TMP_DIR/backup-root"
)"

assert_contains "$output" "[omnyid-restore-drill] Verifying backup archive $TMP_DIR/backup-root/20260815T000000Z..."
assert_contains "$output" "[fake-backup-verify] $TMP_DIR/backup-root/20260815T000000Z"
assert_contains "$output" "[omnyid-restore-drill] Starting disposable Postgres container"
assert_contains "$output" "[omnyid-restore-drill] Starting disposable object-store container"
assert_contains "$output" "[omnyid-restore-drill] Replaying SeaweedFS mirror into disposable object store..."
assert_contains "$output" "[omnyid-restore-drill] OK: restore replay succeeded."
assert_contains "$output" "[omnyid-restore-drill] Restored object count: 3"

mkdir -p "$TMP_DIR/backup-empty/20260816T000000Z/seaweedfs"
cat >"$TMP_DIR/backup-empty/20260816T000000Z/manifest.json" <<'EOF'
{
  "timestamp": "20260816T000000Z",
  "postgres_db": "afp",
  "postgres_dump_bytes": 16,
  "postgres_live_db_bytes": 32,
  "seaweedfs_bucket": "attachments",
  "seaweedfs_file_count": 0
}
EOF
printf 'fake-backup-dump' >"$TMP_DIR/backup-empty/20260816T000000Z/postgres.dump.gz"

empty_output="$(
  PATH="$TMP_DIR/bin:$PATH" \
  OMNYID_RESTORE_DRILL_TIMEOUT_SECS=1 \
  bash "$TMP_DIR/scripts/omnyid-restore-drill.sh" "$TMP_DIR/backup-empty"
)"

assert_contains "$empty_output" "[omnyid-restore-drill] Skipping object-store replay because the backup manifest contains no SeaweedFS objects."
assert_contains "$empty_output" "[omnyid-restore-drill] OK: restore replay succeeded."
assert_contains "$empty_output" "[omnyid-restore-drill] Restored object count: 0"
assert_not_contains "$empty_output" "[omnyid-restore-drill] Starting disposable object-store container"

set +e
low_space_output="$(
  PATH="$TMP_DIR/bin:$PATH" \
  OMNYID_RESTORE_DRILL_TIMEOUT_SECS=1 \
  OMNYID_RESTORE_DRILL_SOURCE_DB_BYTES=99999999999 \
  OMNYID_RESTORE_DRILL_SPACE_HEADROOM_BYTES=16 \
  OMNYID_RESTORE_DRILL_SPACE_MULTIPLIER_PCT=100 \
  bash "$TMP_DIR/scripts/omnyid-restore-drill.sh" "$TMP_DIR/backup-root" 2>&1
)"
low_space_exit=$?
set -e
if [[ $low_space_exit -eq 0 ]]; then
  echo "[omnyid-restore-drill-selftest] expected low-space preflight failure" >&2
  exit 1
fi
assert_contains "$low_space_output" "insufficient free disk for restore preflight"

echo "[omnyid-restore-drill-selftest] passed"

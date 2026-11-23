#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_PARENT="$SCRIPT_DIR/.tmp"
mkdir -p "$TMP_PARENT"
TMP_DIR="$(mktemp -d "$TMP_PARENT/backup-verify-selftest.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "[omnyid-backup-verify-selftest] expected output to contain: $needle" >&2
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
  echo "[omnyid-backup-verify-selftest] no Python interpreter available" >&2
  exit 1
fi

mkdir -p "$TMP_DIR/bin" "$TMP_DIR/backup-root/20260818T000000Z/seaweedfs"
printf 'blob' >"$TMP_DIR/backup-root/20260818T000000Z/seaweedfs/example.bin"
cat >"$TMP_DIR/backup-root/20260818T000000Z/manifest.json" <<'EOF'
{
  "timestamp": "20260818T000000Z",
  "postgres_db": "afp",
  "postgres_dump_bytes": 12,
  "seaweedfs_bucket": "attachments",
  "seaweedfs_file_count": 1
}
EOF
printf 'gzip-content' >"$TMP_DIR/backup-root/20260818T000000Z/postgres.dump.gz"

cat >"$TMP_DIR/bin/python3" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec "__REAL_PYTHON__" "$@"
EOF
python_wrapper_path="$TMP_DIR/bin/python3"
python_wrapper_contents="$(cat "$python_wrapper_path")"
printf '%s\n' "${python_wrapper_contents/__REAL_PYTHON__/$REAL_PYTHON}" >"$python_wrapper_path"
chmod +x "$TMP_DIR/bin/python3"

cat >"$TMP_DIR/bin/gzip" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "-t" ]]; then
  exit 0
fi
if [[ "${1:-}" == "-dc" ]]; then
  printf 'decoded-dump'
  exit 0
fi
echo "[fake-gzip] unsupported args: $*" >&2
exit 1
EOF
chmod +x "$TMP_DIR/bin/gzip"

cat >"$TMP_DIR/bin/pg_restore" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" != "--list" ]]; then
  echo "[fake-pg_restore] unexpected args: $*" >&2
  exit 1
fi
echo "1; 2615 2200 SCHEMA - public postgres"
exit 0
EOF
chmod +x "$TMP_DIR/bin/pg_restore"

ok_output="$(
  PATH="$TMP_DIR/bin:$PATH" \
  bash "$SCRIPT_DIR/omnyid-backup-verify.sh" "$TMP_DIR/backup-root"
)"
assert_contains "$ok_output" "[omnyid-backup-verify] OK: manifest, Postgres archive, and SeaweedFS mirror are internally consistent."

cat >"$TMP_DIR/bin/gzip" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "-t" ]]; then
  echo "bad gzip stream" >&2
  exit 1
fi
if [[ "${1:-}" == "-dc" ]]; then
  printf 'decoded-dump'
  exit 0
fi
echo "[fake-gzip] unsupported args: $*" >&2
exit 1
EOF
chmod +x "$TMP_DIR/bin/gzip"

set +e
bad_output="$(
  PATH="$TMP_DIR/bin:$PATH" \
  bash "$SCRIPT_DIR/omnyid-backup-verify.sh" "$TMP_DIR/backup-root" 2>&1
)"
bad_exit=$?
set -e
if [[ $bad_exit -eq 0 ]]; then
  echo "[omnyid-backup-verify-selftest] expected gzip integrity failure" >&2
  exit 1
fi
assert_contains "$bad_output" "failed gzip integrity validation"

echo "[omnyid-backup-verify-selftest] passed"

#!/usr/bin/env bash
# omnyid-backup-verify.sh - Verify a local OmnyID backup archive without mutating live services.
#
# Usage:
#   ./omnyid-backup-verify.sh <backup_dir>
#
# This script checks:
#   - manifest.json exists and is parseable
#   - postgres.dump.gz exists and passes gzip integrity
#   - pg_restore can list the custom-format dump
#   - the manifest byte count matches the actual dump size
#   - the manifest SeaweedFS file count matches the mirrored directory count

set -euo pipefail

INPUT_PATH="${1:?Usage: omnyid-backup-verify.sh <backup_dir>}"

resolve_backup_archive_dir() {
  local input_path="$1"
  if [[ -f "${input_path}/manifest.json" ]]; then
    printf '%s\n' "$input_path"
    return 0
  fi
  if [[ ! -d "$input_path" ]]; then
    echo "[omnyid-backup-verify] ERROR: ${input_path} not found." >&2
    exit 1
  fi
  local latest_dir
  latest_dir="$(
    find "$input_path" -maxdepth 1 -mindepth 1 -type d -name '20*Z' | sort | tail -n 1
  )"
  if [[ -z "$latest_dir" || ! -f "${latest_dir}/manifest.json" ]]; then
    echo "[omnyid-backup-verify] ERROR: no timestamped backup archive with manifest.json found under ${input_path}." >&2
    exit 1
  fi
  printf '%s\n' "$latest_dir"
}

BACKUP_DIR="$(resolve_backup_archive_dir "$INPUT_PATH")"
MANIFEST_PATH="${BACKUP_DIR}/manifest.json"
PG_DUMP="${BACKUP_DIR}/postgres.dump.gz"
SEAWEEDFS_DIR="${BACKUP_DIR}/seaweedfs"

if [[ ! -f "${MANIFEST_PATH}" ]]; then
  echo "[omnyid-backup-verify] ERROR: ${MANIFEST_PATH} not found."
  exit 1
fi

if [[ ! -f "${PG_DUMP}" ]]; then
  echo "[omnyid-backup-verify] ERROR: ${PG_DUMP} not found."
  exit 1
fi

if ! gzip -t "${PG_DUMP}" >/dev/null 2>&1; then
  echo "[omnyid-backup-verify] ERROR: ${PG_DUMP} failed gzip integrity validation." >&2
  exit 1
fi

python3 - <<'PY' "${MANIFEST_PATH}" "${PG_DUMP}" "${SEAWEEDFS_DIR}"
import gzip
import json
import os
import sys

manifest_path, pg_dump, seaweedfs_dir = sys.argv[1:4]

with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

dump_bytes_actual = os.path.getsize(pg_dump)
dump_bytes_manifest = int(manifest.get("postgres_dump_bytes", -1))
if dump_bytes_manifest != dump_bytes_actual:
    raise SystemExit(
        f"[omnyid-backup-verify] ERROR: manifest postgres_dump_bytes={dump_bytes_manifest} "
        f"does not match actual {dump_bytes_actual}"
    )

seaweedfs_expected = int(manifest.get("seaweedfs_file_count", 0))
seaweedfs_actual = 0
if os.path.isdir(seaweedfs_dir):
    for root, _dirs, files in os.walk(seaweedfs_dir):
        seaweedfs_actual += len(files)
if seaweedfs_expected != seaweedfs_actual:
    raise SystemExit(
        f"[omnyid-backup-verify] ERROR: manifest seaweedfs_file_count={seaweedfs_expected} "
        f"does not match actual {seaweedfs_actual}"
    )

print(
    "[omnyid-backup-verify] OK: manifest, Postgres archive, and SeaweedFS mirror are internally consistent."
)
PY

if command -v pg_restore >/dev/null 2>&1; then
  TMP_LOG="$(mktemp "${TMPDIR:-/tmp}/omnyid-backup-verify-XXXXXX.log")"
  trap 'rm -f "${TMP_LOG:-}"' EXIT
  # Stream directly into pg_restore so verification does not require
  # scratch space proportional to the decompressed archive size.
  set +e
  gzip -dc "${PG_DUMP}" | pg_restore --list >"${TMP_LOG}" 2>&1
  PIPE_STATUSES=("${PIPESTATUS[@]}")
  set -e
  GZIP_STATUS="${PIPE_STATUSES[0]:-1}"
  PG_RESTORE_STATUS="${PIPE_STATUSES[1]:-1}"
  if [[ "${PG_RESTORE_STATUS}" -ne 0 ]]; then
    detail="$(tr '\r\n' ' ' < "${TMP_LOG}" | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//')"
    if [[ -n "${detail}" ]]; then
      echo "[omnyid-backup-verify] ERROR: pg_restore could not read the decompressed Postgres archive: ${detail}" >&2
    else
      echo "[omnyid-backup-verify] ERROR: pg_restore could not read the decompressed Postgres archive." >&2
    fi
    exit 1
  fi
  if [[ "${GZIP_STATUS}" -ne 0 && "${GZIP_STATUS}" -ne 141 ]]; then
    echo "[omnyid-backup-verify] ERROR: gzip could not decompress the Postgres archive for pg_restore listing." >&2
    exit 1
  fi
  if [[ ! -s "${TMP_LOG}" ]]; then
    echo "[omnyid-backup-verify] ERROR: pg_restore produced no table-of-contents entries for the decompressed Postgres archive." >&2
    exit 1
  fi
  rm -f "${TMP_LOG}"
  trap - EXIT
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -Fx 'omnyid-backup-1' >/dev/null 2>&1; then
  case "${PG_DUMP}" in
    /var/backups/omnyid/*)
      CONTAINER_DUMP_PATH="/backups/${PG_DUMP#/var/backups/omnyid/}"
      ;;
    *)
      echo "[omnyid-backup-verify] WARNING: pg_restore unavailable on host and backup path is not under /var/backups/omnyid; skipping pg_restore archive listing." >&2
      CONTAINER_DUMP_PATH=""
      ;;
  esac
  if [[ -n "${CONTAINER_DUMP_PATH}" ]]; then
    CONTAINER_CMD=$(cat <<'EOF'
set -eu
dump_path="$1"
tmp_log="$(mktemp /tmp/omnyid-backup-verify-XXXXXX.log)"
trap 'rm -f "$tmp_log"' EXIT
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore unavailable inside backup container" >&2
  exit 127
fi
set +e
gzip -dc "$dump_path" | pg_restore --list >"$tmp_log" 2>&1
pipe_statuses=("${PIPESTATUS[@]}")
set -e
gzip_status="${pipe_statuses[0]:-1}"
pg_restore_status="${pipe_statuses[1]:-1}"
if [ "$pg_restore_status" -ne 0 ]; then
  cat "$tmp_log" >&2
  exit 1
fi
if [ "$gzip_status" -ne 0 ] && [ "$gzip_status" -ne 141 ]; then
  echo "gzip could not decompress the Postgres archive for pg_restore listing" >&2
  exit 1
fi
if [ ! -s "$tmp_log" ]; then
  echo "pg_restore produced no table-of-contents entries for the decompressed Postgres archive" >&2
  exit 1
fi
EOF
)
    CONTAINER_ERR_LOG="$(mktemp "${TMPDIR:-/tmp}/omnyid-backup-verify-XXXXXX.log")"
    trap 'rm -f "${CONTAINER_ERR_LOG:-}"' EXIT
    if ! docker exec omnyid-backup-1 sh -lc "${CONTAINER_CMD}" sh "${CONTAINER_DUMP_PATH}" > /dev/null 2>"${CONTAINER_ERR_LOG}"; then
      detail="$(tr '\r\n' ' ' < "${CONTAINER_ERR_LOG}" | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//')"
      if [[ -n "${detail}" ]]; then
        echo "[omnyid-backup-verify] ERROR: pg_restore inside omnyid-backup-1 could not read the decompressed Postgres archive: ${detail}" >&2
      else
        echo "[omnyid-backup-verify] ERROR: pg_restore inside omnyid-backup-1 could not read the decompressed Postgres archive." >&2
      fi
      exit 1
    fi
    rm -f "${CONTAINER_ERR_LOG}"
    trap - EXIT
  fi
else
  echo "[omnyid-backup-verify] WARNING: pg_restore and docker-backed fallback are unavailable; skipping archive listing check." >&2
fi

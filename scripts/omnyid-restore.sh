#!/usr/bin/env bash
# omnyid-restore.sh - Restore Postgres and SeaweedFS from a backup archive.
#
# Usage:
#   ./omnyid-restore.sh <backup_dir>
#
# Environment variables:
#   OMNYID_PG_HOST
#   OMNYID_PG_PORT
#   OMNYID_PG_USER
#   OMNYID_PG_DB
#   OMNYID_PG_PASSWORD
#   OMNYID_PG_PASSWORD_FILE
#   OMNYID_SEAWEEDFS_ALIAS
#   OMNYID_SEAWEEDFS_BUCKET
#   OMNYID_RESTORE_SKIP_POSTGRES
#   OMNYID_RESTORE_SKIP_SEAWEEDFS

set -euo pipefail

read_secret_env() {
  local key="$1"
  local direct="${!key:-}"
  if [[ -n "${direct//[[:space:]]/}" ]]; then
    printf '%s' "$direct"
    return 0
  fi
  local file_key="${key}_FILE"
  local file_path="${!file_key:-}"
  if [[ -z "${file_path//[[:space:]]/}" ]]; then
    return 0
  fi
  if [[ ! -f "$file_path" ]]; then
    echo "[omnyid-restore] ERROR: ${file_key} points to a missing file: $file_path" >&2
    exit 1
  fi
  local content
  content="$(<"$file_path")"
  content="${content%"${content##*[![:space:]]}"}"
  content="${content#"${content%%[![:space:]]*}"}"
  if [[ -z "$content" ]]; then
    echo "[omnyid-restore] ERROR: ${file_key} points to a blank file: $file_path" >&2
    exit 1
  fi
  printf '%s' "$content"
}

INPUT_PATH="${1:?Usage: omnyid-restore.sh <backup_dir>}"

resolve_backup_archive_dir() {
  local input_path="$1"
  if [[ -f "${input_path}/manifest.json" ]]; then
    printf '%s\n' "$input_path"
    return 0
  fi
  if [[ ! -d "$input_path" ]]; then
    echo "[omnyid-restore] ERROR: ${input_path} not found." >&2
    exit 1
  fi
  local latest_dir
  latest_dir="$(
    find "$input_path" -maxdepth 1 -mindepth 1 -type d -name '20*Z' | sort | tail -n 1
  )"
  if [[ -z "$latest_dir" || ! -f "${latest_dir}/manifest.json" ]]; then
    echo "[omnyid-restore] ERROR: no timestamped backup archive with manifest.json found under ${input_path}." >&2
    exit 1
  fi
  printf '%s\n' "$latest_dir"
}

BACKUP_DIR="$(resolve_backup_archive_dir "$INPUT_PATH")"

PG_HOST="${OMNYID_PG_HOST:-localhost}"
PG_PORT="${OMNYID_PG_PORT:-5432}"
PG_USER="${OMNYID_PG_USER:-afp}"
PG_DB="${OMNYID_PG_DB:-afp}"
PG_RESTORE_JOBS="${OMNYID_PG_RESTORE_JOBS:-1}"
PG_RESTORE_WORKDIR="${OMNYID_PG_RESTORE_WORKDIR:-}"
PG_RESTORE_VERBOSE="${OMNYID_PG_RESTORE_VERBOSE:-0}"
export PGPASSWORD="$(read_secret_env OMNYID_PG_PASSWORD)"
if [[ -z "${PGPASSWORD}" ]]; then
  PGPASSWORD="afp"
fi

SEAWEEDFS_ALIAS="${OMNYID_SEAWEEDFS_ALIAS:-omnyid-local}"
SEAWEEDFS_BUCKET="${OMNYID_SEAWEEDFS_BUCKET:-attachments}"
SKIP_POSTGRES="${OMNYID_RESTORE_SKIP_POSTGRES:-0}"
SKIP_SEAWEEDFS="${OMNYID_RESTORE_SKIP_SEAWEEDFS:-0}"

PG_DUMP="${BACKUP_DIR}/postgres.dump.gz"
SEAWEEDFS_DIR="${BACKUP_DIR}/seaweedfs"

if [[ ! -f "${PG_DUMP}" ]]; then
  echo "[omnyid-restore] ERROR: ${PG_DUMP} not found."
  exit 1
fi

echo "[omnyid-restore] Restoring from ${BACKUP_DIR}"

if [[ "${SKIP_POSTGRES}" != "1" ]]; then
  echo "[omnyid-restore] Dropping ${PG_DB} (if exists) and recreating..."
  psql \
    --host="${PG_HOST}" \
    --port="${PG_PORT}" \
    --username="${PG_USER}" \
    --dbname=postgres \
    --command="DROP DATABASE IF EXISTS ${PG_DB};"
  psql \
    --host="${PG_HOST}" \
    --port="${PG_PORT}" \
    --username="${PG_USER}" \
    --dbname=postgres \
    --command="CREATE DATABASE ${PG_DB};"

  echo "[omnyid-restore] Restoring Postgres dump..."
  pg_restore_args=(
    --host="${PG_HOST}"
    --port="${PG_PORT}"
    --username="${PG_USER}"
    --dbname="${PG_DB}"
    --no-owner
    --no-acl
    --exit-on-error
  )
  if [[ "${PG_RESTORE_VERBOSE}" == "1" ]]; then
    pg_restore_args+=(--verbose)
  fi

  if [[ "${PG_RESTORE_JOBS}" =~ ^[0-9]+$ ]] && (( PG_RESTORE_JOBS > 1 )); then
    if [[ -z "${PG_RESTORE_WORKDIR//[[:space:]]/}" ]]; then
      echo "[omnyid-restore] ERROR: OMNYID_PG_RESTORE_WORKDIR is required when OMNYID_PG_RESTORE_JOBS > 1." >&2
      exit 1
    fi
    mkdir -p "${PG_RESTORE_WORKDIR}"
    restore_dump_path="${PG_RESTORE_WORKDIR%/}/postgres.restore"
    rm -f "${restore_dump_path}"
    echo "[omnyid-restore] Expanding Postgres dump for parallel restore (${PG_RESTORE_JOBS} jobs)..."
    gzip -cd "${PG_DUMP}" > "${restore_dump_path}"
    pg_restore_args+=(--jobs="${PG_RESTORE_JOBS}")
    pg_restore "${pg_restore_args[@]}" "${restore_dump_path}"
    rm -f "${restore_dump_path}"
  else
    gzip -cd "${PG_DUMP}" | pg_restore "${pg_restore_args[@]}"
  fi
  echo "[omnyid-restore] Postgres restore complete."
else
  echo "[omnyid-restore] Skipping Postgres restore (OMNYID_RESTORE_SKIP_POSTGRES=1)."
fi

if [[ "${SKIP_SEAWEEDFS}" == "1" ]]; then
  echo "[omnyid-restore] Skipping SeaweedFS restore (OMNYID_RESTORE_SKIP_SEAWEEDFS=1)."
elif [[ -d "${SEAWEEDFS_DIR}" ]] && command -v mc >/dev/null 2>&1; then
  echo "[omnyid-restore] Restoring SeaweedFS bucket ${SEAWEEDFS_BUCKET}..."
  mc mirror --overwrite "${SEAWEEDFS_DIR}/" "${SEAWEEDFS_ALIAS}/${SEAWEEDFS_BUCKET}"
  echo "[omnyid-restore] SeaweedFS restore complete."
else
  echo "[omnyid-restore] Skipping SeaweedFS restore (no seaweedfs directory or mc not available)."
fi

echo "[omnyid-restore] Done. Start the homeserver to verify."

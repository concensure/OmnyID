#!/usr/bin/env bash
# omnyid-backup.sh - Back up Postgres data and SeaweedFS objects into a local archive.
#
# Usage:
#   ./omnyid-backup.sh [backup_dir]
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
#   OMNYID_BACKUP_RETAIN

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
    echo "[omnyid-backup] ERROR: ${file_key} points to a missing file: $file_path" >&2
    exit 1
  fi
  local content
  content="$(<"$file_path")"
  content="${content%"${content##*[![:space:]]}"}"
  content="${content#"${content%%[![:space:]]*}"}"
  if [[ -z "$content" ]]; then
    echo "[omnyid-backup] ERROR: ${file_key} points to a blank file: $file_path" >&2
    exit 1
  fi
  printf '%s' "$content"
}

BACKUP_DIR="${1:-/var/backups/omnyid}"
TIMESTAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
DEST="${BACKUP_DIR}/${TIMESTAMP}"
STAGING_DEST="${BACKUP_DIR}/.${TIMESTAMP}.tmp"

PG_HOST="${OMNYID_PG_HOST:-localhost}"
PG_PORT="${OMNYID_PG_PORT:-5432}"
PG_USER="${OMNYID_PG_USER:-afp}"
PG_DB="${OMNYID_PG_DB:-afp}"
export PGPASSWORD="$(read_secret_env OMNYID_PG_PASSWORD)"
if [[ -z "${PGPASSWORD}" ]]; then
  PGPASSWORD="afp"
fi

SEAWEEDFS_ALIAS="${OMNYID_SEAWEEDFS_ALIAS:-omnyid-local}"
SEAWEEDFS_BUCKET="${OMNYID_SEAWEEDFS_BUCKET:-attachments}"
RETAIN_DAYS="${OMNYID_BACKUP_RETAIN:-30}"

cleanup_failed_backup() {
  rm -rf "${STAGING_DEST}"
}

trap cleanup_failed_backup ERR

mkdir -p "${STAGING_DEST}/seaweedfs"

echo "[omnyid-backup] Starting backup to ${DEST}"

echo "[omnyid-backup] Dumping Postgres ${PG_DB}..."
PG_SOURCE_DB_BYTES="$(
  psql \
    --host="${PG_HOST}" \
    --port="${PG_PORT}" \
    --username="${PG_USER}" \
    --dbname="${PG_DB}" \
    --tuples-only \
    --no-align \
    --command="SELECT pg_database_size(current_database());" 2>/dev/null | tr -d '[:space:]'
)"
if [[ -z "${PG_SOURCE_DB_BYTES}" || ! "${PG_SOURCE_DB_BYTES}" =~ ^[0-9]+$ ]]; then
  PG_SOURCE_DB_BYTES=0
fi
PG_SOURCE_DB_PRETTY="$(
  psql \
    --host="${PG_HOST}" \
    --port="${PG_PORT}" \
    --username="${PG_USER}" \
    --dbname="${PG_DB}" \
    --tuples-only \
    --no-align \
    --command="SELECT pg_size_pretty(pg_database_size(current_database()));" 2>/dev/null | tr -d '[:space:]'
)"
if [[ -z "${PG_SOURCE_DB_PRETTY}" ]]; then
  PG_SOURCE_DB_PRETTY="unknown"
fi
pg_dump \
  --host="${PG_HOST}" \
  --port="${PG_PORT}" \
  --username="${PG_USER}" \
  --format=custom \
  "${PG_DB}" | gzip > "${STAGING_DEST}/postgres.dump.gz"
echo "[omnyid-backup] Postgres dump complete."

if command -v mc >/dev/null 2>&1 && mc --help >/dev/null 2>&1; then
  if mc ls "${SEAWEEDFS_ALIAS}/${SEAWEEDFS_BUCKET}" >/dev/null 2>&1; then
    echo "[omnyid-backup] Mirroring SeaweedFS bucket ${SEAWEEDFS_BUCKET}..."
    mc mirror --overwrite "${SEAWEEDFS_ALIAS}/${SEAWEEDFS_BUCKET}" "${STAGING_DEST}/seaweedfs/"
    echo "[omnyid-backup] SeaweedFS mirror complete."
  else
    echo "[omnyid-backup] WARNING: SeaweedFS alias or bucket is unavailable; skipping SeaweedFS backup."
  fi
else
  echo "[omnyid-backup] WARNING: mc unavailable or not executable; skipping SeaweedFS backup."
fi

PG_SIZE="$(stat --printf='%s' "${STAGING_DEST}/postgres.dump.gz" 2>/dev/null || echo 0)"
SEAWEEDFS_COUNT="$(find "${STAGING_DEST}/seaweedfs" -type f | wc -l)"
cat > "${STAGING_DEST}/manifest.json" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "postgres_db": "${PG_DB}",
  "postgres_dump_bytes": ${PG_SIZE},
  "postgres_live_db_bytes": ${PG_SOURCE_DB_BYTES},
  "postgres_live_db_pretty": "${PG_SOURCE_DB_PRETTY}",
  "seaweedfs_bucket": "${SEAWEEDFS_BUCKET}",
  "seaweedfs_file_count": ${SEAWEEDFS_COUNT},
  "backup_tool": "omnyid-backup.sh",
  "verification": {
    "status": "pending",
    "verified_at": null
  },
  "restore_command": "omnyid-restore.sh ${DEST}"
}
EOF
echo "[omnyid-backup] Manifest written."

rm -rf "${DEST}"
mv "${STAGING_DEST}" "${DEST}"
trap - ERR

echo "[omnyid-backup] Pruning backups older than ${RETAIN_DAYS} days..."
find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d \
  -name '20*Z' \
  -mtime "+${RETAIN_DAYS}" \
  -exec rm -rf {} \;
echo "[omnyid-backup] Done. Archive: ${DEST}"

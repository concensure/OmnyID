#!/usr/bin/env bash
# omnyid-backup.sh — Backup Postgres data and MinIO objects to a local archive.
#
# Usage:
#   ./omnyid-backup.sh [backup_dir]
#
# Environment variables (all optional, defaults suit docker-compose.yml):
#   OMNYID_PG_HOST        Postgres host (default: localhost)
#   OMNYID_PG_PORT        Postgres port (default: 5432)
#   OMNYID_PG_USER        Postgres user (default: afp)
#   OMNYID_PG_DB          Postgres database name (default: afp)
#   OMNYID_PG_PASSWORD    Postgres password (default: afp)
#   OMNYID_MINIO_ALIAS    MinIO mc alias name (default: omnyid-local)
#   OMNYID_MINIO_BUCKET   MinIO bucket to back up (default: attachments)
#   OMNYID_BACKUP_RETAIN  Days to keep old backups (default: 30)
#
# The script creates:
#   <backup_dir>/<timestamp>/postgres.dump.gz
#   <backup_dir>/<timestamp>/minio/          (mirrored bucket contents)
#   <backup_dir>/<timestamp>/manifest.json

set -euo pipefail

BACKUP_DIR="${1:-/var/backups/omnyid}"
TIMESTAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
DEST="${BACKUP_DIR}/${TIMESTAMP}"

PG_HOST="${OMNYID_PG_HOST:-localhost}"
PG_PORT="${OMNYID_PG_PORT:-5432}"
PG_USER="${OMNYID_PG_USER:-afp}"
PG_DB="${OMNYID_PG_DB:-afp}"
export PGPASSWORD="${OMNYID_PG_PASSWORD:-afp}"

MINIO_ALIAS="${OMNYID_MINIO_ALIAS:-omnyid-local}"
MINIO_BUCKET="${OMNYID_MINIO_BUCKET:-attachments}"
RETAIN_DAYS="${OMNYID_BACKUP_RETAIN:-30}"

mkdir -p "${DEST}/minio"

echo "[omnyid-backup] Starting backup → ${DEST}"

# ── 1. Postgres dump ──────────────────────────────────────────────────────────
echo "[omnyid-backup] Dumping Postgres ${PG_DB}..."
pg_dump \
  --host="${PG_HOST}" \
  --port="${PG_PORT}" \
  --username="${PG_USER}" \
  --format=custom \
  "${PG_DB}" \
  | gzip > "${DEST}/postgres.dump.gz"
echo "[omnyid-backup] Postgres dump complete."

# ── 2. MinIO mirror ───────────────────────────────────────────────────────────
if command -v mc &>/dev/null; then
  echo "[omnyid-backup] Mirroring MinIO bucket ${MINIO_BUCKET}..."
  mc mirror --overwrite "${MINIO_ALIAS}/${MINIO_BUCKET}" "${DEST}/minio/"
  echo "[omnyid-backup] MinIO mirror complete."
else
  echo "[omnyid-backup] WARNING: mc not found; skipping MinIO backup."
fi

# ── 3. Manifest ───────────────────────────────────────────────────────────────
PG_SIZE="$(stat --printf='%s' "${DEST}/postgres.dump.gz" 2>/dev/null || echo 0)"
MINIO_COUNT="$(find "${DEST}/minio" -type f | wc -l)"
cat > "${DEST}/manifest.json" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "postgres_db": "${PG_DB}",
  "postgres_dump_bytes": ${PG_SIZE},
  "minio_bucket": "${MINIO_BUCKET}",
  "minio_file_count": ${MINIO_COUNT},
  "backup_tool": "omnyid-backup.sh",
  "restore_command": "omnyid-restore.sh ${DEST}"
}
EOF
echo "[omnyid-backup] Manifest written."

# ── 4. Prune old backups ──────────────────────────────────────────────────────
echo "[omnyid-backup] Pruning backups older than ${RETAIN_DAYS} days..."
find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d \
  -name '20*Z' \
  -mtime "+${RETAIN_DAYS}" \
  -exec rm -rf {} \;
echo "[omnyid-backup] Done. Archive: ${DEST}"

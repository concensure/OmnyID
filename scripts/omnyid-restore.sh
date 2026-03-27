#!/usr/bin/env bash
# omnyid-restore.sh — Restore Postgres and MinIO from a backup archive.
#
# Usage:
#   ./omnyid-restore.sh <backup_dir>
#
# The backup_dir must contain a postgres.dump.gz produced by omnyid-backup.sh.
# MinIO objects are restored only if the minio/ sub-directory is present and
# the `mc` CLI is available.
#
# Environment variables (match omnyid-backup.sh):
#   OMNYID_PG_HOST, OMNYID_PG_PORT, OMNYID_PG_USER, OMNYID_PG_DB,
#   OMNYID_PG_PASSWORD, OMNYID_MINIO_ALIAS, OMNYID_MINIO_BUCKET

set -euo pipefail

BACKUP_DIR="${1:?Usage: omnyid-restore.sh <backup_dir>}"

PG_HOST="${OMNYID_PG_HOST:-localhost}"
PG_PORT="${OMNYID_PG_PORT:-5432}"
PG_USER="${OMNYID_PG_USER:-afp}"
PG_DB="${OMNYID_PG_DB:-afp}"
export PGPASSWORD="${OMNYID_PG_PASSWORD:-afp}"

MINIO_ALIAS="${OMNYID_MINIO_ALIAS:-omnyid-local}"
MINIO_BUCKET="${OMNYID_MINIO_BUCKET:-attachments}"

PG_DUMP="${BACKUP_DIR}/postgres.dump.gz"
MINIO_DIR="${BACKUP_DIR}/minio"

if [[ ! -f "${PG_DUMP}" ]]; then
  echo "[omnyid-restore] ERROR: ${PG_DUMP} not found."
  exit 1
fi

echo "[omnyid-restore] Restoring from ${BACKUP_DIR}"

# ── 1. Drop and recreate Postgres DB ──────────────────────────────────────────
echo "[omnyid-restore] Dropping ${PG_DB} (if exists) and recreating..."
psql \
  --host="${PG_HOST}" \
  --port="${PG_PORT}" \
  --username="${PG_USER}" \
  --dbname=postgres \
  --command="DROP DATABASE IF EXISTS ${PG_DB}; CREATE DATABASE ${PG_DB};"

# ── 2. Restore Postgres dump ──────────────────────────────────────────────────
echo "[omnyid-restore] Restoring Postgres dump..."
zcat "${PG_DUMP}" | pg_restore \
  --host="${PG_HOST}" \
  --port="${PG_PORT}" \
  --username="${PG_USER}" \
  --dbname="${PG_DB}" \
  --no-owner \
  --no-acl \
  --exit-on-error
echo "[omnyid-restore] Postgres restore complete."

# ── 3. Restore MinIO objects ──────────────────────────────────────────────────
if [[ -d "${MINIO_DIR}" ]] && command -v mc &>/dev/null; then
  echo "[omnyid-restore] Restoring MinIO bucket ${MINIO_BUCKET}..."
  mc mirror --overwrite "${MINIO_DIR}/" "${MINIO_ALIAS}/${MINIO_BUCKET}"
  echo "[omnyid-restore] MinIO restore complete."
else
  echo "[omnyid-restore] Skipping MinIO restore (no minio/ dir or mc not available)."
fi

echo "[omnyid-restore] Done. Start the homeserver to verify."

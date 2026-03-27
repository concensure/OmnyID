#!/usr/bin/env bash
# omnyid-upgrade.sh — Safe in-place upgrade for self-hosted OmnyID deployments.
#
# Workflow:
#   1. Take a backup (omnyid-backup.sh) so the operator can roll back.
#   2. Pull the latest image or rebuild from source.
#   3. Run database migrations (homeserver auto-applies them on startup).
#   4. Restart the homeserver container.
#   5. Run a healthcheck and print the result.
#
# Usage:
#   ./omnyid-upgrade.sh [backup_dir]
#
# Set OMNYID_COMPOSE_FILE to use a non-default docker-compose file.
# Set OMNYID_SKIP_BACKUP=1 to skip the pre-upgrade backup (not recommended).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
BACKUP_DIR="${1:-/var/backups/omnyid}"
COMPOSE_FILE="${OMNYID_COMPOSE_FILE:-${PROJECT_ROOT}/docker-compose.oracle.minimal.yml}"
SKIP_BACKUP="${OMNYID_SKIP_BACKUP:-0}"

cd "${PROJECT_ROOT}"

echo "[omnyid-upgrade] Starting upgrade from ${PROJECT_ROOT}"

# ── 1. Pre-upgrade backup ──────────────────────────────────────────────────────
if [[ "${SKIP_BACKUP}" != "1" ]]; then
  echo "[omnyid-upgrade] Creating pre-upgrade backup..."
  bash "${SCRIPT_DIR}/omnyid-backup.sh" "${BACKUP_DIR}" || {
    echo "[omnyid-upgrade] WARNING: backup failed; aborting upgrade for safety."
    echo "  Set OMNYID_SKIP_BACKUP=1 to force upgrade without a backup (not recommended)."
    exit 1
  }
  echo "[omnyid-upgrade] Backup complete."
fi

# ── 2. Pull or build ───────────────────────────────────────────────────────────
if docker compose -f "${COMPOSE_FILE}" config --services 2>/dev/null | grep -q homeserver; then
  echo "[omnyid-upgrade] Pulling latest images..."
  docker compose -f "${COMPOSE_FILE}" pull --quiet homeserver || true
fi

echo "[omnyid-upgrade] Rebuilding homeserver..."
docker compose -f "${COMPOSE_FILE}" build homeserver

# ── 3. Restart (migrations run automatically on startup) ─────────────────────
echo "[omnyid-upgrade] Restarting homeserver (migrations will apply on boot)..."
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate homeserver

# ── 4. Healthcheck ────────────────────────────────────────────────────────────
RETRIES=12
HEALTH_URL="${OMNYID_HEALTH_URL:-http://localhost:8080/healthz}"
echo "[omnyid-upgrade] Waiting for homeserver at ${HEALTH_URL}..."
for i in $(seq 1 "${RETRIES}"); do
  if curl -sf "${HEALTH_URL}" > /dev/null 2>&1; then
    echo "[omnyid-upgrade] Homeserver is healthy."
    break
  fi
  if [[ "${i}" -eq "${RETRIES}" ]]; then
    echo "[omnyid-upgrade] ERROR: homeserver did not become healthy after ${RETRIES} attempts."
    echo "  Check logs: docker compose -f ${COMPOSE_FILE} logs homeserver"
    exit 1
  fi
  echo "[omnyid-upgrade] Attempt ${i}/${RETRIES} failed; retrying in 5 s..."
  sleep 5
done

echo "[omnyid-upgrade] Upgrade complete."

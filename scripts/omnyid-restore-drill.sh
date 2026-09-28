#!/usr/bin/env bash
# omnyid-restore-drill.sh - Replay a backup into disposable Postgres and object-store targets.
#
# Usage:
#   ./omnyid-restore-drill.sh <backup_dir>
#
# This drill verifies:
#   - the backup archive passes omnyid-backup-verify.sh
#   - the Postgres dump can be restored into a clean disposable database
#   - core OmnyID tables exist after restore
#   - the SeaweedFS mirror can be replayed into a clean disposable S3-compatible bucket
#   - the restored object count matches the backup manifest

set -euo pipefail

INPUT_PATH="${1:?Usage: omnyid-restore-drill.sh <backup_dir>}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

resolve_backup_archive_dir() {
  local input_path="$1"
  if [[ -f "${input_path}/manifest.json" ]]; then
    printf '%s\n' "$input_path"
    return 0
  fi
  if [[ ! -d "$input_path" ]]; then
    echo "[omnyid-restore-drill] ERROR: ${input_path} not found." >&2
    exit 1
  fi
  local latest_dir
  latest_dir="$(
    find "$input_path" -maxdepth 1 -mindepth 1 -type d -name '20*Z' | sort | tail -n 1
  )"
  if [[ -z "$latest_dir" || ! -f "${latest_dir}/manifest.json" ]]; then
    echo "[omnyid-restore-drill] ERROR: no timestamped backup archive with manifest.json found under ${input_path}." >&2
    exit 1
  fi
  printf '%s\n' "$latest_dir"
}

BACKUP_DIR="$(resolve_backup_archive_dir "$INPUT_PATH")"

PG_USER="${OMNYID_PG_USER:-afp}"
PG_DB="${OMNYID_PG_DB:-afp}"
DRILL_IMAGE="${OMNYID_RESTORE_DRILL_IMAGE:-pgvector/pgvector:pg18}"
READY_TIMEOUT_SECS="${OMNYID_RESTORE_DRILL_TIMEOUT_SECS:-30}"
RESTORE_STEP_TIMEOUT_SECS="${OMNYID_RESTORE_DRILL_RESTORE_TIMEOUT_SECS:-600}"
OBJECTSTORE_STEP_TIMEOUT_SECS="${OMNYID_RESTORE_DRILL_OBJECTSTORE_TIMEOUT_SECS:-180}"
PG_SHM_SIZE="${OMNYID_RESTORE_DRILL_PG_SHM_SIZE:-1g}"
PG_MEMORY_LIMIT="${OMNYID_RESTORE_DRILL_PG_MEMORY_LIMIT:-2g}"
PG_SHARED_BUFFERS="${OMNYID_RESTORE_DRILL_PG_SHARED_BUFFERS:-256MB}"
PG_MAINTENANCE_WORK_MEM="${OMNYID_RESTORE_DRILL_PG_MAINTENANCE_WORK_MEM:-512MB}"
PG_MAX_WAL_SIZE="${OMNYID_RESTORE_DRILL_PG_MAX_WAL_SIZE:-2GB}"
PG_SYNCHRONOUS_COMMIT="${OMNYID_RESTORE_DRILL_PG_SYNCHRONOUS_COMMIT:-off}"
PG_FSYNC="${OMNYID_RESTORE_DRILL_PG_FSYNC:-off}"
PG_FULL_PAGE_WRITES="${OMNYID_RESTORE_DRILL_PG_FULL_PAGE_WRITES:-off}"
PG_RESTORE_JOBS="${OMNYID_RESTORE_DRILL_PG_RESTORE_JOBS:-4}"
DRILL_ID="$(date -u '+%Y%m%dT%H%M%SZ')-$$"
PG_CONTAINER_NAME="omnyid-restore-drill-pg-${DRILL_ID}"

SEAWEEDFS_BUCKET="${OMNYID_SEAWEEDFS_BUCKET:-attachments}"
OBJECTSTORE_IMAGE="${OMNYID_RESTORE_DRILL_OBJECTSTORE_IMAGE:-minio/minio:RELEASE.2024-07-29T22-14-52Z}"
OBJECTSTORE_CLIENT_IMAGE="${OMNYID_RESTORE_DRILL_OBJECTSTORE_CLIENT_IMAGE:-minio/mc:RELEASE.2025-08-13T08-35-41Z}"
OBJECTSTORE_PORT="${OMNYID_RESTORE_DRILL_OBJECTSTORE_PORT:-9000}"
OBJECTSTORE_ROOT_USER="${OMNYID_RESTORE_DRILL_OBJECTSTORE_ROOT_USER:-omnyidrestore}"
OBJECTSTORE_ROOT_PASSWORD="${OMNYID_RESTORE_DRILL_OBJECTSTORE_ROOT_PASSWORD:-omnyidrestore123}"
OBJECTSTORE_ALIAS="${OMNYID_RESTORE_DRILL_OBJECTSTORE_ALIAS:-restore-drill}"
OBJECTSTORE_CONTAINER_NAME="omnyid-restore-drill-obj-${DRILL_ID}"
SOURCE_DB_BYTES_OVERRIDE="${OMNYID_RESTORE_DRILL_SOURCE_DB_BYTES:-}"
SPACE_HEADROOM_BYTES="${OMNYID_RESTORE_DRILL_SPACE_HEADROOM_BYTES:-1073741824}"
SPACE_MULTIPLIER_PCT="${OMNYID_RESTORE_DRILL_SPACE_MULTIPLIER_PCT:-110}"

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
    echo "[omnyid-restore-drill] ERROR: ${file_key} points to a missing file: $file_path" >&2
    exit 1
  fi
  local content
  content="$(<"$file_path")"
  content="${content%"${content##*[![:space:]]}"}"
  content="${content#"${content%%[![:space:]]*}"}"
  if [[ -z "$content" ]]; then
    echo "[omnyid-restore-drill] ERROR: ${file_key} points to a blank file: $file_path" >&2
    exit 1
  fi
  printf '%s' "$content"
}

PG_PASSWORD="$(read_secret_env OMNYID_PG_PASSWORD)"
if [[ -z "${PG_PASSWORD}" ]]; then
  PG_PASSWORD="afp"
fi

run_with_optional_timeout() {
  local timeout_secs="$1"
  shift

  if [[ -n "${timeout_secs//[[:space:]]/}" && "$timeout_secs" =~ ^[0-9]+$ ]] && (( timeout_secs > 0 )) && command -v timeout >/dev/null 2>&1; then
    timeout "$timeout_secs" "$@"
    return $?
  fi

  "$@"
}

log_phase() {
  local message="$1"
  printf '[omnyid-restore-drill] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$message"
}

cleanup() {
  # Remove anonymous volumes created by disposable drill containers as well.
  docker rm -f -v "${PG_CONTAINER_NAME}" >/dev/null 2>&1 || true
  docker rm -f -v "${OBJECTSTORE_CONTAINER_NAME}" >/dev/null 2>&1 || true
  rm -rf "${RESTORE_WORKDIR_HOST}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

RESTORE_WORKDIR_HOST="$(mktemp -d "${TMPDIR:-/tmp}/omnyid-restore-drill-work.XXXXXX")"
RESTORE_WORKDIR_CONTAINER="/restore-work"

seaweedfs_file_count="$(python3 - <<'PY' "${BACKUP_DIR}/manifest.json"
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

print(int(manifest.get("seaweedfs_file_count", 0)))
PY
)"

postgres_live_db_bytes="$(python3 - <<'PY' "${BACKUP_DIR}/manifest.json"
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

value = manifest.get("postgres_live_db_bytes", 0)
try:
    value = int(value or 0)
except (TypeError, ValueError):
    value = 0
print(max(value, 0))
PY
)"

if [[ -n "${SOURCE_DB_BYTES_OVERRIDE//[[:space:]]/}" ]]; then
  postgres_live_db_bytes="${SOURCE_DB_BYTES_OVERRIDE}"
fi
if [[ -z "${postgres_live_db_bytes}" || ! "${postgres_live_db_bytes}" =~ ^[0-9]+$ ]]; then
  postgres_live_db_bytes=0
fi
if [[ -z "${SPACE_HEADROOM_BYTES}" || ! "${SPACE_HEADROOM_BYTES}" =~ ^[0-9]+$ ]]; then
  SPACE_HEADROOM_BYTES=1073741824
fi
if [[ -z "${SPACE_MULTIPLIER_PCT}" || ! "${SPACE_MULTIPLIER_PCT}" =~ ^[0-9]+$ ]]; then
  SPACE_MULTIPLIER_PCT=110
fi

if [[ "${postgres_live_db_bytes}" -gt 0 ]]; then
  free_root_bytes="$(df -B1 / | awk 'END {print $4}')"
  if [[ -z "${free_root_bytes}" || ! "${free_root_bytes}" =~ ^[0-9]+$ ]]; then
    echo "[omnyid-restore-drill] ERROR: could not determine free root disk bytes for restore preflight."
    exit 1
  fi

  required_restore_bytes=$(( (postgres_live_db_bytes * SPACE_MULTIPLIER_PCT + 99) / 100 + SPACE_HEADROOM_BYTES ))
  log_phase "restore_preflight source_db_bytes=${postgres_live_db_bytes} free_root_bytes=${free_root_bytes} required_bytes=${required_restore_bytes} restore_jobs=${PG_RESTORE_JOBS} restore_timeout_secs=${RESTORE_STEP_TIMEOUT_SECS} objectstore_timeout_secs=${OBJECTSTORE_STEP_TIMEOUT_SECS}"
  if (( free_root_bytes < required_restore_bytes )); then
    echo "[omnyid-restore-drill] ERROR: insufficient free disk for restore preflight. free_root_bytes=${free_root_bytes} required_bytes=${required_restore_bytes} source_db_bytes=${postgres_live_db_bytes} multiplier_pct=${SPACE_MULTIPLIER_PCT} headroom_bytes=${SPACE_HEADROOM_BYTES}."
    exit 1
  fi
fi

echo "[omnyid-restore-drill] Verifying backup archive ${BACKUP_DIR}..."
bash "${SCRIPT_DIR}/omnyid-backup-verify.sh" "${BACKUP_DIR}"

echo "[omnyid-restore-drill] Starting disposable Postgres container ${PG_CONTAINER_NAME}..."
docker run -d \
  --name "${PG_CONTAINER_NAME}" \
  --shm-size="${PG_SHM_SIZE}" \
  --memory="${PG_MEMORY_LIMIT}" \
  -e POSTGRES_USER="${PG_USER}" \
  -e POSTGRES_PASSWORD="${PG_PASSWORD}" \
  -e POSTGRES_DB=postgres \
  "${DRILL_IMAGE}" \
  -c "shared_buffers=${PG_SHARED_BUFFERS}" \
  -c "maintenance_work_mem=${PG_MAINTENANCE_WORK_MEM}" \
  -c "max_wal_size=${PG_MAX_WAL_SIZE}" \
  -c "synchronous_commit=${PG_SYNCHRONOUS_COMMIT}" \
  -c "fsync=${PG_FSYNC}" \
  -c "full_page_writes=${PG_FULL_PAGE_WRITES}" >/dev/null

ready=0
for _ in $(seq 1 "${READY_TIMEOUT_SECS}"); do
  if docker exec "${PG_CONTAINER_NAME}" pg_isready -U "${PG_USER}" -d postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "${ready}" != "1" ]]; then
  echo "[omnyid-restore-drill] ERROR: disposable Postgres did not become ready in time."
  exit 1
fi

echo "[omnyid-restore-drill] Replaying restore into disposable database..."
restore_started_at_epoch="$(date +%s)"
log_phase "restore_phase_started"
restore_log="$(mktemp)"
set +e
run_with_optional_timeout "${RESTORE_STEP_TIMEOUT_SECS}" docker run --rm \
  --network "container:${PG_CONTAINER_NAME}" \
  -e OMNYID_PG_HOST=127.0.0.1 \
  -e OMNYID_PG_PORT=5432 \
  -e OMNYID_PG_USER="${PG_USER}" \
  -e OMNYID_PG_PASSWORD="${PG_PASSWORD}" \
  -e OMNYID_PG_DB="${PG_DB}" \
  -e OMNYID_PG_RESTORE_JOBS="${PG_RESTORE_JOBS}" \
  -e OMNYID_PG_RESTORE_WORKDIR="${RESTORE_WORKDIR_CONTAINER}" \
  -e OMNYID_RESTORE_SKIP_SEAWEEDFS=1 \
  -v "${BACKUP_DIR}:/backup:ro" \
  -v "${RESTORE_WORKDIR_HOST}:${RESTORE_WORKDIR_CONTAINER}" \
  -v "${SCRIPT_DIR}/omnyid-restore.sh:/usr/local/bin/omnyid-restore.sh:ro" \
  "${DRILL_IMAGE}" \
  bash /usr/local/bin/omnyid-restore.sh /backup >"${restore_log}" 2>&1
restore_exit_code=$?
set -e

if [[ "${restore_exit_code}" != "0" ]]; then
  restore_finished_at_epoch="$(date +%s)"
  restore_elapsed_seconds=$(( restore_finished_at_epoch - restore_started_at_epoch ))
  log_phase "restore_phase_failed elapsed_seconds=${restore_elapsed_seconds} exit_code=${restore_exit_code}"
  if [[ "${restore_exit_code}" == "124" ]]; then
    echo "[omnyid-restore-drill] ERROR: restore command exceeded timeout (${RESTORE_STEP_TIMEOUT_SECS}s)." >&2
  else
    echo "[omnyid-restore-drill] ERROR: restore command failed." >&2
  fi
  cat "${restore_log}" >&2 || true
  echo "[omnyid-restore-drill] Disposable Postgres logs (tail 200):" >&2
  docker logs --tail 200 "${PG_CONTAINER_NAME}" >&2 || true
  rm -f "${restore_log}"
  exit 1
fi
cat "${restore_log}"
rm -f "${restore_log}"
restore_finished_at_epoch="$(date +%s)"
restore_elapsed_seconds=$(( restore_finished_at_epoch - restore_started_at_epoch ))
log_phase "restore_phase_completed elapsed_seconds=${restore_elapsed_seconds}"

echo "[omnyid-restore-drill] Running schema sanity checks..."
table_count="$(docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER_NAME}" \
  psql -U "${PG_USER}" -d "${PG_DB}" -Atqc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"

if [[ -z "${table_count}" || "${table_count}" -lt 5 ]]; then
  echo "[omnyid-restore-drill] ERROR: restored database has an unexpectedly low public table count (${table_count:-0})."
  exit 1
fi

required_tables=(
  "messages"
  "users"
  "billing_subscriptions"
  "daemon_registrations"
  "cost_records"
)

for table_name in "${required_tables[@]}"; do
  exists="$(docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER_NAME}" \
    psql -U "${PG_USER}" -d "${PG_DB}" -Atqc \
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table_name}');")"
  if [[ "${exists}" != "t" ]]; then
    echo "[omnyid-restore-drill] ERROR: required table ${table_name} is missing after restore."
    exit 1
  fi
done

migration_rows="$(docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER_NAME}" \
  psql -U "${PG_USER}" -d "${PG_DB}" -Atqc \
  "SELECT count(*) FROM omnyid_schema_migrations;")"

if [[ "${seaweedfs_file_count}" == "0" ]]; then
  echo "[omnyid-restore-drill] Skipping object-store replay because the backup manifest contains no SeaweedFS objects."
  echo "[omnyid-restore-drill] OK: restore replay succeeded."
  echo "[omnyid-restore-drill] Public table count: ${table_count}"
  echo "[omnyid-restore-drill] Migration rows: ${migration_rows:-0}"
  echo "[omnyid-restore-drill] Restored object count: 0"
  exit 0
fi

echo "[omnyid-restore-drill] Starting disposable object-store container ${OBJECTSTORE_CONTAINER_NAME}..."
docker run -d \
  --name "${OBJECTSTORE_CONTAINER_NAME}" \
  -e MINIO_ROOT_USER="${OBJECTSTORE_ROOT_USER}" \
  -e MINIO_ROOT_PASSWORD="${OBJECTSTORE_ROOT_PASSWORD}" \
  "${OBJECTSTORE_IMAGE}" server /data --address ":${OBJECTSTORE_PORT}" >/dev/null

objectstore_ready=0
for _ in $(seq 1 "${READY_TIMEOUT_SECS}"); do
  if docker run --rm \
    --network "container:${OBJECTSTORE_CONTAINER_NAME}" \
    --entrypoint sh \
    "${OBJECTSTORE_CLIENT_IMAGE}" \
    -c "mc alias set ${OBJECTSTORE_ALIAS} http://127.0.0.1:${OBJECTSTORE_PORT} ${OBJECTSTORE_ROOT_USER} ${OBJECTSTORE_ROOT_PASSWORD} >/dev/null 2>&1"; then
    objectstore_ready=1
    break
  fi
  sleep 1
done

if [[ "${objectstore_ready}" != "1" ]]; then
  echo "[omnyid-restore-drill] ERROR: disposable object store did not become ready in time."
  exit 1
fi

echo "[omnyid-restore-drill] Creating disposable bucket ${SEAWEEDFS_BUCKET}..."
docker run --rm \
  --network "container:${OBJECTSTORE_CONTAINER_NAME}" \
  --entrypoint sh \
  "${OBJECTSTORE_CLIENT_IMAGE}" \
  -c "mc alias set ${OBJECTSTORE_ALIAS} http://127.0.0.1:${OBJECTSTORE_PORT} ${OBJECTSTORE_ROOT_USER} ${OBJECTSTORE_ROOT_PASSWORD} >/dev/null && mc mb --ignore-existing ${OBJECTSTORE_ALIAS}/${SEAWEEDFS_BUCKET} >/dev/null"

echo "[omnyid-restore-drill] Replaying SeaweedFS mirror into disposable object store..."
objectstore_started_at_epoch="$(date +%s)"
log_phase "objectstore_phase_started"
set +e
run_with_optional_timeout "${OBJECTSTORE_STEP_TIMEOUT_SECS}" docker run --rm \
  --network "container:${OBJECTSTORE_CONTAINER_NAME}" \
  -v "${BACKUP_DIR}:/backup:ro" \
  --entrypoint sh \
  "${OBJECTSTORE_CLIENT_IMAGE}" \
  -c "mc alias set ${OBJECTSTORE_ALIAS} http://127.0.0.1:${OBJECTSTORE_PORT} ${OBJECTSTORE_ROOT_USER} ${OBJECTSTORE_ROOT_PASSWORD} >/dev/null && mc mirror --overwrite /backup/seaweedfs/ ${OBJECTSTORE_ALIAS}/${SEAWEEDFS_BUCKET} >/dev/null"
mirror_exit_code=$?
set -e
if [[ "${mirror_exit_code}" == "124" ]]; then
  objectstore_finished_at_epoch="$(date +%s)"
  objectstore_elapsed_seconds=$(( objectstore_finished_at_epoch - objectstore_started_at_epoch ))
  log_phase "objectstore_phase_failed elapsed_seconds=${objectstore_elapsed_seconds} exit_code=${mirror_exit_code}"
  echo "[omnyid-restore-drill] ERROR: SeaweedFS mirror exceeded timeout (${OBJECTSTORE_STEP_TIMEOUT_SECS}s)."
  exit 1
fi
if [[ "${mirror_exit_code}" != "0" ]]; then
  objectstore_finished_at_epoch="$(date +%s)"
  objectstore_elapsed_seconds=$(( objectstore_finished_at_epoch - objectstore_started_at_epoch ))
  log_phase "objectstore_phase_failed elapsed_seconds=${objectstore_elapsed_seconds} exit_code=${mirror_exit_code}"
  echo "[omnyid-restore-drill] ERROR: SeaweedFS mirror replay failed."
  exit 1
fi
objectstore_finished_at_epoch="$(date +%s)"
objectstore_elapsed_seconds=$(( objectstore_finished_at_epoch - objectstore_started_at_epoch ))
log_phase "objectstore_phase_completed elapsed_seconds=${objectstore_elapsed_seconds}"

restored_seaweedfs_count="$(docker run --rm \
  --network "container:${OBJECTSTORE_CONTAINER_NAME}" \
  --entrypoint sh \
  "${OBJECTSTORE_CLIENT_IMAGE}" \
  -c "mc alias set ${OBJECTSTORE_ALIAS} http://127.0.0.1:${OBJECTSTORE_PORT} ${OBJECTSTORE_ROOT_USER} ${OBJECTSTORE_ROOT_PASSWORD} >/dev/null && mc find ${OBJECTSTORE_ALIAS}/${SEAWEEDFS_BUCKET} --type f | wc -l" | tr -d '[:space:]')"

if [[ -z "${restored_seaweedfs_count}" ]]; then
  echo "[omnyid-restore-drill] ERROR: could not determine restored object count."
  exit 1
fi

if [[ "${restored_seaweedfs_count}" != "${seaweedfs_file_count}" ]]; then
  echo "[omnyid-restore-drill] ERROR: restored object count ${restored_seaweedfs_count} does not match manifest count ${seaweedfs_file_count}."
  exit 1
fi

echo "[omnyid-restore-drill] OK: restore replay succeeded."
echo "[omnyid-restore-drill] Public table count: ${table_count}"
echo "[omnyid-restore-drill] Migration rows: ${migration_rows:-0}"
echo "[omnyid-restore-drill] Restored object count: ${restored_seaweedfs_count}"

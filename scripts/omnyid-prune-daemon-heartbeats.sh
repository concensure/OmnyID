#!/usr/bin/env bash
# omnyid-prune-daemon-heartbeats.sh - Retain only a rolling window of daemon heartbeats.
#
# Usage:
#   ./omnyid-prune-daemon-heartbeats.sh [--retention-hours 48] [--batch-size 10000] [--vacuum-mode analyze|vacuum|vacuum_full|none] [--dry-run]
#
# Notes:
#   - deletes oldest rows in bounded batches ordered by created_at
#   - automatically runs ANALYZE by default after deletion
#   - use --vacuum-mode vacuum_full during a maintenance window if you need the table file to shrink materially

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

RETENTION_HOURS=48
BATCH_SIZE=10000
VACUUM_MODE="analyze"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --retention-hours)
      RETENTION_HOURS="${2:?missing value for --retention-hours}"
      shift 2
      ;;
    --batch-size)
      BATCH_SIZE="${2:?missing value for --batch-size}"
      shift 2
      ;;
    --vacuum-mode)
      VACUUM_MODE="${2:?missing value for --vacuum-mode}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "[omnyid-prune-daemon-heartbeats] ERROR: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! "$RETENTION_HOURS" =~ ^[0-9]+$ ]] || (( RETENTION_HOURS <= 0 )); then
  echo "[omnyid-prune-daemon-heartbeats] ERROR: retention hours must be a positive integer." >&2
  exit 1
fi
if [[ ! "$BATCH_SIZE" =~ ^[0-9]+$ ]] || (( BATCH_SIZE <= 0 )); then
  echo "[omnyid-prune-daemon-heartbeats] ERROR: batch size must be a positive integer." >&2
  exit 1
fi
case "$VACUUM_MODE" in
  none|analyze|vacuum|vacuum_full) ;;
  *)
    echo "[omnyid-prune-daemon-heartbeats] ERROR: vacuum mode must be one of none, analyze, vacuum, or vacuum_full." >&2
    exit 1
    ;;
esac

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
    local fallback_path=""
    if [[ "$file_path" == /run/secrets/* ]]; then
      fallback_path="${PROJECT_ROOT}/.secrets/${file_path##*/}"
    fi
    if [[ -n "$fallback_path" && -f "$fallback_path" ]]; then
      file_path="$fallback_path"
    fi
  fi
  if [[ ! -f "$file_path" ]]; then
    echo "[omnyid-prune-daemon-heartbeats] ERROR: ${file_key} points to a missing file: $file_path" >&2
    exit 1
  fi
  local content
  content="$(<"$file_path")"
  content="${content%"${content##*[![:space:]]}"}"
  content="${content#"${content%%[![:space:]]*}"}"
  if [[ -z "$content" ]]; then
    echo "[omnyid-prune-daemon-heartbeats] ERROR: ${file_key} points to a blank file: $file_path" >&2
    exit 1
  fi
  printf '%s' "$content"
}

PG_HOST="${OMNYID_PG_HOST:-${POSTGRES_HOST:-localhost}}"
PG_PORT="${OMNYID_PG_PORT:-${POSTGRES_PORT:-5432}}"
PG_USER="${OMNYID_PG_USER:-${POSTGRES_USER:-afp}}"
PG_DB="${OMNYID_PG_DB:-${POSTGRES_DB:-afp}}"
HAS_DOCKER_POSTGRES=0
if docker ps --format '{{.Names}}' | grep -Fx 'omnyid-postgres-1' >/dev/null 2>&1; then
  HAS_DOCKER_POSTGRES=1
fi

PG_PASSWORD=""
if [[ "$HAS_DOCKER_POSTGRES" == "0" ]]; then
  PG_PASSWORD="$(read_secret_env OMNYID_PG_PASSWORD)"
  if [[ -z "${PG_PASSWORD}" ]]; then
    PG_PASSWORD="$(read_secret_env POSTGRES_PASSWORD)"
  fi
  if [[ -z "${PG_PASSWORD}" ]]; then
    PG_PASSWORD="afp"
  fi
fi

run_psql_query() {
  local sql="$1"
  if [[ "$HAS_DOCKER_POSTGRES" == "1" ]]; then
    docker exec omnyid-postgres-1 sh -lc '
      if [ -n "${POSTGRES_PASSWORD:-}" ]; then
        export PGPASSWORD="${POSTGRES_PASSWORD}"
      elif [ -f /run/secrets/postgres_password ]; then
        export PGPASSWORD="$(cat /run/secrets/postgres_password)"
      else
        export PGPASSWORD="afp"
      fi
      exec psql -U "${POSTGRES_USER:-afp}" -d "${POSTGRES_DB:-afp}" -Atqc "$1"
    ' sh "$sql"
  else
    PGPASSWORD="${PG_PASSWORD}" psql \
      --host="${PG_HOST}" \
      --port="${PG_PORT}" \
      --username="${PG_USER}" \
      --dbname="${PG_DB}" \
      --tuples-only \
      --no-align \
      --quiet \
      --command="$sql"
  fi
}

run_psql_command() {
  local sql="$1"
  if [[ "$HAS_DOCKER_POSTGRES" == "1" ]]; then
    docker exec omnyid-postgres-1 sh -lc '
      if [ -n "${POSTGRES_PASSWORD:-}" ]; then
        export PGPASSWORD="${POSTGRES_PASSWORD}"
      elif [ -f /run/secrets/postgres_password ]; then
        export PGPASSWORD="$(cat /run/secrets/postgres_password)"
      else
        export PGPASSWORD="afp"
      fi
      exec psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-afp}" -d "${POSTGRES_DB:-afp}" -c "$1"
    ' sh "$sql"
  else
    PGPASSWORD="${PG_PASSWORD}" psql \
      --host="${PG_HOST}" \
      --port="${PG_PORT}" \
      --username="${PG_USER}" \
      --dbname="${PG_DB}" \
      --set=ON_ERROR_STOP=1 \
      --command="$sql"
  fi
}

count_sql="SELECT count(*) FROM daemon_heartbeats;"
oldest_sql="SELECT COALESCE(to_char(min(created_at), 'YYYY-MM-DD\"T\"HH24:MI:SSOF'), '') FROM daemon_heartbeats;"
newest_sql="SELECT COALESCE(to_char(max(created_at), 'YYYY-MM-DD\"T\"HH24:MI:SSOF'), '') FROM daemon_heartbeats;"
stale_count_sql="SELECT count(*) FROM daemon_heartbeats WHERE created_at < NOW() - make_interval(hours => ${RETENTION_HOURS});"
stale_oldest_sql="SELECT COALESCE(to_char(min(created_at), 'YYYY-MM-DD\"T\"HH24:MI:SSOF'), '') FROM daemon_heartbeats WHERE created_at < NOW() - make_interval(hours => ${RETENTION_HOURS});"
delete_batch_sql="
WITH doomed AS (
  SELECT ctid
  FROM daemon_heartbeats
  WHERE created_at < NOW() - make_interval(hours => ${RETENTION_HOURS})
  ORDER BY created_at ASC
  LIMIT ${BATCH_SIZE}
  FOR UPDATE SKIP LOCKED
),
deleted AS (
  DELETE FROM daemon_heartbeats d
  USING doomed
  WHERE d.ctid = doomed.ctid
  RETURNING 1
)
SELECT count(*) FROM deleted;
"

count_before="$(run_psql_query "$count_sql" | tr -d '[:space:]')"
stale_before="$(run_psql_query "$stale_count_sql" | tr -d '[:space:]')"
oldest_before="$(run_psql_query "$oldest_sql" | tr -d '[:space:]')"
newest_before="$(run_psql_query "$newest_sql" | tr -d '[:space:]')"
stale_oldest_before="$(run_psql_query "$stale_oldest_sql" | tr -d '[:space:]')"

if [[ -z "$count_before" ]]; then
  count_before=0
fi
if [[ -z "$stale_before" ]]; then
  stale_before=0
fi

echo "[omnyid-prune-daemon-heartbeats] retention_hours=${RETENTION_HOURS} batch_size=${BATCH_SIZE} vacuum_mode=${VACUUM_MODE} dry_run=${DRY_RUN}"
echo "[omnyid-prune-daemon-heartbeats] before_total_rows=${count_before} before_stale_rows=${stale_before} oldest=${oldest_before:-none} newest=${newest_before:-none} oldest_stale=${stale_oldest_before:-none}"

deleted_total=0
batch_count=0

if [[ "$DRY_RUN" == "0" ]]; then
  while true; do
    deleted_batch="$(run_psql_query "$delete_batch_sql" | tr -d '[:space:]')"
    if [[ -z "$deleted_batch" ]]; then
      deleted_batch=0
    fi
    if [[ ! "$deleted_batch" =~ ^[0-9]+$ ]]; then
      echo "[omnyid-prune-daemon-heartbeats] ERROR: unexpected delete count: ${deleted_batch}" >&2
      exit 1
    fi
    if (( deleted_batch == 0 )); then
      break
    fi
    deleted_total=$((deleted_total + deleted_batch))
    batch_count=$((batch_count + 1))
    echo "[omnyid-prune-daemon-heartbeats] deleted_batch=${deleted_batch} deleted_total=${deleted_total} batch_count=${batch_count}"
  done

  case "$VACUUM_MODE" in
    none)
      echo "[omnyid-prune-daemon-heartbeats] skipping analyze/vacuum follow-up by operator request"
      ;;
    analyze)
      run_psql_command "ANALYZE daemon_heartbeats;"
      ;;
    vacuum)
      run_psql_command "VACUUM (ANALYZE) daemon_heartbeats;"
      ;;
    vacuum_full)
      echo "[omnyid-prune-daemon-heartbeats] running VACUUM (FULL, ANALYZE) daemon_heartbeats; this takes an exclusive lock"
      run_psql_command "VACUUM (FULL, ANALYZE) daemon_heartbeats;"
      ;;
  esac
else
  echo "[omnyid-prune-daemon-heartbeats] dry run only; no rows deleted"
fi

count_after="$(run_psql_query "$count_sql" | tr -d '[:space:]')"
stale_after="$(run_psql_query "$stale_count_sql" | tr -d '[:space:]')"
oldest_after="$(run_psql_query "$oldest_sql" | tr -d '[:space:]')"
newest_after="$(run_psql_query "$newest_sql" | tr -d '[:space:]')"

if [[ -z "$count_after" ]]; then
  count_after=0
fi
if [[ -z "$stale_after" ]]; then
  stale_after=0
fi

echo "[omnyid-prune-daemon-heartbeats] after_total_rows=${count_after} after_stale_rows=${stale_after} oldest=${oldest_after:-none} newest=${newest_after:-none} deleted_total=${deleted_total}"
echo "[omnyid-prune-daemon-heartbeats] note=plain DELETE reduces live-row history immediately; use vacuum_full during maintenance if you need the table file and pg_database_size to shrink materially."

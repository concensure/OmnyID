#!/usr/bin/env bash
# Retain a bounded curator_run_audit window using independently committed deletes.

set -euo pipefail

RETENTION_HOURS=168
BATCH_SIZE=10000
VACUUM_MODE=analyze
DRY_RUN=0
PG_CONTAINER="${OMNYID_POSTGRES_CONTAINER:-omnyid-postgres-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --retention-hours) RETENTION_HOURS="${2:?missing retention hours}"; shift 2 ;;
    --batch-size) BATCH_SIZE="${2:?missing batch size}"; shift 2 ;;
    --vacuum-mode) VACUUM_MODE="${2:?missing vacuum mode}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "[omnyid-prune-curator-audits] ERROR: unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ ! "$RETENTION_HOURS" =~ ^[0-9]+$ ]] || (( RETENTION_HOURS <= 0 )); then
  echo "[omnyid-prune-curator-audits] ERROR: retention hours must be positive" >&2
  exit 1
fi
if [[ ! "$BATCH_SIZE" =~ ^[0-9]+$ ]] || (( BATCH_SIZE <= 0 || BATCH_SIZE > 50000 )); then
  echo "[omnyid-prune-curator-audits] ERROR: batch size must be 1..50000" >&2
  exit 1
fi
case "$VACUUM_MODE" in
  none|analyze|vacuum|vacuum_full) ;;
  *) echo "[omnyid-prune-curator-audits] ERROR: invalid vacuum mode" >&2; exit 1 ;;
esac
if ! docker ps --format '{{.Names}}' | grep -Fx "$PG_CONTAINER" >/dev/null; then
  echo "[omnyid-prune-curator-audits] ERROR: running container not found: $PG_CONTAINER" >&2
  exit 1
fi

psql_query() {
  docker exec "$PG_CONTAINER" sh -lc '
    exec psql -X -v ON_ERROR_STOP=1 \
      -U "${POSTGRES_USER:-afp}" -d "${POSTGRES_DB:-afp}" -Atqc "$1"
  ' sh "$1"
}

psql_command() {
  docker exec "$PG_CONTAINER" sh -lc '
    exec psql -X -v ON_ERROR_STOP=1 \
      -U "${POSTGRES_USER:-afp}" -d "${POSTGRES_DB:-afp}" -c "$1"
  ' sh "$1"
}

cutoff="$(psql_query "SELECT to_char(now()-make_interval(hours => ${RETENTION_HOURS}), 'YYYY-MM-DD\"T\"HH24:MI:SS.USOF');" | tr -d '[:space:]')"
before_total="$(psql_query 'SELECT count(*) FROM curator_run_audit;' | tr -d '[:space:]')"
before_stale="$(psql_query "SELECT count(*) FROM curator_run_audit WHERE created_at < '${cutoff}'::timestamptz;" | tr -d '[:space:]')"
echo "[omnyid-prune-curator-audits] cutoff=${cutoff} before_total=${before_total} before_stale=${before_stale} batch_size=${BATCH_SIZE} dry_run=${DRY_RUN}"

deleted_total=0
batches=0
if (( DRY_RUN == 0 )); then
  while true; do
    deleted="$(psql_query "
      WITH doomed AS (
        SELECT run_id FROM curator_run_audit
        WHERE created_at < '${cutoff}'::timestamptz
        ORDER BY created_at LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      ), removed AS (
        DELETE FROM curator_run_audit audit USING doomed
        WHERE audit.run_id = doomed.run_id RETURNING 1
      ) SELECT count(*) FROM removed;
    " | tr -d '[:space:]')"
    [[ "$deleted" =~ ^[0-9]+$ ]] || {
      echo "[omnyid-prune-curator-audits] ERROR: invalid delete count" >&2
      exit 1
    }
    (( deleted > 0 )) || break
    deleted_total=$((deleted_total + deleted))
    batches=$((batches + 1))
    if (( batches % 20 == 0 || deleted < BATCH_SIZE )); then
      echo "[omnyid-prune-curator-audits] batches=${batches} deleted_total=${deleted_total}"
    fi
  done

  case "$VACUUM_MODE" in
    none) ;;
    analyze) psql_command 'ANALYZE curator_run_audit;' ;;
    vacuum) psql_command 'VACUUM (ANALYZE) curator_run_audit;' ;;
    vacuum_full) psql_command 'VACUUM (FULL, ANALYZE) curator_run_audit;' ;;
  esac
fi

after_total="$(psql_query 'SELECT count(*) FROM curator_run_audit;' | tr -d '[:space:]')"
after_stale="$(psql_query "SELECT count(*) FROM curator_run_audit WHERE created_at < '${cutoff}'::timestamptz;" | tr -d '[:space:]')"
echo "[omnyid-prune-curator-audits] after_total=${after_total} after_stale=${after_stale} deleted_total=${deleted_total} batches=${batches}"

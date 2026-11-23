#!/usr/bin/env bash
# omnyid-prune-synthetic-message-spam.sh - Collapse synthetic AFP duplicates that should not grow without bound.
#
# Usage:
#   ./omnyid-prune-synthetic-message-spam.sh [--vacuum-mode analyze|vacuum|vacuum_full|none] [--dry-run]

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

VACUUM_MODE="analyze"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vacuum-mode)
      VACUUM_MODE="${2:?missing value for --vacuum-mode}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "[omnyid-prune-synthetic-message-spam] ERROR: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

case "$VACUUM_MODE" in
  none|analyze|vacuum|vacuum_full) ;;
  *)
    echo "[omnyid-prune-synthetic-message-spam] ERROR: vacuum mode must be one of none, analyze, vacuum, or vacuum_full." >&2
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
    echo "[omnyid-prune-synthetic-message-spam] ERROR: ${file_key} points to a missing file: $file_path" >&2
    exit 1
  fi
  local content
  content="$(<"$file_path")"
  content="${content%"${content##*[![:space:]]}"}"
  content="${content#"${content%%[![:space:]]*}"}"
  if [[ -z "$content" ]]; then
    echo "[omnyid-prune-synthetic-message-spam] ERROR: ${file_key} points to a blank file: $file_path" >&2
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

run_psql_file() {
  local sql_path="$1"
  if [[ ! -f "$sql_path" ]]; then
    echo "[omnyid-prune-synthetic-message-spam] ERROR: SQL file not found: $sql_path" >&2
    exit 1
  fi
  if [[ "$HAS_DOCKER_POSTGRES" == "1" ]]; then
    docker exec -i omnyid-postgres-1 sh -lc '
      if [ -n "${POSTGRES_PASSWORD:-}" ]; then
        export PGPASSWORD="${POSTGRES_PASSWORD}"
      elif [ -f /run/secrets/postgres_password ]; then
        export PGPASSWORD="$(cat /run/secrets/postgres_password)"
      else
        export PGPASSWORD="afp"
      fi
      exec psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-afp}" -d "${POSTGRES_DB:-afp}"
    ' < "$sql_path"
  else
    PGPASSWORD="${PG_PASSWORD}" psql \
      --host="${PG_HOST}" \
      --port="${PG_PORT}" \
      --username="${PG_USER}" \
      --dbname="${PG_DB}" \
      --set=ON_ERROR_STOP=1 \
      --file="$sql_path"
  fi
}

read_count() {
  local sql="$1"
  local value
  value="$(run_psql_query "$sql" | tr -d '[:space:]')"
  if [[ -z "$value" ]]; then
    value=0
  fi
  printf '%s' "$value"
}

tenant_count_sql="SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'user\_%' ESCAPE '\';"

# Use an executable dynamic SQL block for counts because each tenant has its own schema.
duplicate_count_sql="$(cat <<'SQL'
DO $$
DECLARE
    schema_name text;
    maintenance_dupes bigint := 0;
    curator_card_dupes bigint := 0;
    curator_backlink_dupes bigint := 0;
    topology_dupes bigint := 0;
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS synthetic_message_prune_counts (
        key text PRIMARY KEY,
        value bigint NOT NULL
    ) ON COMMIT DROP;
    TRUNCATE synthetic_message_prune_counts;

    FOR schema_name IN
        SELECT nspname
        FROM pg_namespace
        WHERE nspname LIKE 'user\_%' ESCAPE '\'
    LOOP
        EXECUTE format(
            $sql$
            SELECT GREATEST(count(*) - 1, 0)
            FROM %I.messages
            WHERE type = 'insight'
              AND subtype = 'maintenance_summary'
              AND from_agent = 'omnyid://daemon/health-maintenance'
            $sql$,
            schema_name
        ) INTO STRICT maintenance_dupes;
        INSERT INTO synthetic_message_prune_counts(key, value)
        VALUES ('maintenance_summary_dupes', maintenance_dupes)
        ON CONFLICT (key) DO UPDATE SET value = synthetic_message_prune_counts.value + EXCLUDED.value;

        EXECUTE format(
            $sql$
            WITH ranked AS (
                SELECT ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(content->>'source_id', id)
                    ORDER BY timestamp DESC, created_at DESC, id DESC
                ) AS rn
                FROM %I.messages
                WHERE type = 'knowledge_card'
                  AND subtype = 'auto_summary'
                  AND from_agent = 'omnyid://daemon/knowledge-curator'
            )
            SELECT count(*) FROM ranked WHERE rn > 1
            $sql$,
            schema_name
        ) INTO STRICT curator_card_dupes;
        INSERT INTO synthetic_message_prune_counts(key, value)
        VALUES ('curator_card_dupes', curator_card_dupes)
        ON CONFLICT (key) DO UPDATE SET value = synthetic_message_prune_counts.value + EXCLUDED.value;

        EXECUTE format(
            $sql$
            WITH ranked AS (
                SELECT ROW_NUMBER() OVER (
                    PARTITION BY
                        COALESCE(content->>'source_id', ''),
                        COALESCE(content->>'target_id', ''),
                        COALESCE(subtype, ''),
                        COALESCE(from_agent, '')
                    ORDER BY timestamp DESC, created_at DESC, id DESC
                ) AS rn
                FROM %I.messages
                WHERE type = 'backlink_update'
                  AND subtype = 'semantic_similarity'
                  AND from_agent = 'omnyid://daemon/knowledge-curator'
            )
            SELECT count(*) FROM ranked WHERE rn > 1
            $sql$,
            schema_name
        ) INTO STRICT curator_backlink_dupes;
        INSERT INTO synthetic_message_prune_counts(key, value)
        VALUES ('curator_backlink_dupes', curator_backlink_dupes)
        ON CONFLICT (key) DO UPDATE SET value = synthetic_message_prune_counts.value + EXCLUDED.value;

        EXECUTE format(
            $sql$
            WITH ranked AS (
                SELECT ROW_NUMBER() OVER (
                    PARTITION BY
                        type,
                        subtype,
                        COALESCE(content->>'source_message_id', ''),
                        COALESCE(content->>'link_type', ''),
                        COALESCE(content->>'relationship_id', ''),
                        COALESCE(from_agent, '')
                    ORDER BY timestamp DESC, created_at DESC, id DESC
                ) AS rn
                FROM %I.messages
                WHERE type IN ('knowledge_link', 'relation_link')
                  AND subtype IN ('entity', 'relationship')
                  AND from_agent IN ('entity_extractor', 'omnyid://daemon/ledger-ingestion')
            )
            SELECT count(*) FROM ranked WHERE rn > 1
            $sql$,
            schema_name
        ) INTO STRICT topology_dupes;
        INSERT INTO synthetic_message_prune_counts(key, value)
        VALUES ('ingestion_topology_dupes', topology_dupes)
        ON CONFLICT (key) DO UPDATE SET value = synthetic_message_prune_counts.value + EXCLUDED.value;
    END LOOP;
END $$;

SELECT key || '=' || value
FROM synthetic_message_prune_counts
ORDER BY key;
SQL
)"

tenant_schemas="$(read_count "$tenant_count_sql")"
count_lines="$(run_psql_query "$duplicate_count_sql")"

maintenance_before="$(printf '%s\n' "$count_lines" | awk -F= '/^maintenance_summary_dupes=/{print $2}')"
curator_card_before="$(printf '%s\n' "$count_lines" | awk -F= '/^curator_card_dupes=/{print $2}')"
curator_backlink_before="$(printf '%s\n' "$count_lines" | awk -F= '/^curator_backlink_dupes=/{print $2}')"
topology_before="$(printf '%s\n' "$count_lines" | awk -F= '/^ingestion_topology_dupes=/{print $2}')"

maintenance_before="${maintenance_before:-0}"
curator_card_before="${curator_card_before:-0}"
curator_backlink_before="${curator_backlink_before:-0}"
topology_before="${topology_before:-0}"
total_before=$((maintenance_before + curator_card_before + curator_backlink_before + topology_before))

echo "[omnyid-prune-synthetic-message-spam] vacuum_mode=${VACUUM_MODE} dry_run=${DRY_RUN} tenant_schemas=${tenant_schemas}"
echo "[omnyid-prune-synthetic-message-spam] before maintenance_summary_dupes=${maintenance_before} curator_card_dupes=${curator_card_before} curator_backlink_dupes=${curator_backlink_before} ingestion_topology_dupes=${topology_before} total_dupes=${total_before}"

if [[ "$DRY_RUN" == "0" ]]; then
  run_psql_file "${SCRIPT_DIR}/prune-maintenance-summary-spam.sql" >/dev/null
  run_psql_file "${SCRIPT_DIR}/prune-curator-artifact-spam.sql" >/dev/null
  run_psql_file "${SCRIPT_DIR}/prune-ingestion-topology-spam.sql" >/dev/null

  case "$VACUUM_MODE" in
    none)
      echo "[omnyid-prune-synthetic-message-spam] skipping analyze/vacuum follow-up by operator request"
      ;;
    analyze)
      run_psql_command "ANALYZE;" >/dev/null
      ;;
    vacuum)
      run_psql_command "VACUUM (ANALYZE);" >/dev/null
      ;;
    vacuum_full)
      echo "[omnyid-prune-synthetic-message-spam] running VACUUM (FULL, ANALYZE); this takes an exclusive lock"
      run_psql_command "VACUUM (FULL, ANALYZE);" >/dev/null
      ;;
  esac
else
  echo "[omnyid-prune-synthetic-message-spam] dry run only; no rows deleted"
fi

count_lines_after="$(run_psql_query "$duplicate_count_sql")"
maintenance_after="$(printf '%s\n' "$count_lines_after" | awk -F= '/^maintenance_summary_dupes=/{print $2}')"
curator_card_after="$(printf '%s\n' "$count_lines_after" | awk -F= '/^curator_card_dupes=/{print $2}')"
curator_backlink_after="$(printf '%s\n' "$count_lines_after" | awk -F= '/^curator_backlink_dupes=/{print $2}')"
topology_after="$(printf '%s\n' "$count_lines_after" | awk -F= '/^ingestion_topology_dupes=/{print $2}')"

maintenance_after="${maintenance_after:-0}"
curator_card_after="${curator_card_after:-0}"
curator_backlink_after="${curator_backlink_after:-0}"
topology_after="${topology_after:-0}"
total_after=$((maintenance_after + curator_card_after + curator_backlink_after + topology_after))
deleted_total=$((total_before - total_after))

echo "[omnyid-prune-synthetic-message-spam] after maintenance_summary_dupes=${maintenance_after} curator_card_dupes=${curator_card_after} curator_backlink_dupes=${curator_backlink_after} ingestion_topology_dupes=${topology_after} total_dupes=${total_after} deleted_total=${deleted_total}"

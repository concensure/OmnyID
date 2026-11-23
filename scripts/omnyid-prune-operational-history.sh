#!/usr/bin/env bash
# omnyid-prune-operational-history.sh - Prune operational history tables that should behave like rolling logs.
#
# Usage:
#   ./omnyid-prune-operational-history.sh [--vacuum-mode analyze|vacuum|vacuum_full|none] [--dry-run]

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
      echo "[omnyid-prune-operational-history] ERROR: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

case "$VACUUM_MODE" in
  none|analyze|vacuum|vacuum_full) ;;
  *)
    echo "[omnyid-prune-operational-history] ERROR: vacuum mode must be one of none, analyze, vacuum, or vacuum_full." >&2
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
  if [[ ! -f "$file_path" && "$file_path" == /run/secrets/* ]]; then
    local fallback_path="${PROJECT_ROOT}/.secrets/${file_path##*/}"
    if [[ -f "$fallback_path" ]]; then
      file_path="$fallback_path"
    fi
  fi
  if [[ ! -f "$file_path" ]]; then
    echo "[omnyid-prune-operational-history] ERROR: ${file_key} points to a missing file: $file_path" >&2
    exit 1
  fi
  local content
  content="$(<"$file_path")"
  content="${content%"${content##*[![:space:]]}"}"
  content="${content#"${content%%[![:space:]]*}"}"
  if [[ -z "$content" ]]; then
    echo "[omnyid-prune-operational-history] ERROR: ${file_key} points to a blank file: $file_path" >&2
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
    echo "[omnyid-prune-operational-history] ERROR: SQL file not found: $sql_path" >&2
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

count_sql="$(cat <<'SQL'
DO $$
DECLARE
    schema_name text;
    total_action_audit bigint := 0;
    total_llm_usage bigint := 0;
    total_trigger_obs bigint := 0;
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS operational_history_counts (
        key text PRIMARY KEY,
        value bigint NOT NULL
    ) ON COMMIT DROP;
    TRUNCATE operational_history_counts;

    INSERT INTO operational_history_counts(key, value)
    VALUES
        ('daemon_operational_afp', (
            SELECT count(*)
            FROM public.afp_messages
            WHERE type IN (
                'watcher_resolution_event',
                'synthesis_invalidation_event',
                'reflection_trace',
                'minimal_context_packet',
                'proactive_trigger',
                'token_budget_log'
            )
        )),
        ('training_reflection_traces', (SELECT count(*) FROM public.training_reflection_traces)),
        ('proactive_token_usage', (SELECT count(*) FROM public.proactive_token_usage)),
        ('user_external_tool_usage_events', (SELECT count(*) FROM public.user_external_tool_usage_events)),
        ('proactive_suggestions', (SELECT count(*) FROM public.proactive_suggestions)),
        ('trigger_replay_nonces', (SELECT count(*) FROM public.trigger_replay_nonces));

    FOR schema_name IN
        SELECT nspname
        FROM pg_namespace
        WHERE nspname LIKE 'user\_%' ESCAPE '\'
    LOOP
        EXECUTE format('SELECT count(*) FROM %I.action_audit_log', schema_name) INTO STRICT total_action_audit;
        INSERT INTO operational_history_counts(key, value)
        VALUES ('tenant_action_audit_log', total_action_audit)
        ON CONFLICT (key) DO UPDATE SET value = operational_history_counts.value + EXCLUDED.value;

        EXECUTE format('SELECT count(*) FROM %I.llm_usage_log', schema_name) INTO STRICT total_llm_usage;
        INSERT INTO operational_history_counts(key, value)
        VALUES ('tenant_llm_usage_log', total_llm_usage)
        ON CONFLICT (key) DO UPDATE SET value = operational_history_counts.value + EXCLUDED.value;

        EXECUTE format('SELECT count(*) FROM %I.workflow_trigger_observations', schema_name) INTO STRICT total_trigger_obs;
        INSERT INTO operational_history_counts(key, value)
        VALUES ('tenant_workflow_trigger_observations', total_trigger_obs)
        ON CONFLICT (key) DO UPDATE SET value = operational_history_counts.value + EXCLUDED.value;
    END LOOP;
END $$;

SELECT key || '=' || value
FROM operational_history_counts
ORDER BY key;
SQL
)"

parse_count_value() {
  local text="$1"
  local key="$2"
  awk -F '=' -v wanted="$key" '$1 == wanted { print $2 }' <<<"$text" | tr -d '[:space:]'
}

sql_path="${SCRIPT_DIR}/prune-operational-history.sql"
before_counts="$(run_psql_query "$count_sql")"

before_action="$(parse_count_value "$before_counts" "tenant_action_audit_log")"
before_afp="$(parse_count_value "$before_counts" "daemon_operational_afp")"
before_llm="$(parse_count_value "$before_counts" "tenant_llm_usage_log")"
before_traces="$(parse_count_value "$before_counts" "training_reflection_traces")"
before_token_usage="$(parse_count_value "$before_counts" "proactive_token_usage")"
before_tool_usage="$(parse_count_value "$before_counts" "user_external_tool_usage_events")"
before_trigger_obs="$(parse_count_value "$before_counts" "tenant_workflow_trigger_observations")"
before_suggestions="$(parse_count_value "$before_counts" "proactive_suggestions")"
before_replay="$(parse_count_value "$before_counts" "trigger_replay_nonces")"

echo "[omnyid-prune-operational-history] before tenant_action_audit_log=${before_action:-0} daemon_operational_afp=${before_afp:-0} tenant_llm_usage_log=${before_llm:-0} training_reflection_traces=${before_traces:-0} proactive_token_usage=${before_token_usage:-0} user_external_tool_usage_events=${before_tool_usage:-0} tenant_workflow_trigger_observations=${before_trigger_obs:-0} proactive_suggestions=${before_suggestions:-0} trigger_replay_nonces=${before_replay:-0}"

if [[ "$DRY_RUN" == "0" ]]; then
  run_psql_file "$sql_path" >/dev/null
fi

after_counts="$(run_psql_query "$count_sql")"
after_action="$(parse_count_value "$after_counts" "tenant_action_audit_log")"
after_afp="$(parse_count_value "$after_counts" "daemon_operational_afp")"
after_llm="$(parse_count_value "$after_counts" "tenant_llm_usage_log")"
after_traces="$(parse_count_value "$after_counts" "training_reflection_traces")"
after_token_usage="$(parse_count_value "$after_counts" "proactive_token_usage")"
after_tool_usage="$(parse_count_value "$after_counts" "user_external_tool_usage_events")"
after_trigger_obs="$(parse_count_value "$after_counts" "tenant_workflow_trigger_observations")"
after_suggestions="$(parse_count_value "$after_counts" "proactive_suggestions")"
after_replay="$(parse_count_value "$after_counts" "trigger_replay_nonces")"

before_total=$(( ${before_action:-0} + ${before_afp:-0} + ${before_llm:-0} + ${before_traces:-0} + ${before_token_usage:-0} + ${before_tool_usage:-0} + ${before_trigger_obs:-0} + ${before_suggestions:-0} + ${before_replay:-0} ))
after_total=$(( ${after_action:-0} + ${after_afp:-0} + ${after_llm:-0} + ${after_traces:-0} + ${after_token_usage:-0} + ${after_tool_usage:-0} + ${after_trigger_obs:-0} + ${after_suggestions:-0} + ${after_replay:-0} ))
deleted_total=$(( before_total - after_total ))

echo "[omnyid-prune-operational-history] after tenant_action_audit_log=${after_action:-0} daemon_operational_afp=${after_afp:-0} tenant_llm_usage_log=${after_llm:-0} training_reflection_traces=${after_traces:-0} proactive_token_usage=${after_token_usage:-0} user_external_tool_usage_events=${after_tool_usage:-0} tenant_workflow_trigger_observations=${after_trigger_obs:-0} proactive_suggestions=${after_suggestions:-0} trigger_replay_nonces=${after_replay:-0} deleted_total=${deleted_total}"

case "$VACUUM_MODE" in
  none)
    ;;
  analyze)
    [[ "$DRY_RUN" == "1" ]] || run_psql_command "ANALYZE;"
    ;;
  vacuum)
    [[ "$DRY_RUN" == "1" ]] || run_psql_command "VACUUM ANALYZE;"
    ;;
  vacuum_full)
    [[ "$DRY_RUN" == "1" ]] || run_psql_command "VACUUM (FULL, ANALYZE);"
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-}"
OUT_DIR="${2:-}"
BACKUP_DIR="${3:-${OMNYID_BACKUP_DIR:-}}"
BASE_URL="${4:-${OMNYID_BASE_URL:-}}"
WORKSPACE_URL="${5:-${OMNYID_WORKSPACE_URL:-}}"
EXPECTED_CSP_FRAGMENT="${OMNYID_WORKSPACE_CSP_FRAGMENT:-https://static.cloudflareinsights.com}"
OPERATIONAL_ENDPOINT_TOKEN="${OMNYID_OPERATIONAL_ENDPOINT_TOKEN:-}"
OPERATIONAL_ENDPOINT_TOKEN_FILE="${OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE:-}"
VERIFY_DEPLOYMENT_BEARER_TOKEN="${OMNYID_VERIFY_DEPLOYMENT_BEARER_TOKEN:-}"
STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
STEP_RELEASE_READINESS="pending"
STEP_LIVE_VERIFY="pending"

env_file_value() {
  local path="$1"
  local key="$2"
  [[ -n "$path" && -f "$path" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    local trimmed
    trimmed="${line#"${line%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    [[ -z "$trimmed" || "${trimmed:0:1}" == "#" ]] && continue
    [[ "$trimmed" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    local current_key="${trimmed%%=*}"
    [[ "$current_key" == "$key" ]] || continue
    local value="${trimmed#*=}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ ${#value} -ge 2 ]]; then
      local first="${value:0:1}"
      local last="${value: -1}"
      if [[ ( "$first" == '"' && "$last" == '"' ) || ( "$first" == "'" && "$last" == "'" ) ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi
    printf '%s' "$value"
    return 0
  done < "$path"
  return 1
}

write_backup_dir_hint() {
  local path="${1:-}"
  [[ -n "$path" ]] || return 0
  [[ -e "$path" ]] && return 0
  if [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* || "$OSTYPE" == win32* ]]; then
    if [[ "$path" == /* ]]; then
      echo "[deployment-rehearsal] WARNING: backup path '$path' looks like a Linux/Oracle target path but does not exist on this Windows host. Validate this env file on the Oracle runtime, or pass a real local snapshot root as the third argument for workstation rehearsal." >&2
      return 0
    fi
  fi
  echo "[deployment-rehearsal] WARNING: backup path '$path' does not exist on this host. Provision a real backup archive root or point OMNYID_BACKUP_DIR at an existing snapshot directory before running a production-labeled deployment rehearsal." >&2
}

workspace_base_url() {
  local workspace_base ui_base homeserver_url host derived_host scheme
  workspace_base="${OMNYID_WORKSPACE_BASE_URL:-}"
  if [[ -n "${workspace_base// }" ]]; then
    printf '%s' "${workspace_base%/}"
    return 0
  fi
  ui_base="${OMNYID_UI_BASE_URL:-}"
  if [[ -n "${ui_base// }" ]]; then
    printf '%s' "${ui_base%/}"
    return 0
  fi
  homeserver_url="${OMNYID_HOMESERVER_URL:-}"
  if [[ "$homeserver_url" =~ ^(https?)://([^/]+) ]]; then
    scheme="${BASH_REMATCH[1]}"
    host="${BASH_REMATCH[2]}"
    derived_host="${host#api.}"
    if [[ -n "$derived_host" ]]; then
      printf '%s://%s' "$scheme" "$derived_host"
      return 0
    fi
  fi
  return 1
}

write_summary() {
  local status="$1"
  [[ -n "$OUT_DIR" ]] || return 0
  mkdir -p "$OUT_DIR"
  local summary_env="$OUT_DIR/deployment-rehearsal-summary.env"
  local summary_md="$OUT_DIR/deployment-rehearsal-summary.md"
  local summary_json="$OUT_DIR/deployment-rehearsal-summary.json"
  {
    printf 'STATUS=%s\n' "$status"
    printf 'STARTED_AT=%s\n' "$STARTED_AT"
    printf 'ENV_FILE=%s\n' "${ENV_FILE:-}"
    printf 'BACKUP_DIR=%s\n' "${BACKUP_DIR:-}"
    printf 'BASE_URL=%s\n' "${BASE_URL:-}"
    printf 'WORKSPACE_URL=%s\n' "${WORKSPACE_URL:-}"
    printf 'STEP_RELEASE_READINESS=%s\n' "$STEP_RELEASE_READINESS"
    printf 'STEP_LIVE_VERIFY=%s\n' "$STEP_LIVE_VERIFY"
  } >"$summary_env"
  cat >"$summary_md" <<EOF
# Deployment Rehearsal Summary

- status: $status
- started_at: $STARTED_AT
- env_file: ${ENV_FILE:-none}
- backup_dir: ${BACKUP_DIR:-none}
- base_url: ${BASE_URL:-none}
- workspace_url: ${WORKSPACE_URL:-none}
- release_readiness: $STEP_RELEASE_READINESS
- live_verify: $STEP_LIVE_VERIFY
EOF
  cat >"$summary_json" <<EOF
{
  "status": "$status",
  "started_at": "$STARTED_AT",
  "env_file": "${ENV_FILE:-}",
  "backup_dir": "${BACKUP_DIR:-}",
  "base_url": "${BASE_URL:-}",
  "workspace_url": "${WORKSPACE_URL:-}",
  "steps": {
    "release_readiness": "$STEP_RELEASE_READINESS",
    "live_verify": "$STEP_LIVE_VERIFY"
  }
}
EOF
}

on_exit() {
  local exit_code=$?
  if [[ $exit_code -eq 0 ]]; then
    write_summary "pass"
  else
    write_summary "fail"
  fi
  exit $exit_code
}

trap on_exit EXIT

echo "[deployment-rehearsal] starting deployment rehearsal"

if [[ -z "${BACKUP_DIR}" && -n "${ENV_FILE}" ]]; then
  BACKUP_DIR="$(env_file_value "$ENV_FILE" "OMNYID_BACKUP_DIR" || true)"
fi
write_backup_dir_hint "${BACKUP_DIR}"

if [[ -z "${BASE_URL}" && -n "${ENV_FILE}" ]]; then
  BASE_URL="$(env_file_value "$ENV_FILE" "OMNYID_BASE_URL" || true)"
fi

if [[ -z "${BASE_URL}" && -n "${ENV_FILE}" ]]; then
  BASE_URL="$(env_file_value "$ENV_FILE" "OMNYID_HOMESERVER_URL" || true)"
fi

if [[ -z "${WORKSPACE_URL}" && -n "${ENV_FILE}" ]]; then
  WORKSPACE_URL="$(env_file_value "$ENV_FILE" "OMNYID_WORKSPACE_URL" || true)"
fi

if [[ -z "${OMNYID_WORKSPACE_BASE_URL:-}" && -n "${ENV_FILE}" ]]; then
  export OMNYID_WORKSPACE_BASE_URL="$(env_file_value "$ENV_FILE" "OMNYID_WORKSPACE_BASE_URL" || true)"
fi

if [[ -z "${OMNYID_UI_BASE_URL:-}" && -n "${ENV_FILE}" ]]; then
  export OMNYID_UI_BASE_URL="$(env_file_value "$ENV_FILE" "OMNYID_UI_BASE_URL" || true)"
fi

if [[ -z "${OMNYID_HOMESERVER_URL:-}" && -n "${ENV_FILE}" ]]; then
  export OMNYID_HOMESERVER_URL="$(env_file_value "$ENV_FILE" "OMNYID_HOMESERVER_URL" || true)"
fi

if [[ -z "${OPERATIONAL_ENDPOINT_TOKEN}" && -n "${ENV_FILE}" ]]; then
  OPERATIONAL_ENDPOINT_TOKEN="$(env_file_value "$ENV_FILE" "OMNYID_OPERATIONAL_ENDPOINT_TOKEN" || true)"
fi

if [[ -z "${OPERATIONAL_ENDPOINT_TOKEN_FILE}" && -n "${ENV_FILE}" ]]; then
  OPERATIONAL_ENDPOINT_TOKEN_FILE="$(env_file_value "$ENV_FILE" "OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE" || true)"
fi

if [[ -z "${VERIFY_DEPLOYMENT_BEARER_TOKEN}" && -n "${ENV_FILE}" ]]; then
  VERIFY_DEPLOYMENT_BEARER_TOKEN="$(env_file_value "$ENV_FILE" "OMNYID_VERIFY_DEPLOYMENT_BEARER_TOKEN" || true)"
fi

if [[ -z "${BASE_URL}" && -n "${OMNYID_HOMESERVER_URL:-}" ]]; then
  BASE_URL="${OMNYID_HOMESERVER_URL}"
fi

if [[ -z "${WORKSPACE_URL}" ]]; then
  if derived_workspace_base="$(workspace_base_url)"; then
    WORKSPACE_URL="${derived_workspace_base}/workspace/"
  fi
fi

echo "[deployment-rehearsal] step 1/2: release readiness"
bash "${SCRIPT_DIR}/release-readiness.sh" "${ENV_FILE}" "${OUT_DIR}" "${BACKUP_DIR}"
STEP_RELEASE_READINESS="pass"

if [[ -n "${ENV_FILE}" && -z "${BASE_URL}" ]]; then
  echo "[deployment-rehearsal] production deployment rehearsal requires base_url or OMNYID_BASE_URL" >&2
  exit 1
fi

if [[ -n "${BASE_URL}" ]]; then
  echo "[deployment-rehearsal] step 2/2: live deployment verification (${BASE_URL})"
  OMNYID_WORKSPACE_URL="${WORKSPACE_URL}" \
  OMNYID_WORKSPACE_CSP_FRAGMENT="${EXPECTED_CSP_FRAGMENT}" \
  OMNYID_OPERATIONAL_ENDPOINT_TOKEN="${OPERATIONAL_ENDPOINT_TOKEN}" \
  OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE="${OPERATIONAL_ENDPOINT_TOKEN_FILE}" \
  OMNYID_VERIFY_DEPLOYMENT_BEARER_TOKEN="${VERIFY_DEPLOYMENT_BEARER_TOKEN}" \
    bash "${SCRIPT_DIR}/verify-deployment.sh" "${BASE_URL}"
  STEP_LIVE_VERIFY="pass"
else
  echo "[deployment-rehearsal] step 2/2: live deployment verification skipped (no base url supplied)"
  STEP_LIVE_VERIFY="skipped"
fi

echo "[deployment-rehearsal] deployment rehearsal passed"

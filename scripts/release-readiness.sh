#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-}"
OUT_DIR="${2:-}"
BACKUP_DIR="${3:-${OMNYID_BACKUP_DIR:-}}"
STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
STEP_RUST_CORRECTNESS="pending"
STEP_FRONTEND_CORRECTNESS="pending"
STEP_STARTUP_POLICY="pending"
STEP_DEPLOYMENT_OPS="pending"
STEP_BACKUP_VERIFY="pending"
STEP_RESTORE_DRILL="pending"
FAILURE_STEP=""
FAILURE_REASON=""

mark_step_failed() {
  local step="$1"
  case "$step" in
    rust_correctness) STEP_RUST_CORRECTNESS="fail" ;;
    frontend_correctness) STEP_FRONTEND_CORRECTNESS="fail" ;;
    startup_policy) STEP_STARTUP_POLICY="fail" ;;
    deployment_ops) STEP_DEPLOYMENT_OPS="fail" ;;
    backup_verify) STEP_BACKUP_VERIFY="fail" ;;
    restore_drill) STEP_RESTORE_DRILL="fail" ;;
  esac
}

mark_step_blocked() {
  local step="$1"
  case "$step" in
    restore_drill) STEP_RESTORE_DRILL="blocked" ;;
  esac
}

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
      echo "[release-readiness] WARNING: backup path '$path' looks like a Linux/Oracle target path but does not exist on this Windows host. Validate this env file on the Oracle runtime, or pass a real local snapshot root as the third argument for workstation rehearsal." >&2
      return 0
    fi
  fi
  echo "[release-readiness] WARNING: backup path '$path' does not exist on this host. Provision a real backup archive root or point OMNYID_BACKUP_DIR at an existing snapshot directory before running a production-labeled release gate." >&2
}

write_summary() {
  local status="$1"
  [[ -n "$OUT_DIR" ]] || return 0
  mkdir -p "$OUT_DIR"
  local summary_env="$OUT_DIR/summary.env"
  local summary_md="$OUT_DIR/summary.md"
  local summary_json="$OUT_DIR/summary.json"
  {
    printf 'STATUS=%s\n' "$status"
    printf 'STARTED_AT=%s\n' "$STARTED_AT"
    printf 'ENV_FILE=%s\n' "${ENV_FILE:-}"
    printf 'BACKUP_DIR=%s\n' "${BACKUP_DIR:-}"
    printf 'STEP_RUST_CORRECTNESS=%s\n' "$STEP_RUST_CORRECTNESS"
    printf 'STEP_FRONTEND_CORRECTNESS=%s\n' "$STEP_FRONTEND_CORRECTNESS"
    printf 'STEP_STARTUP_POLICY=%s\n' "$STEP_STARTUP_POLICY"
    printf 'STEP_DEPLOYMENT_OPS=%s\n' "$STEP_DEPLOYMENT_OPS"
    printf 'STEP_BACKUP_VERIFY=%s\n' "$STEP_BACKUP_VERIFY"
    printf 'STEP_RESTORE_DRILL=%s\n' "$STEP_RESTORE_DRILL"
    printf 'FAILURE_STEP=%s\n' "$FAILURE_STEP"
    printf 'FAILURE_REASON=%s\n' "$FAILURE_REASON"
  } >"$summary_env"
  cat >"$summary_md" <<EOF
# Release Readiness Summary

- status: $status
- started_at: $STARTED_AT
- env_file: ${ENV_FILE:-none}
- backup_dir: ${BACKUP_DIR:-none}
- rust_correctness: $STEP_RUST_CORRECTNESS
- frontend_correctness: $STEP_FRONTEND_CORRECTNESS
- startup_policy: $STEP_STARTUP_POLICY
- deployment_ops: $STEP_DEPLOYMENT_OPS
- backup_verify: $STEP_BACKUP_VERIFY
- restore_drill: $STEP_RESTORE_DRILL
- failure_step: ${FAILURE_STEP:-none}
- failure_reason: ${FAILURE_REASON:-none}
EOF
  cat >"$summary_json" <<EOF
{
  "status": "$status",
  "started_at": "$STARTED_AT",
  "env_file": "${ENV_FILE:-}",
  "backup_dir": "${BACKUP_DIR:-}",
  "failure_step": "${FAILURE_STEP:-}",
  "failure_reason": "${FAILURE_REASON:-}",
  "steps": {
    "rust_correctness": "$STEP_RUST_CORRECTNESS",
    "frontend_correctness": "$STEP_FRONTEND_CORRECTNESS",
    "startup_policy": "$STEP_STARTUP_POLICY",
    "deployment_ops": "$STEP_DEPLOYMENT_OPS",
    "backup_verify": "$STEP_BACKUP_VERIFY",
    "restore_drill": "$STEP_RESTORE_DRILL"
  }
}
EOF
}

on_exit() {
  local exit_code=$?
  if [[ $exit_code -eq 0 ]]; then
    FAILURE_STEP=""
    FAILURE_REASON=""
    write_summary "pass"
  else
    write_summary "fail"
  fi
  exit $exit_code
}

trap on_exit EXIT

echo "[release-readiness] starting local release readiness check"

if [[ -z "${BACKUP_DIR}" && -n "${ENV_FILE}" ]]; then
  BACKUP_DIR="$(env_file_value "$ENV_FILE" "OMNYID_BACKUP_DIR" || true)"
fi
write_backup_dir_hint "${BACKUP_DIR}"

echo "[release-readiness] step 1/6: rust correctness"
bash "${SCRIPT_DIR}/rust-correctness.sh" || {
  mark_step_failed "rust_correctness"
  FAILURE_STEP="rust_correctness"
  exit 1
}
STEP_RUST_CORRECTNESS="pass"

echo "[release-readiness] step 2/6: frontend correctness"
bash "${SCRIPT_DIR}/frontend-correctness.sh" || {
  mark_step_failed "frontend_correctness"
  FAILURE_STEP="frontend_correctness"
  exit 1
}
STEP_FRONTEND_CORRECTNESS="pass"

if [[ -n "${ENV_FILE}" ]]; then
  echo "[release-readiness] step 3/6: production startup policy (${ENV_FILE})"
  bash "${SCRIPT_DIR}/startup-policy-check.sh" "${ENV_FILE}" true || {
    mark_step_failed "startup_policy"
    FAILURE_STEP="startup_policy"
    exit 1
  }
  STEP_STARTUP_POLICY="pass"
else
  echo "[release-readiness] step 3/6: production startup policy skipped (no env file supplied)"
  STEP_STARTUP_POLICY="skipped"
fi

if [[ -n "${ENV_FILE}" && -z "${BACKUP_DIR}" ]]; then
  FAILURE_STEP="backup_verify"
  FAILURE_REASON="production release readiness requires backup_dir or OMNYID_BACKUP_DIR"
  echo "[release-readiness] production release readiness requires backup_dir or OMNYID_BACKUP_DIR" >&2
  exit 1
fi

echo "[release-readiness] step 4/6: deployment ops self-test"
bash "${SCRIPT_DIR}/deployment-ops-selftest.sh" || {
  mark_step_failed "deployment_ops"
  FAILURE_STEP="deployment_ops"
  FAILURE_REASON="deployment ops self-test failed"
  exit 1
}
STEP_DEPLOYMENT_OPS="pass"

if [[ -n "${BACKUP_DIR}" ]]; then
  echo "[release-readiness] step 5/6: backup verification (${BACKUP_DIR})"
  bash "${SCRIPT_DIR}/omnyid-backup-verify.sh" "${BACKUP_DIR}" || {
    mark_step_failed "backup_verify"
    mark_step_blocked "restore_drill"
    FAILURE_STEP="backup_verify"
    FAILURE_REASON="backup verification failed"
    exit 1
  }
  STEP_BACKUP_VERIFY="pass"
  echo "[release-readiness] step 6/6: restore drill (${BACKUP_DIR})"
  bash "${SCRIPT_DIR}/omnyid-restore-drill.sh" "${BACKUP_DIR}" || {
    mark_step_failed "restore_drill"
    FAILURE_STEP="restore_drill"
    FAILURE_REASON="restore drill failed"
    exit 1
  }
  STEP_RESTORE_DRILL="pass"
else
  echo "[release-readiness] step 5/6: backup verification skipped (no backup dir supplied)"
  STEP_BACKUP_VERIFY="skipped"
  echo "[release-readiness] step 6/6: restore drill skipped (no backup dir supplied)"
  STEP_RESTORE_DRILL="skipped"
fi

echo "[release-readiness] local release readiness passed"

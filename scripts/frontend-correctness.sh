#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TYPESCRIPT_SDK_DIR="${REPO_ROOT}/typescript-sdk"
SOLID_UI_DIR="${REPO_ROOT}/solid-ui"

assert_path_exists() {
  local path="$1"
  local label="$2"
  if [[ ! -e "$path" ]]; then
    echo "[frontend-correctness] missing ${label} at ${path}" >&2
    exit 1
  fi
}

run_npm() {
  local dir="$1"
  shift
  (
    cd "$dir"
    npm run "$@"
  )
}

assert_wsl_compatible_node_modules() {
  if [[ -z "${WSL_DISTRO_NAME:-}" ]]; then
    return
  fi
  if [[ "$REPO_ROOT" != /mnt/* ]]; then
    return
  fi
  if [[ -x "${SOLID_UI_DIR}/node_modules/.bin/vite.cmd" ]] || [[ -x "${TYPESCRIPT_SDK_DIR}/node_modules/.bin/tsc.cmd" ]]; then
    echo "[frontend-correctness] WSL detected on a Windows-mounted workspace with Windows-installed node_modules." >&2
    echo "[frontend-correctness] Run npm ci inside WSL for Linux-native frontend validation, or use scripts/frontend-correctness.ps1 on Windows." >&2
    exit 1
  fi
}

assert_path_exists "$TYPESCRIPT_SDK_DIR" "TypeScript SDK workspace"
assert_path_exists "$SOLID_UI_DIR" "Solid UI workspace"
assert_path_exists "${TYPESCRIPT_SDK_DIR}/node_modules" "TypeScript SDK dependencies"
assert_path_exists "${SOLID_UI_DIR}/node_modules" "Solid UI dependencies"
assert_wsl_compatible_node_modules

echo "[frontend-correctness] npm run typecheck (typescript-sdk)"
run_npm "$TYPESCRIPT_SDK_DIR" typecheck

echo "[frontend-correctness] npm run build (typescript-sdk)"
run_npm "$TYPESCRIPT_SDK_DIR" build

echo "[frontend-correctness] npm run test:continuity (typescript-sdk)"
run_npm "$TYPESCRIPT_SDK_DIR" test:continuity

echo "[frontend-correctness] npm run typecheck (solid-ui)"
run_npm "$SOLID_UI_DIR" typecheck

echo "[frontend-correctness] npm run test:local-router (solid-ui)"
run_npm "$SOLID_UI_DIR" test:local-router

echo "[frontend-correctness] npm run build (solid-ui)"
run_npm "$SOLID_UI_DIR" build

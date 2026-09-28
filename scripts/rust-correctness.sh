#!/usr/bin/env bash
set -euo pipefail

find_cargo() {
  if [[ -n "${CARGO_BIN:-}" ]] && command -v "${CARGO_BIN}" >/dev/null 2>&1; then
    command -v "${CARGO_BIN}"
    return 0
  fi
  if command -v cargo >/dev/null 2>&1; then
    command -v cargo
    return 0
  fi
  if command -v cargo.exe >/dev/null 2>&1; then
    command -v cargo.exe
    return 0
  fi
  local candidates=(
    "${HOME:-}/.cargo/bin/cargo"
    "${HOME:-}/.cargo/bin/cargo.exe"
    "${USERPROFILE:-}/.cargo/bin/cargo.exe"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

if ! cargo_bin="$(find_cargo)"; then
  echo "[rust-correctness] cargo not found" >&2
  exit 127
fi

echo "[rust-correctness] $cargo_bin check --quiet"
"$cargo_bin" check --quiet

echo "[rust-correctness] $cargo_bin test --lib --quiet"
"$cargo_bin" test --lib --quiet

run_api_flows="${RUN_RUST_API_FLOWS:-auto}"
test_db_url="${TEST_DATABASE_URL:-}"

should_run_api_flows=0
case "$run_api_flows" in
  1|true|TRUE|yes|YES|on|ON)
    should_run_api_flows=1
    ;;
  0|false|FALSE|no|NO|off|OFF)
    should_run_api_flows=0
    ;;
  auto|AUTO|"")
    if [[ -n "$test_db_url" ]]; then
      should_run_api_flows=1
    fi
    ;;
  *)
    echo "[rust-correctness] unsupported RUN_RUST_API_FLOWS value: $run_api_flows" >&2
    exit 2
    ;;
esac

if [[ "$should_run_api_flows" -eq 1 ]]; then
  if [[ -z "$test_db_url" ]]; then
    echo "[rust-correctness] TEST_DATABASE_URL is required when api_flows are enabled" >&2
    exit 2
  fi
  echo "[rust-correctness] $cargo_bin test --test api_flows --quiet"
  "$cargo_bin" test --test api_flows --quiet
else
  echo "[rust-correctness] skipping api_flows integration tests"
fi

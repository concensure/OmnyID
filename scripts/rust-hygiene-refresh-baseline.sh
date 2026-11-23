#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-artifacts/rust-hygiene}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUMMARY_ENV="$OUT_DIR/summary.env"
BASELINE_FILE="${RUST_HYGIENE_BASELINE:-$SCRIPT_DIR/rust-hygiene-baseline.env}"
ALLOW_REGRESSION_BASELINE="${ALLOW_RUST_HYGIENE_REGRESSION_BASELINE:-0}"

current_baseline_fmt=""
current_baseline_clippy_errors=""
current_baseline_clippy_warnings=""

load_existing_baseline() {
  if [[ ! -f "$BASELINE_FILE" ]]; then
    return 0
  fi

  while IFS='=' read -r key value; do
    value="${value%%#*}"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    case "$key" in
      FMT_FILES) current_baseline_fmt="$value" ;;
      CLIPPY_ERRORS) current_baseline_clippy_errors="$value" ;;
      CLIPPY_WARNINGS) current_baseline_clippy_warnings="$value" ;;
    esac
  done <"$BASELINE_FILE"
}

is_worse_than_baseline() {
  local current="$1"
  local baseline="$2"

  if [[ -z "$baseline" ]]; then
    return 1
  fi

  (( current > baseline ))
}

if [[ ! -f "$SUMMARY_ENV" ]]; then
  if ! bash "$SCRIPT_DIR/rust-hygiene.sh" "$OUT_DIR"; then
    :
  fi
fi

if [[ ! -f "$SUMMARY_ENV" ]]; then
  echo "[rust-hygiene-refresh-baseline] missing $SUMMARY_ENV"
  exit 1
fi

# shellcheck disable=SC1090
source "$SUMMARY_ENV"

if [[ -z "${FMT_FILES:-}" || -z "${CLIPPY_ERRORS:-}" || -z "${CLIPPY_WARNINGS:-}" ]]; then
  echo "[rust-hygiene-refresh-baseline] summary is missing required counts"
  exit 1
fi

load_existing_baseline

if [[ "$ALLOW_REGRESSION_BASELINE" != "1" ]]; then
  if is_worse_than_baseline "$FMT_FILES" "$current_baseline_fmt" \
    || is_worse_than_baseline "$CLIPPY_ERRORS" "$current_baseline_clippy_errors" \
    || is_worse_than_baseline "$CLIPPY_WARNINGS" "$current_baseline_clippy_warnings"; then
    echo "[rust-hygiene-refresh-baseline] refusing to refresh baseline with worse counts"
    echo "[rust-hygiene-refresh-baseline] set ALLOW_RUST_HYGIENE_REGRESSION_BASELINE=1 to override"
    exit 1
  fi
fi

cat >"$BASELINE_FILE" <<EOF
FMT_FILES=$FMT_FILES
CLIPPY_ERRORS=$CLIPPY_ERRORS
CLIPPY_WARNINGS=$CLIPPY_WARNINGS
EOF

echo "[rust-hygiene-refresh-baseline] wrote $BASELINE_FILE"

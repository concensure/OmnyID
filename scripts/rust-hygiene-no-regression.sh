#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-artifacts/rust-hygiene}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUMMARY_ENV="$OUT_DIR/summary.env"
VERDICT_MD="$OUT_DIR/no-regression-verdict.md"
VERDICT_JSON="$OUT_DIR/no-regression-verdict.json"
VERDICT_ENV="$OUT_DIR/no-regression-verdict.env"

json_escape() {
  local value="${1//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  printf '%s' "$value"
}

write_verdict() {
  local verdict="$1"
  local reason="$2"

  cat >"$VERDICT_MD" <<EOF
# Rust hygiene no-regression verdict

- verdict: $verdict
- reason: $reason
- baseline: ${BASELINE:-none}
- fmt files: ${FMT_FILES:-unknown} (delta ${FMT_DELTA:-unknown})
- clippy errors: ${CLIPPY_ERRORS:-unknown} (delta ${CLIPPY_ERRORS_DELTA:-unknown})
- clippy warnings: ${CLIPPY_WARNINGS:-unknown} (delta ${CLIPPY_WARNINGS_DELTA:-unknown})
EOF

  cat >"$VERDICT_JSON" <<EOF
{
  "verdict": "$(json_escape "$verdict")",
  "reason": "$(json_escape "$reason")",
  "baseline": "$(json_escape "${BASELINE:-none}")",
  "counts": {
    "fmt_files": ${FMT_FILES:-0},
    "clippy_errors": ${CLIPPY_ERRORS:-0},
    "clippy_warnings": ${CLIPPY_WARNINGS:-0}
  },
  "deltas": {
    "fmt_files": "$(json_escape "${FMT_DELTA:-unknown}")",
    "clippy_errors": "$(json_escape "${CLIPPY_ERRORS_DELTA:-unknown}")",
    "clippy_warnings": "$(json_escape "${CLIPPY_WARNINGS_DELTA:-unknown}")"
  }
}
EOF

  cat >"$VERDICT_ENV" <<EOF
VERDICT=$verdict
REASON=$(printf '%q' "$reason")
EOF
}

if [[ ! -f "$SUMMARY_ENV" ]]; then
  if ! bash "$SCRIPT_DIR/rust-hygiene.sh" "$OUT_DIR"; then
    :
  fi
fi

if [[ ! -f "$SUMMARY_ENV" ]]; then
  write_verdict "error" "missing summary.env"
  echo "[rust-hygiene-no-regression] missing $SUMMARY_ENV"
  exit 1
fi

# shellcheck disable=SC1090
source "$SUMMARY_ENV"

if [[ "${REGRESSION_DETECTED:-0}" == "1" ]]; then
  write_verdict "fail" "regression detected relative to baseline"
  echo "[rust-hygiene-no-regression] regression detected"
  exit 1
fi

write_verdict "pass" "no regression detected relative to baseline"
echo "[rust-hygiene-no-regression] no regression detected"

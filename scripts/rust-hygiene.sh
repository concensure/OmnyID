#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-artifacts/rust-hygiene}"
mkdir -p "$OUT_DIR"

fmt_log="$OUT_DIR/fmt.log"
clippy_log="$OUT_DIR/clippy.log"
summary_md="$OUT_DIR/summary.md"
summary_json="$OUT_DIR/summary.json"
summary_env="$OUT_DIR/summary.env"
baseline_file="${RUST_HYGIENE_BASELINE:-scripts/rust-hygiene-baseline.env}"

status=0
baseline_fmt_files=""
baseline_clippy_errors=""
baseline_clippy_warnings=""

json_escape() {
  local value="${1//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  printf '%s' "$value"
}

format_delta() {
  local current="$1"
  local baseline="$2"

  if [[ -z "$baseline" ]]; then
    printf 'n/a'
    return 0
  fi

  local delta=$((current - baseline))
  if (( delta > 0 )); then
    printf '+%d' "$delta"
  else
    printf '%d' "$delta"
  fi
}

delta_is_positive() {
  local delta="$1"
  [[ "$delta" =~ ^\+[0-9]+$ ]]
}

load_baseline() {
  if [[ ! -f "$baseline_file" ]]; then
    return 0
  fi

  while IFS='=' read -r key value; do
    value="${value%%#*}"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    case "$key" in
      FMT_FILES) baseline_fmt_files="$value" ;;
      CLIPPY_ERRORS) baseline_clippy_errors="$value" ;;
      CLIPPY_WARNINGS) baseline_clippy_warnings="$value" ;;
    esac
  done <"$baseline_file"
}

write_summary() {
  local cargo_bin="$1"
  local fmt_file_count="$2"
  local clippy_error_count="$3"
  local clippy_warning_count="$4"
  local fmt_top_files="$5"
  local clippy_top_files="$6"
  local fmt_delta="$7"
  local clippy_error_delta="$8"
  local clippy_warning_delta="$9"
  local baseline_label="${10}"

  {
    echo "# Rust hygiene summary"
    echo
    if [[ $status -eq 0 ]]; then
      echo "Status: clean"
    else
      echo "Status: advisory failures detected"
    fi
    echo
    echo "## Environment"
    echo
    echo "- cargo: \`$cargo_bin\`"
    echo
    echo "## Counts"
    echo
    echo "- fmt files with diffs: $fmt_file_count"
    echo "- clippy errors: $clippy_error_count"
    echo "- clippy warnings: $clippy_warning_count"
    echo
    echo "## Trend vs baseline"
    echo
    echo "- baseline: $baseline_label"
    echo "- fmt files delta: $fmt_delta"
    echo "- clippy errors delta: $clippy_error_delta"
    echo "- clippy warnings delta: $clippy_warning_delta"
    echo
    echo "## Top fmt files"
    echo
    if [[ -n "$fmt_top_files" ]]; then
      while IFS= read -r line; do
        [[ -n "$line" ]] && echo "- $line"
      done <<<"$fmt_top_files"
    else
      echo "- none"
    fi
    echo
    echo "## Top clippy files"
    echo
    if [[ -n "$clippy_top_files" ]]; then
      while IFS= read -r line; do
        [[ -n "$line" ]] && echo "- $line"
      done <<<"$clippy_top_files"
    else
      echo "- none"
    fi
    echo
    echo "## Artifacts"
    echo
    echo "- [fmt.log](./fmt.log)"
    echo "- [clippy.log](./clippy.log)"
    echo "- [summary.json](./summary.json)"
  } >"$summary_md"
}

write_summary_json() {
  local cargo_bin="$1"
  local fmt_file_count="$2"
  local clippy_error_count="$3"
  local clippy_warning_count="$4"
  local fmt_delta="$5"
  local clippy_error_delta="$6"
  local clippy_warning_delta="$7"
  local baseline_label="$8"

  cat >"$summary_json" <<EOF
{
  "status": "$(if [[ $status -eq 0 ]]; then printf 'clean'; else printf 'advisory_failures'; fi)",
  "cargo": "$(json_escape "$cargo_bin")",
  "baseline": "$(json_escape "$baseline_label")",
  "counts": {
    "fmt_files": $fmt_file_count,
    "clippy_errors": $clippy_error_count,
    "clippy_warnings": $clippy_warning_count
  },
  "deltas": {
    "fmt_files": "$(json_escape "$fmt_delta")",
    "clippy_errors": "$(json_escape "$clippy_error_delta")",
    "clippy_warnings": "$(json_escape "$clippy_warning_delta")"
  }
}
EOF
}

write_summary_env() {
  local cargo_bin="$1"
  local fmt_file_count="$2"
  local clippy_error_count="$3"
  local clippy_warning_count="$4"
  local fmt_delta="$5"
  local clippy_error_delta="$6"
  local clippy_warning_delta="$7"
  local baseline_label="$8"
  local regression_detected="$9"

  cat >"$summary_env" <<EOF
STATUS=$(if [[ $status -eq 0 ]]; then printf 'clean'; else printf 'advisory_failures'; fi)
CARGO_BIN=$(printf '%q' "$cargo_bin")
BASELINE=$(printf '%q' "$baseline_label")
FMT_FILES=$fmt_file_count
CLIPPY_ERRORS=$clippy_error_count
CLIPPY_WARNINGS=$clippy_warning_count
FMT_DELTA=$(printf '%q' "$fmt_delta")
CLIPPY_ERRORS_DELTA=$(printf '%q' "$clippy_error_delta")
CLIPPY_WARNINGS_DELTA=$(printf '%q' "$clippy_warning_delta")
REGRESSION_DETECTED=$regression_detected
EOF
}

find_cargo() {
  if [[ -n "${CARGO_BIN:-}" && -x "${CARGO_BIN:-}" ]]; then
    printf '%s\n' "$CARGO_BIN"
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

cargo_bin=""
load_baseline
if ! cargo_bin="$(find_cargo)"; then
  status=1
  echo "[rust-hygiene] cargo not found" >"$fmt_log"
  echo "[rust-hygiene] cargo not found" >"$clippy_log"
  write_summary "not found" "0" "0" "0" "" "" "n/a" "n/a" "n/a" "$(if [[ -f "$baseline_file" ]]; then printf '%s' "$baseline_file"; else printf 'none'; fi)"
  write_summary_json "not found" "0" "0" "0" "n/a" "n/a" "n/a" "$(if [[ -f "$baseline_file" ]]; then printf '%s' "$baseline_file"; else printf 'none'; fi)"
  write_summary_env "not found" "0" "0" "0" "n/a" "n/a" "n/a" "$(if [[ -f "$baseline_file" ]]; then printf '%s' "$baseline_file"; else printf 'none'; fi)" "0"
  echo "[rust-hygiene] cargo not found; see $summary_md"
  exit "$status"
fi

echo "[rust-hygiene] $cargo_bin fmt --check"
if ! "$cargo_bin" fmt --check >"$fmt_log" 2>&1; then
  status=1
fi

echo "[rust-hygiene] $cargo_bin clippy --all-targets -- -D warnings"
if ! "$cargo_bin" clippy --all-targets -- -D warnings >"$clippy_log" 2>&1; then
  status=1
fi

fmt_file_count=$(grep -c '^Diff in ' "$fmt_log" 2>/dev/null || true)
clippy_error_count=$(grep -Ec '^error(\[[^]]+\])?:' "$clippy_log" 2>/dev/null || true)
clippy_warning_count=$(grep -Ec '^warning:' "$clippy_log" 2>/dev/null || true)

fmt_top_files=$(
  grep '^Diff in ' "$fmt_log" 2>/dev/null \
    | sed -E 's/^Diff in //; s/:[0-9]+:$//; s#^\\\\\?\\##' \
    | sort \
    | uniq -c \
    | sort -nr \
    | head -10 \
    | sed -E 's/^ *([0-9]+) (.+)$/\1x `\2`/' \
    || true
)

clippy_top_files=$(
  grep -E '^[[:space:]]*--> ' "$clippy_log" 2>/dev/null \
    | sed -E 's/^[[:space:]]*--> //; s/:[0-9]+:[0-9]+$//' \
    | sort \
    | uniq -c \
    | sort -nr \
    | head -10 \
    | sed -E 's/^ *([0-9]+) (.+)$/\1x `\2`/' \
    || true
)

fmt_delta="$(format_delta "$fmt_file_count" "$baseline_fmt_files")"
clippy_error_delta="$(format_delta "$clippy_error_count" "$baseline_clippy_errors")"
clippy_warning_delta="$(format_delta "$clippy_warning_count" "$baseline_clippy_warnings")"
baseline_label="none"
if [[ -f "$baseline_file" ]]; then
  baseline_label="$baseline_file"
fi

regression_detected=0
if delta_is_positive "$fmt_delta" \
  || delta_is_positive "$clippy_error_delta" \
  || delta_is_positive "$clippy_warning_delta"; then
  regression_detected=1
fi

write_summary "$cargo_bin" "$fmt_file_count" "$clippy_error_count" "$clippy_warning_count" "$fmt_top_files" "$clippy_top_files" "$fmt_delta" "$clippy_error_delta" "$clippy_warning_delta" "$baseline_label"
write_summary_json "$cargo_bin" "$fmt_file_count" "$clippy_error_count" "$clippy_warning_count" "$fmt_delta" "$clippy_error_delta" "$clippy_warning_delta" "$baseline_label"
write_summary_env "$cargo_bin" "$fmt_file_count" "$clippy_error_count" "$clippy_warning_count" "$fmt_delta" "$clippy_error_delta" "$clippy_warning_delta" "$baseline_label" "$regression_detected"

if [[ $status -ne 0 ]]; then
  echo "[rust-hygiene] advisory failures detected; see $OUT_DIR"
else
  echo "[rust-hygiene] clean"
fi

echo "[rust-hygiene] summary written to $summary_md"

exit "$status"

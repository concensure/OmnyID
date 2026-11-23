#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$(mktemp -d)"
CURRENT_BASH="${BASH:-bash}"
trap 'rm -rf "$TMP_DIR"' EXIT

assert_contains() {
  local file="$1"
  local pattern="$2"
  if ! grep -Fq -- "$pattern" "$file"; then
    echo "[rust-hygiene-selftest] expected '$pattern' in $file"
    exit 1
  fi
}

assert_exit_code() {
  local expected="$1"
  local actual="$2"
  if [[ "$expected" != "$actual" ]]; then
    echo "[rust-hygiene-selftest] expected exit code $expected, got $actual"
    exit 1
  fi
}

FAKE_CARGO="$TMP_DIR/fake-cargo.sh"
cat >"$FAKE_CARGO" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

subcommand="${1:-}"
shift || true

case "$subcommand" in
  fmt)
    cat <<'OUT'
Diff in \\?\C:\repo\src\alpha.rs:10:
Diff in \\?\C:\repo\src\alpha.rs:20:
Diff in \\?\C:\repo\src\beta.rs:5:
OUT
    exit 1
    ;;
  clippy)
    cat <<'OUT'
error: first issue
  --> src\alpha.rs:10:5
warning: noisy warning
error[E1234]: second issue
  --> src\beta.rs:20:1
OUT
    exit 1
    ;;
  *)
    echo "unexpected cargo subcommand: $subcommand" >&2
    exit 2
    ;;
esac
EOF
chmod +x "$FAKE_CARGO"

BASELINE_FILE="$TMP_DIR/baseline.env"
cat >"$BASELINE_FILE" <<'EOF'
FMT_FILES=2
CLIPPY_ERRORS=1
CLIPPY_WARNINGS=0
EOF

OUT_DIR="$TMP_DIR/out"
CARGO_BIN="$FAKE_CARGO" \
RUST_HYGIENE_BASELINE="$BASELINE_FILE" \
bash "$SCRIPT_DIR/rust-hygiene.sh" "$OUT_DIR" >/dev/null 2>&1 || true

assert_contains "$OUT_DIR/summary.env" "FMT_FILES=3"
assert_contains "$OUT_DIR/summary.env" "CLIPPY_ERRORS=2"
assert_contains "$OUT_DIR/summary.env" "CLIPPY_WARNINGS=1"
assert_contains "$OUT_DIR/summary.env" "FMT_DELTA=+1"
assert_contains "$OUT_DIR/summary.env" "CLIPPY_ERRORS_DELTA=+1"
assert_contains "$OUT_DIR/summary.env" "REGRESSION_DETECTED=1"
assert_contains "$OUT_DIR/summary.md" "fmt files delta: +1"
assert_contains "$OUT_DIR/summary.json" "\"fmt_files\": \"+1\""

set +e
bash "$SCRIPT_DIR/rust-hygiene-no-regression.sh" "$OUT_DIR" >/dev/null 2>&1
no_regression_exit=$?
set -e
assert_exit_code 1 "$no_regression_exit"
assert_contains "$OUT_DIR/no-regression-verdict.env" "VERDICT=fail"
assert_contains "$OUT_DIR/no-regression-verdict.md" "verdict: fail"

set +e
RUST_HYGIENE_BASELINE="$BASELINE_FILE" \
bash "$SCRIPT_DIR/rust-hygiene-refresh-baseline.sh" "$OUT_DIR" >/dev/null 2>&1
refresh_exit=$?
set -e
assert_exit_code 1 "$refresh_exit"
assert_contains "$BASELINE_FILE" "FMT_FILES=2"

IMPROVED_OUT_DIR="$TMP_DIR/improved"
mkdir -p "$IMPROVED_OUT_DIR"
cat >"$IMPROVED_OUT_DIR/summary.env" <<'EOF'
STATUS=advisory_failures
CARGO_BIN=fake
BASELINE=baseline.env
FMT_FILES=1
CLIPPY_ERRORS=1
CLIPPY_WARNINGS=0
FMT_DELTA=-1
CLIPPY_ERRORS_DELTA=0
CLIPPY_WARNINGS_DELTA=0
REGRESSION_DETECTED=0
EOF

RUST_HYGIENE_BASELINE="$BASELINE_FILE" \
bash "$SCRIPT_DIR/rust-hygiene-refresh-baseline.sh" "$IMPROVED_OUT_DIR" >/dev/null 2>&1

assert_contains "$BASELINE_FILE" "FMT_FILES=1"
assert_contains "$BASELINE_FILE" "CLIPPY_ERRORS=1"
assert_contains "$BASELINE_FILE" "CLIPPY_WARNINGS=0"

set +e
bash "$SCRIPT_DIR/rust-hygiene-no-regression.sh" "$IMPROVED_OUT_DIR" >/dev/null 2>&1
improved_no_regression_exit=$?
set -e
assert_exit_code 0 "$improved_no_regression_exit"
assert_contains "$IMPROVED_OUT_DIR/no-regression-verdict.env" "VERDICT=pass"
assert_contains "$IMPROVED_OUT_DIR/no-regression-verdict.md" "verdict: pass"

REGRESSION_OVERRIDE_OUT_DIR="$TMP_DIR/regression-override"
mkdir -p "$REGRESSION_OVERRIDE_OUT_DIR"
cat >"$REGRESSION_OVERRIDE_OUT_DIR/summary.env" <<'EOF'
STATUS=advisory_failures
CARGO_BIN=fake
BASELINE=baseline.env
FMT_FILES=5
CLIPPY_ERRORS=4
CLIPPY_WARNINGS=2
FMT_DELTA=+4
CLIPPY_ERRORS_DELTA=+3
CLIPPY_WARNINGS_DELTA=+2
REGRESSION_DETECTED=1
EOF

ALLOW_RUST_HYGIENE_REGRESSION_BASELINE=1 \
RUST_HYGIENE_BASELINE="$BASELINE_FILE" \
bash "$SCRIPT_DIR/rust-hygiene-refresh-baseline.sh" "$REGRESSION_OVERRIDE_OUT_DIR" >/dev/null 2>&1

assert_contains "$BASELINE_FILE" "FMT_FILES=5"
assert_contains "$BASELINE_FILE" "CLIPPY_ERRORS=4"
assert_contains "$BASELINE_FILE" "CLIPPY_WARNINGS=2"

NO_BASELINE_OUT_DIR="$TMP_DIR/no-baseline"
NO_BASELINE_FILE="$TMP_DIR/missing-baseline.env"
set +e
PATH="/usr/bin:/bin" HOME="$TMP_DIR/no-home" USERPROFILE="$TMP_DIR/no-userprofile" \
RUST_HYGIENE_BASELINE="$NO_BASELINE_FILE" \
"$CURRENT_BASH" "$SCRIPT_DIR/rust-hygiene.sh" "$NO_BASELINE_OUT_DIR" >/dev/null 2>&1
no_baseline_exit=$?
set -e
assert_exit_code 1 "$no_baseline_exit"
assert_contains "$NO_BASELINE_OUT_DIR/summary.md" "- baseline: none"
assert_contains "$NO_BASELINE_OUT_DIR/summary.md" "- fmt files delta: n/a"
assert_contains "$NO_BASELINE_OUT_DIR/summary.env" "REGRESSION_DETECTED=0"

MISSING_CARGO_OUT_DIR="$TMP_DIR/missing-cargo"
set +e
PATH="/usr/bin:/bin" HOME="$TMP_DIR/no-home" USERPROFILE="$TMP_DIR/no-userprofile" \
RUST_HYGIENE_BASELINE="$BASELINE_FILE" \
"$CURRENT_BASH" "$SCRIPT_DIR/rust-hygiene.sh" "$MISSING_CARGO_OUT_DIR" >/dev/null 2>&1
missing_cargo_exit=$?
set -e
assert_exit_code 1 "$missing_cargo_exit"
assert_contains "$MISSING_CARGO_OUT_DIR/summary.md" "Status: advisory failures detected"
assert_contains "$MISSING_CARGO_OUT_DIR/summary.md" "- cargo: \`not found\`"
assert_contains "$MISSING_CARGO_OUT_DIR/summary.env" "CARGO_BIN=not\\ found"

echo "[rust-hygiene-selftest] passed"

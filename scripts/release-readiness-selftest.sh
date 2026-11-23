#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "[release-readiness-selftest] expected output to contain: $needle" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

cp "$SCRIPT_DIR/release-readiness.sh" "$TMP_DIR/release-readiness.sh"
chmod +x "$TMP_DIR/release-readiness.sh"

cat >"$TMP_DIR/rust-correctness.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-rust-correctness] ok"
EOF
chmod +x "$TMP_DIR/rust-correctness.sh"

cat >"$TMP_DIR/frontend-correctness.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-frontend-correctness] ok"
EOF
chmod +x "$TMP_DIR/frontend-correctness.sh"

cat >"$TMP_DIR/startup-policy-check.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-startup-policy] $1"
EOF
chmod +x "$TMP_DIR/startup-policy-check.sh"

cat >"$TMP_DIR/deployment-ops-selftest.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-deployment-ops] ok"
EOF
chmod +x "$TMP_DIR/deployment-ops-selftest.sh"

cat >"$TMP_DIR/omnyid-backup-verify.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-backup-verify] $1"
EOF
chmod +x "$TMP_DIR/omnyid-backup-verify.sh"

cat >"$TMP_DIR/omnyid-restore-drill.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-restore-drill] $1"
EOF
chmod +x "$TMP_DIR/omnyid-restore-drill.sh"

touch "$TMP_DIR/.env.production"
mkdir -p "$TMP_DIR/backup"

OUTPUT_DIR="$TMP_DIR/out"
output_with_env="$("$TMP_DIR/release-readiness.sh" "$TMP_DIR/.env.production" "$OUTPUT_DIR" "$TMP_DIR/backup")"
assert_contains "$output_with_env" "[release-readiness] step 1/6: rust correctness"
assert_contains "$output_with_env" "[fake-rust-correctness] ok"
assert_contains "$output_with_env" "[release-readiness] step 2/6: frontend correctness"
assert_contains "$output_with_env" "[fake-frontend-correctness] ok"
assert_contains "$output_with_env" "[release-readiness] step 3/6: production startup policy ($TMP_DIR/.env.production)"
assert_contains "$output_with_env" "[fake-startup-policy] $TMP_DIR/.env.production"
assert_contains "$output_with_env" "[release-readiness] step 4/6: deployment ops self-test"
assert_contains "$output_with_env" "[fake-deployment-ops] ok"
assert_contains "$output_with_env" "[release-readiness] step 5/6: backup verification ($TMP_DIR/backup)"
assert_contains "$output_with_env" "[fake-backup-verify] $TMP_DIR/backup"
assert_contains "$output_with_env" "[release-readiness] step 6/6: restore drill ($TMP_DIR/backup)"
assert_contains "$output_with_env" "[fake-restore-drill] $TMP_DIR/backup"
assert_contains "$output_with_env" "[release-readiness] local release readiness passed"
assert_contains "$(cat "$OUTPUT_DIR/summary.env")" "STATUS=pass"
assert_contains "$(cat "$OUTPUT_DIR/summary.env")" "STEP_FRONTEND_CORRECTNESS=pass"
assert_contains "$(cat "$OUTPUT_DIR/summary.env")" "STEP_STARTUP_POLICY=pass"
assert_contains "$(cat "$OUTPUT_DIR/summary.env")" "STEP_BACKUP_VERIFY=pass"
assert_contains "$(cat "$OUTPUT_DIR/summary.env")" "STEP_RESTORE_DRILL=pass"
assert_contains "$(cat "$OUTPUT_DIR/summary.md")" "- frontend_correctness: pass"
assert_contains "$(cat "$OUTPUT_DIR/summary.md")" "- deployment_ops: pass"
assert_contains "$(cat "$OUTPUT_DIR/summary.md")" "- backup_verify: pass"
assert_contains "$(cat "$OUTPUT_DIR/summary.md")" "- restore_drill: pass"
assert_contains "$(cat "$OUTPUT_DIR/summary.md")" "- failure_step: none"
assert_contains "$(cat "$OUTPUT_DIR/summary.md")" "- failure_reason: none"
assert_contains "$(cat "$OUTPUT_DIR/summary.json")" "\"status\": \"pass\""
assert_contains "$(cat "$OUTPUT_DIR/summary.json")" "\"restore_drill\": \"pass\""

output_without_env="$("$TMP_DIR/release-readiness.sh")"
assert_contains "$output_without_env" "production startup policy skipped (no env file supplied)"
assert_contains "$output_without_env" "backup verification skipped (no backup dir supplied)"
assert_contains "$output_without_env" "restore drill skipped (no backup dir supplied)"

set +e
output_missing_backup="$("$TMP_DIR/release-readiness.sh" "$TMP_DIR/.env.production" 2>&1)"
missing_backup_exit=$?
set -e
if [[ $missing_backup_exit -eq 0 ]]; then
  echo "[release-readiness-selftest] expected production backup-dir enforcement to fail" >&2
  exit 1
fi
assert_contains "$output_missing_backup" "production release readiness requires backup_dir or OMNYID_BACKUP_DIR"

cat >"$TMP_DIR/omnyid-backup-verify.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-backup-verify] failing $1" >&2
exit 1
EOF
chmod +x "$TMP_DIR/omnyid-backup-verify.sh"

FAIL_OUTPUT_DIR="$TMP_DIR/out-fail"
set +e
output_backup_fail="$("$TMP_DIR/release-readiness.sh" "$TMP_DIR/.env.production" "$FAIL_OUTPUT_DIR" "$TMP_DIR/backup" 2>&1)"
backup_fail_exit=$?
set -e
if [[ $backup_fail_exit -eq 0 ]]; then
  echo "[release-readiness-selftest] expected backup verify failure to fail the wrapper" >&2
  exit 1
fi
assert_contains "$output_backup_fail" "[fake-backup-verify] failing $TMP_DIR/backup"
assert_contains "$(cat "$FAIL_OUTPUT_DIR/summary.env")" "STATUS=fail"
assert_contains "$(cat "$FAIL_OUTPUT_DIR/summary.env")" "STEP_BACKUP_VERIFY=fail"
assert_contains "$(cat "$FAIL_OUTPUT_DIR/summary.env")" "STEP_RESTORE_DRILL=blocked"
assert_contains "$(cat "$FAIL_OUTPUT_DIR/summary.env")" "FAILURE_STEP=backup_verify"
assert_contains "$(cat "$FAIL_OUTPUT_DIR/summary.env")" "FAILURE_REASON=backup verification failed"

echo "[release-readiness-selftest] passed"

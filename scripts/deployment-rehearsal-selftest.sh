#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "[deployment-rehearsal-selftest] expected output to contain: $needle" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

cp "$SCRIPT_DIR/deployment-rehearsal.sh" "$TMP_DIR/deployment-rehearsal.sh"
chmod +x "$TMP_DIR/deployment-rehearsal.sh"

cat >"$TMP_DIR/release-readiness.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-release-readiness] env=$1 out=$2 backup=$3"
EOF
chmod +x "$TMP_DIR/release-readiness.sh"

cat >"$TMP_DIR/verify-deployment.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-verify-deployment] base=$1 workspace=${OMNYID_WORKSPACE_URL:-} ops=${OMNYID_OPERATIONAL_ENDPOINT_TOKEN:-} bearer=${OMNYID_VERIFY_DEPLOYMENT_BEARER_TOKEN:-}"
EOF
chmod +x "$TMP_DIR/verify-deployment.sh"

printf '%s\n' 'ops-from-env-file' >"$TMP_DIR/ops-token.txt"
cat >"$TMP_DIR/.env.production" <<'EOF'
OMNYID_ENV=production
OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE=ops-token.txt
OMNYID_VERIFY_DEPLOYMENT_BEARER_TOKEN=bearer-from-env-file
EOF
mkdir -p "$TMP_DIR/backup" "$TMP_DIR/out"

output_with_live="$("$TMP_DIR/deployment-rehearsal.sh" "$TMP_DIR/.env.production" "$TMP_DIR/out" "$TMP_DIR/backup" "https://api.omnyid.example" "https://app.omnyid.example/workspace/")"
assert_contains "$output_with_live" "[deployment-rehearsal] step 1/2: release readiness"
assert_contains "$output_with_live" "[fake-release-readiness] env=$TMP_DIR/.env.production out=$TMP_DIR/out backup=$TMP_DIR/backup"
assert_contains "$output_with_live" "[deployment-rehearsal] step 2/2: live deployment verification (https://api.omnyid.example)"
assert_contains "$output_with_live" "[fake-verify-deployment] base=https://api.omnyid.example workspace=https://app.omnyid.example/workspace/ ops= bearer=bearer-from-env-file"
assert_contains "$output_with_live" "[deployment-rehearsal] deployment rehearsal passed"
assert_contains "$(cat "$TMP_DIR/out/deployment-rehearsal-summary.env")" "STEP_RELEASE_READINESS=pass"
assert_contains "$(cat "$TMP_DIR/out/deployment-rehearsal-summary.env")" "STEP_LIVE_VERIFY=pass"

output_without_live="$("$TMP_DIR/deployment-rehearsal.sh")"
assert_contains "$output_without_live" "live deployment verification skipped (no base url supplied)"

set +e
output_missing_base_url="$("$TMP_DIR/deployment-rehearsal.sh" "$TMP_DIR/.env.production" "$TMP_DIR/out" "$TMP_DIR/backup" 2>&1)"
missing_base_url_exit=$?
set -e
if [[ $missing_base_url_exit -eq 0 ]]; then
  echo "[deployment-rehearsal-selftest] expected production base-url enforcement to fail" >&2
  exit 1
fi
assert_contains "$output_missing_base_url" "production deployment rehearsal requires base_url or OMNYID_BASE_URL"

echo "[deployment-rehearsal-selftest] passed"

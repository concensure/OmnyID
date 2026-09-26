#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_PARENT="$SCRIPT_DIR/.tmp"
mkdir -p "$TMP_PARENT"
TMP_DIR="$(mktemp -d "$TMP_PARENT/deployment-ops-selftest.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "[deployment-ops-selftest] expected output to contain: $needle" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

assert_exit_code() {
  local expected="$1"
  local actual="$2"
  if [[ "$expected" != "$actual" ]]; then
    echo "[deployment-ops-selftest] expected exit code $expected, got $actual" >&2
    exit 1
  fi
}

PORT=18765
SERVER_LOG="$TMP_DIR/server.log"

mkdir -p "$TMP_DIR/secrets"
printf '%s\n' 'runtime-session-secret' >"$TMP_DIR/secrets/session_secret"
printf '%s\n' 'postgres-password' >"$TMP_DIR/secrets/postgres_password"
printf '%s\n' 'postgres://omnyid_prod:secret@db.internal:5432/omnyid_prod' >"$TMP_DIR/secrets/database_url"
printf '%s\n' 'postgres://afp:afp@postgres:5432/afp' >"$TMP_DIR/secrets/database_url_default"

find_python() {
  local candidate
  for candidate in python python.exe python3 python3.exe; do
    if command -v "$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  if command -v py >/dev/null 2>&1; then
    printf '%s\n' "py -3"
    return 0
  fi
  if command -v py.exe >/dev/null 2>&1; then
    printf '%s\n' "py.exe -3"
    return 0
  fi
  return 1
}

if ! python_cmd="$(find_python)"; then
  echo "[deployment-ops-selftest] no Python launcher available for mock server" >&2
  exit 1
fi

can_run_live_verify=1
if [[ "$python_cmd" == "python.exe" || "$python_cmd" == "python3.exe" || "$python_cmd" == "py -3" || "$python_cmd" == "py.exe -3" ]]; then
  can_run_live_verify=0
fi

if [[ "$can_run_live_verify" -eq 1 ]]; then
mock_server_code="$(cat <<'PY'
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        ops_token = self.headers.get("x-omnyid-ops-token", "")
        auth_header = self.headers.get("Authorization", "")
        if self.path in ("/healthz", "/readyz") and ops_token != "ops-token-123" and auth_header != "Bearer ops-token-123":
            self._json({"error": "missing_ops_token"}, status=401)
        elif self.path == "/healthz":
            self._json({"status": "ok", "service": "omnyid-homeserver"})
        elif self.path == "/readyz":
            self._json({"status": "ready", "dependencies": {"database": "ok"}})
        elif self.path == "/api/v3.1/tools?limit=1":
            api_key = self.headers.get("x-api-key", "")
            if api_key == "valid-composio-key":
                self._json({"items": []})
            elif api_key == "rate-limited-composio-key":
                self._json({"error": "rate_limited"}, status=429)
            else:
                self._json({"error": "unauthorized"}, status=401)
        else:
            self.send_error(404)

    def do_HEAD(self):
        if self.path == "/workspace/":
            self.send_response(200)
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com")
            self.end_headers()
        else:
            self.send_error(404)

    def log_message(self, *_args):
        pass

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


HTTPServer(("127.0.0.1", 18765), Handler).serve_forever()
PY
)"

if [[ "$python_cmd" == "py -3" || "$python_cmd" == "py.exe -3" ]]; then
  read -r python_launcher python_flag <<<"$python_cmd"
  "$python_launcher" "$python_flag" -c "$mock_server_code" >"$SERVER_LOG" 2>&1 &
else
  "$python_cmd" -c "$mock_server_code" >"$SERVER_LOG" 2>&1 &
fi
SERVER_PID=$!
trap 'kill "$SERVER_PID" >/dev/null 2>&1 || true; rm -rf "$TMP_DIR"' EXIT

for _ in $(seq 1 20); do
  if curl -fsS -H "x-omnyid-ops-token: ops-token-123" "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS -H "x-omnyid-ops-token: ops-token-123" "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
  echo "[deployment-ops-selftest] mock server failed to start" >&2
  cat "$SERVER_LOG" >&2 || true
  exit 1
fi
fi

cat >"$TMP_DIR/good.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF

cat >"$TMP_DIR/bad.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url_default
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_ALLOW_INSECURE_UNSIGNED=true
OMNYID_ALLOW_PLAINTEXT_STORAGE=1
OMNYID_DELEGATION_MASTER_KEY_HEX=0000000000000000000000000000000000000000000000000000000000000000
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF

good_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/good.env")"
assert_contains "$good_output" "[startup-policy] production env validation passed"

printf '%s\n' 'ops-token-123' >"$TMP_DIR/secrets/ops_token"
cat >"$TMP_DIR/ops-token-good.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_PUBLIC_OPERATIONAL_ENDPOINTS=true
OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE=secrets/ops_token
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF
ops_token_good_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/ops-token-good.env")"
assert_contains "$ops_token_good_output" "production env validation passed"

cat >"$TMP_DIR/ops-token-plaintext.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_PUBLIC_OPERATIONAL_ENDPOINTS=true
OMNYID_OPERATIONAL_ENDPOINT_TOKEN=ops-token-123
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF
set +e
ops_token_plaintext_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/ops-token-plaintext.env" 2>&1)"
ops_token_plaintext_exit=$?
set -e
assert_exit_code 1 "$ops_token_plaintext_exit"
assert_contains "$ops_token_plaintext_output" "OMNYID_OPERATIONAL_ENDPOINT_TOKEN must be supplied via OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE in production"

set +e
bad_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/bad.env" 2>&1)"
bad_exit=$?
set -e
assert_exit_code 1 "$bad_exit"
assert_contains "$bad_output" "OMNYID_ALLOW_INSECURE_UNSIGNED must be false in production"
assert_contains "$bad_output" "DATABASE_URL must be set to a non-default production database"

cat >"$TMP_DIR/stripe-bad.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_STRIPE_SECRET_KEY=sk_live_123
OMNYID_STRIPE_PRO_PRICE_ID=price_123
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF

set +e
stripe_bad_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/stripe-bad.env" 2>&1)"
stripe_bad_exit=$?
set -e
assert_exit_code 1 "$stripe_bad_exit"
assert_contains "$stripe_bad_output" "OMNYID_STRIPE_WEBHOOK_SECRET must be set to a valid Stripe webhook secret"
assert_contains "$stripe_bad_output" "OMNYID_WORKSPACE_BASE_URL, OMNYID_UI_BASE_URL, or a derivable OMNYID_HOMESERVER_URL must be configured"

cat >"$TMP_DIR/stripe-good.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_STRIPE_SECRET_KEY=sk_live_123
OMNYID_STRIPE_WEBHOOK_SECRET=whsec_123
OMNYID_STRIPE_PRO_PRICE_ID=price_123
OMNYID_WORKSPACE_BASE_URL=https://app.omnyid.com
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF

stripe_good_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/stripe-good.env")"
assert_contains "$stripe_good_output" "[startup-policy] production env validation passed"

cat >"$TMP_DIR/simulator-bad.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_ENABLE_WATCHER_SIMULATOR=false
OMNYID_ENABLE_WATCHER_SIMULATOR_PROMOTION=true
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF

set +e
simulator_bad_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/simulator-bad.env" 2>&1)"
simulator_bad_exit=$?
set -e
assert_exit_code 1 "$simulator_bad_exit"
assert_contains "$simulator_bad_output" "Watcher simulator promotion cannot be enabled when the watcher simulator is disabled"

cat >"$TMP_DIR/file-secret-good.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF
file_secret_good_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/file-secret-good.env")"
assert_contains "$file_secret_good_output" "production env validation passed"

cat >"$TMP_DIR/file-secret-missing.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/missing_secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF
set +e
file_secret_missing_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/file-secret-missing.env" 2>&1)"
file_secret_missing_exit=$?
set -e
assert_exit_code 1 "$file_secret_missing_exit"
assert_contains "$file_secret_missing_output" "OMNYID_SESSION_SECRET_FILE points to a missing secret file"

: >"$TMP_DIR/secrets/blank_secret"
cat >"$TMP_DIR/file-secret-blank.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/blank_secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF
set +e
file_secret_blank_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/file-secret-blank.env" 2>&1)"
file_secret_blank_exit=$?
set -e
assert_exit_code 1 "$file_secret_blank_exit"
assert_contains "$file_secret_blank_output" "OMNYID_SESSION_SECRET_FILE points to a blank secret file"

cat >"$TMP_DIR/plaintext-secret.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET=plaintext-session-secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF
set +e
plaintext_secret_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/plaintext-secret.env" 2>&1)"
plaintext_secret_exit=$?
set -e
assert_exit_code 1 "$plaintext_secret_exit"
assert_contains "$plaintext_secret_output" "OMNYID_SESSION_SECRET must be supplied via OMNYID_SESSION_SECRET_FILE in production"

cat >"$TMP_DIR/plaintext-postgres.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD=plaintext-postgres-password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF
set +e
plaintext_postgres_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/plaintext-postgres.env" 2>&1)"
plaintext_postgres_exit=$?
set -e
assert_exit_code 1 "$plaintext_postgres_exit"
assert_contains "$plaintext_postgres_output" "POSTGRES_PASSWORD must be supplied via POSTGRES_PASSWORD_FILE in production"

cat >"$TMP_DIR/plaintext-database-url.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL=postgres://omnyid_prod:secret@db.internal:5432/omnyid_prod
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF
set +e
plaintext_database_url_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/plaintext-database-url.env" 2>&1)"
plaintext_database_url_exit=$?
set -e
assert_exit_code 1 "$plaintext_database_url_exit"
assert_contains "$plaintext_database_url_output" "DATABASE_URL must be supplied via DATABASE_URL_FILE in production"

cat >"$TMP_DIR/backup-dir-missing.env" <<'EOF'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
EOF
set +e
backup_dir_missing_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/backup-dir-missing.env" 2>&1)"
backup_dir_missing_exit=$?
set -e
assert_exit_code 1 "$backup_dir_missing_exit"
assert_contains "$backup_dir_missing_output" "OMNYID_BACKUP_DIR must be configured in production"

if [[ "$can_run_live_verify" -eq 1 ]]; then
  printf '%s\n' 'valid-composio-key' >"$TMP_DIR/secrets/composio_api_key"
  cat >"$TMP_DIR/composio-live-good.env" <<EOF
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
COMPOSIO_API_KEY_FILE=secrets/composio_api_key
OMNYID_VERIFY_COMPOSIO_LIVE=true
OMNYID_COMPOSIO_API_BASE_URL=http://127.0.0.1:${PORT}
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF
  composio_live_good_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/composio-live-good.env")"
  assert_contains "$composio_live_good_output" "production env validation passed"

  printf '%s\n' 'invalid-composio-key' >"$TMP_DIR/secrets/composio_api_key_bad"
  cat >"$TMP_DIR/composio-live-bad.env" <<EOF
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
COMPOSIO_API_KEY_FILE=secrets/composio_api_key_bad
OMNYID_VERIFY_COMPOSIO_LIVE=true
OMNYID_COMPOSIO_API_BASE_URL=http://127.0.0.1:${PORT}
OMNYID_BACKUP_DIR=/var/backups/omnyid
EOF
  set +e
  composio_live_bad_output="$(bash "$SCRIPT_DIR/startup-policy-check.sh" "$TMP_DIR/composio-live-bad.env" 2>&1)"
  composio_live_bad_exit=$?
  set -e
  assert_exit_code 1 "$composio_live_bad_exit"
  assert_contains "$composio_live_bad_output" "COMPOSIO_API_KEY was rejected by Composio during startup validation (HTTP 401)"
fi

if [[ "$can_run_live_verify" -eq 1 ]]; then
  verify_output="$(OMNYID_WORKSPACE_URL="http://127.0.0.1:${PORT}/workspace/" OMNYID_OPERATIONAL_ENDPOINT_TOKEN="ops-token-123" bash "$SCRIPT_DIR/verify-deployment.sh" "http://127.0.0.1:${PORT}")"
  assert_contains "$verify_output" "[verify-deployment] deployment verification passed"
else
  bash -n "$SCRIPT_DIR/verify-deployment.sh"
  echo "[deployment-ops-selftest] skipped live verify mock server on Windows-native Python launcher"
fi

restore_drill_output="$(bash "$SCRIPT_DIR/omnyid-restore-drill-selftest.sh")"
assert_contains "$restore_drill_output" "[omnyid-restore-drill-selftest] passed"

restore_output="$(bash "$SCRIPT_DIR/omnyid-restore-selftest.sh")"
assert_contains "$restore_output" "[omnyid-restore-selftest] passed"

echo "[deployment-ops-selftest] passed"

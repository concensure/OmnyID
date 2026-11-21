#!/usr/bin/env bash
# Read-only Wedding production synthetic. Credentials are supplied as files by systemd.
set -uo pipefail

BASE_URL="${OMNYID_WEDDING_MONITOR_BASE_URL:-https://omnyid.com}"
API_BASE_URL="${OMNYID_WEDDING_MONITOR_API_BASE_URL:-${BASE_URL%/}/api}"
EMAIL_FILE="${OMNYID_WEDDING_MONITOR_EMAIL_FILE:-}"
PASSWORD_FILE="${OMNYID_WEDDING_MONITOR_PASSWORD_FILE:-}"
OUTPUT_FILE="${OMNYID_WEDDING_MONITOR_OUTPUT_FILE:-/var/lib/omnyid-wedding-monitor/latest.json}"
TIMEOUT_SECONDS="${OMNYID_WEDDING_MONITOR_TIMEOUT_SECONDS:-20}"
USER_AGENT="OmnyID-Wedding-Monitor/1.0"

tmp_dir="$(mktemp -d)"
cookie_jar="$tmp_dir/cookies.txt"
login_json="$tmp_dir/login.json"
failures_file="$tmp_dir/failures.txt"
checks_file="$tmp_dir/checks.txt"
token=""

cleanup() {
  if [[ -n "$token" ]]; then
    curl --silent --show-error --max-time "$TIMEOUT_SECONDS" --request DELETE \
      --header "Authorization: Bearer $token" --cookie "$cookie_jar" \
      "$API_BASE_URL/auth/session" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$tmp_dir"
}
trap cleanup EXIT

record_check() {
  printf '%s|%s|%s\n' "$1" "$2" "$3" >>"$checks_file"
}

fail() {
  printf '%s\n' "$1" >>"$failures_file"
}

http_get() {
  local name="$1" url="$2" output="$3" headers="$4" auth="${5:-}"
  local args=(--silent --show-error --max-time "$TIMEOUT_SECONDS" --user-agent "$USER_AGENT" --output "$output" --dump-header "$headers" --write-out '%{http_code}')
  if [[ -n "$auth" ]]; then args+=(--header "Authorization: Bearer $auth" --cookie "$cookie_jar"); fi
  local status
  status="$(curl "${args[@]}" "$url" 2>"$tmp_dir/${name}.err")" || status="curl_failed"
  record_check "$name" "$status" "$url"
  if [[ "$status" != "200" ]]; then fail "$name returned $status"; return 1; fi
  return 0
}

if [[ ! -r "$EMAIL_FILE" || ! -r "$PASSWORD_FILE" ]]; then
  printf '%s\n' '{"status":"failed","failure":"monitor credential files are not readable"}' >&2
  exit 2
fi
email="$(tr -d '\r\n' <"$EMAIL_FILE")"
password="$(tr -d '\r\n' <"$PASSWORD_FILE")"
if [[ -z "$email" || -z "$password" ]]; then
  printf '%s\n' '{"status":"failed","failure":"monitor credentials are empty"}' >&2
  exit 2
fi

http_get "public_wedding" "${BASE_URL%/}/wedding/" "$tmp_dir/wedding.html" "$tmp_dir/wedding.headers" || true
if [[ -s "$tmp_dir/wedding.html" ]] && ! grep -Eqi 'wedding|OmnyID' "$tmp_dir/wedding.html"; then fail "public Wedding page marker is missing"; fi
http_get "workspace_shell" "${BASE_URL%/}/workspace/" "$tmp_dir/workspace.html" "$tmp_dir/workspace.headers" || true

login_payload="$(EMAIL="$email" PASSWORD="$password" python3 - <<'PY'
import json, os
print(json.dumps({"email": os.environ["EMAIL"], "password": os.environ["PASSWORD"]}))
PY
)"
login_status="$(curl --silent --show-error --max-time "$TIMEOUT_SECONDS" --user-agent "$USER_AGENT" \
  --request POST --header 'Content-Type: application/json' --data "$login_payload" \
  --cookie-jar "$cookie_jar" --output "$login_json" --write-out '%{http_code}' \
  "$API_BASE_URL/auth/login" 2>"$tmp_dir/login.err")" || login_status="curl_failed"
record_check "password_login" "$login_status" "$API_BASE_URL/auth/login"
if [[ "$login_status" != "200" ]]; then
  fail "password login returned $login_status"
else
  token="$(python3 - "$login_json" <<'PY'
import json, sys
try:
    value = json.load(open(sys.argv[1], encoding="utf-8"))
    print(value.get("token") or "")
except Exception:
    print("")
PY
)"
  if [[ -z "$token" ]]; then fail "password login returned no session token"; fi
fi
unset password login_payload

if [[ -n "$token" ]]; then
  http_get "auth_session" "$API_BASE_URL/auth/session" "$tmp_dir/session.json" "$tmp_dir/session.headers" "$token" || true
  http_get "workspace_bootstrap" "$API_BASE_URL/dashboard/bootstrap" "$tmp_dir/bootstrap.json" "$tmp_dir/bootstrap.headers" "$token" || true
  http_get "health" "${BASE_URL%/}/healthz" "$tmp_dir/health.json" "$tmp_dir/health.headers" "$token" || true
  http_get "readiness" "${BASE_URL%/}/readyz" "$tmp_dir/ready.json" "$tmp_dir/ready.headers" "$token" || true
  python3 - "$tmp_dir/session.json" "$tmp_dir/bootstrap.json" "$tmp_dir/health.json" "$tmp_dir/ready.json" "$failures_file" <<'PY'
import json, pathlib, sys
session_path, bootstrap_path, health_path, ready_path, failures_path = map(pathlib.Path, sys.argv[1:])
failures = []
def load(path, name):
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict): raise ValueError("not an object")
        return value
    except Exception as exc:
        failures.append(f"{name} JSON is invalid: {exc}")
        return {}
session = load(session_path, "auth session") if session_path.exists() else {}
bootstrap = load(bootstrap_path, "workspace bootstrap") if bootstrap_path.exists() else {}
health = load(health_path, "health") if health_path.exists() else {}
ready = load(ready_path, "readiness") if ready_path.exists() else {}
if not session.get("id") or not session.get("email"): failures.append("authenticated session identity is incomplete")
if not bootstrap: failures.append("workspace bootstrap is empty")
if health.get("status") != "ok": failures.append("health status is not ok")
if ready.get("status") != "ready": failures.append("readiness status is not ready")
dependencies = ready.get("dependencies") if isinstance(ready.get("dependencies"), dict) else {}
if dependencies.get("database") != "ok": failures.append("database readiness is not ok")
daemons = dependencies.get("daemons")
if daemons != "ok": failures.append("background daemon readiness is not ok")
if failures:
    with failures_path.open("a", encoding="utf-8") as handle:
        for failure in failures: handle.write(failure + "\n")
PY
fi

asset_url=""
if [[ -s "$tmp_dir/workspace.html" ]]; then
  asset_url="$(BASE_URL="$BASE_URL" python3 - "$tmp_dir/workspace.html" <<'PY'
from html.parser import HTMLParser
from urllib.parse import urljoin
import os, sys
class Parser(HTMLParser):
    def __init__(self): super().__init__(); self.src = ""
    def handle_starttag(self, tag, attrs):
        if self.src or tag != "script": return
        values = dict(attrs)
        src = values.get("src", "")
        if ".js" in src: self.src = src
parser = Parser(); parser.feed(open(sys.argv[1], encoding="utf-8").read())
print(urljoin(os.environ["BASE_URL"].rstrip("/") + "/workspace/", parser.src) if parser.src else "")
PY
)"
fi
if [[ -z "$asset_url" ]]; then
  fail "workspace shell did not reference a JavaScript asset"
else
  http_get "workspace_asset_cache" "$asset_url" "$tmp_dir/asset.js" "$tmp_dir/asset.headers" || true
fi

mkdir -p "$(dirname "$OUTPUT_FILE")"
python3 - "$checks_file" "$failures_file" "$OUTPUT_FILE" <<'PY'
import datetime, json, pathlib, sys
checks_path, failures_path, output_path = map(pathlib.Path, sys.argv[1:])
checks = []
if checks_path.exists():
    for line in checks_path.read_text(encoding="utf-8").splitlines():
        name, status, url = (line.split("|", 2) + ["", ""])[:3]
        checks.append({"name": name, "http_status": status, "url": url})
failures = failures_path.read_text(encoding="utf-8").splitlines() if failures_path.exists() else []
result = {
    "schema": "omnyid.wedding_monitor.v1",
    "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "status": "pass" if not failures else "fail",
    "read_only": True,
    "checks": checks,
    "failures": failures,
}
output_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, separators=(",", ":")))
sys.exit(0 if not failures else 1)
PY
status=$?

if [[ "$status" -ne 0 && -n "${OMNYID_WEDDING_MONITOR_ALERT_WEBHOOK_FILE:-}" && -r "${OMNYID_WEDDING_MONITOR_ALERT_WEBHOOK_FILE}" ]]; then
  webhook="$(tr -d '\r\n' <"$OMNYID_WEDDING_MONITOR_ALERT_WEBHOOK_FILE")"
  if [[ -n "$webhook" ]]; then
    curl --silent --show-error --max-time "$TIMEOUT_SECONDS" --request POST --header 'Content-Type: application/json' --data-binary "@$OUTPUT_FILE" "$webhook" >/dev/null 2>&1 || true
  fi
fi
exit "$status"

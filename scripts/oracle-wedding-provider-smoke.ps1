param(
    [string]$RemoteHost = "",
    [string]$User = "",
    [string]$KeyPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$configFile = Join-Path $PSScriptRoot "oracle-config.local.ps1"
if (Test-Path -LiteralPath $configFile) { . $configFile }
if (-not $RemoteHost) { $RemoteHost = $ORACLE_HOST }
if (-not $User) { $User = $ORACLE_USER }
if (-not $KeyPath) { $KeyPath = $ORACLE_KEY }

$remoteScript = @'
set -eu

status_for_json_error() {
  path="$1"
  python3 - "$path" <<'PY'
import json
import sys
try:
    data = json.load(open(sys.argv[1], "r", encoding="utf-8"))
    err = data.get("error") or {}
    print((err.get("status") or err.get("message") or "none")[:180])
except Exception:
    print("unreadable")
PY
}

brave_http="not-configured"
brave_reason="none"
places_http="not-configured"
places_reason="none"

if docker exec omnyid-homeserver-1 test -f /run/secrets/omnyid_brave_search_api_key; then
  brave_key=$(docker exec omnyid-homeserver-1 cat /run/secrets/omnyid_brave_search_api_key | tr -d '\r\n')
  set +e
  brave_http=$(curl -sS -o /tmp/omnyid-brave-smoke.json -w "%{http_code}" \
    -H "Accept: application/json" \
    -H "X-Subscription-Token: ${brave_key}" \
    "https://api.search.brave.com/res/v1/web/search?q=Sydney%20wedding%20venue&count=1" \
    2>/tmp/omnyid-brave-smoke.err)
  brave_exit=$?
  set -e
  if [ "$brave_exit" -ne 0 ]; then
    brave_http="curl_failed"
    brave_reason=$(head -c 180 /tmp/omnyid-brave-smoke.err 2>/dev/null || true)
  elif [ "$brave_http" != "200" ]; then
    brave_reason=$(status_for_json_error /tmp/omnyid-brave-smoke.json)
  fi
fi

if docker exec omnyid-homeserver-1 test -f /run/secrets/omnyid_google_places_api_key; then
  places_key=$(docker exec omnyid-homeserver-1 cat /run/secrets/omnyid_google_places_api_key | tr -d '\r\n')
  set +e
  places_http=$(curl -sS -o /tmp/omnyid-places-smoke.json -w "%{http_code}" \
    -X POST "https://places.googleapis.com/v1/places:searchText" \
    -H "Content-Type: application/json" \
    -H "X-Goog-Api-Key: ${places_key}" \
    -H "X-Goog-FieldMask: places.id,places.displayName" \
    --data '{"textQuery":"Sydney wedding venue","maxResultCount":1}' \
    2>/tmp/omnyid-places-smoke.err)
  places_exit=$?
  set -e
  if [ "$places_exit" -ne 0 ]; then
    places_http="curl_failed"
    places_reason=$(head -c 180 /tmp/omnyid-places-smoke.err 2>/dev/null || true)
  elif [ "$places_http" != "200" ]; then
    places_reason=$(status_for_json_error /tmp/omnyid-places-smoke.json)
  fi
fi

printf 'brave_http=%s\n' "$brave_http"
printf 'brave_reason=%s\n' "$brave_reason"
printf 'google_places_http=%s\n' "$places_http"
printf 'google_places_reason=%s\n' "$places_reason"
rm -f /tmp/omnyid-brave-smoke.json /tmp/omnyid-brave-smoke.err /tmp/omnyid-places-smoke.json /tmp/omnyid-places-smoke.err
'@

$remoteScript = $remoteScript -replace "`r`n", "`n"
$remoteScript | & $env:SystemRoot\System32\OpenSSH\ssh.exe -i $KeyPath -o StrictHostKeyChecking=accept-new "$User@$RemoteHost" "bash -s"

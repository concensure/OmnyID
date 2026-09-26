#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${OMNYID_BASE_URL:-http://127.0.0.1:8080}}"
WORKSPACE_URL="${OMNYID_WORKSPACE_URL:-}"
EXPECTED_CSP_FRAGMENT="${OMNYID_WORKSPACE_CSP_FRAGMENT:-https://static.cloudflareinsights.com}"
OPS_TOKEN="${OMNYID_OPERATIONAL_ENDPOINT_TOKEN:-${OMNYID_VERIFY_DEPLOYMENT_OPS_TOKEN:-}}"
OPS_BEARER_TOKEN="${OMNYID_VERIFY_DEPLOYMENT_BEARER_TOKEN:-}"

read_secret_file_value() {
  local path="${1:-}"
  [[ -n "$path" && -f "$path" ]] || return 1
  local content
  if ! content="$(<"$path")"; then
    return 1
  fi
  content="${content%$'\r'}"
  content="${content%"${content##*[![:space:]]}"}"
  content="${content#"${content%%[![:space:]]*}"}"
  [[ -n "$content" ]] || return 1
  printf '%s' "$content"
}

if [[ -z "$OPS_TOKEN" && -n "${OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE:-}" ]]; then
  OPS_TOKEN="$(read_secret_file_value "${OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE}")" || OPS_TOKEN=""
fi

curl_auth_args=()
if [[ -n "$OPS_TOKEN" ]]; then
  curl_auth_args+=(-H "x-omnyid-ops-token: ${OPS_TOKEN}")
fi
if [[ -n "$OPS_BEARER_TOKEN" ]]; then
  curl_auth_args+=(-H "Authorization: Bearer ${OPS_BEARER_TOKEN}")
fi

fetch_json() {
  local url="$1"
  curl -fsS --max-time 15 "${curl_auth_args[@]}" "$url"
}

fetch_headers() {
  local url="$1"
  curl -fsS -I --max-time 15 "$url"
}

health_payload="$(fetch_json "${BASE_URL%/}/healthz")"
ready_payload="$(fetch_json "${BASE_URL%/}/readyz")"

printf '%s\n' "[verify-deployment] healthz payload: $health_payload"
printf '%s\n' "[verify-deployment] readyz payload: $ready_payload"

printf '%s' "$health_payload" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"' || {
  echo "[verify-deployment] healthz did not report status=ok" >&2
  exit 1
}

printf '%s' "$ready_payload" | grep -q '"status"[[:space:]]*:[[:space:]]*"ready"' || {
  echo "[verify-deployment] readyz did not report status=ready" >&2
  exit 1
}

if [[ -n "$WORKSPACE_URL" ]]; then
  workspace_headers="$(fetch_headers "$WORKSPACE_URL")"
  printf '%s\n' "[verify-deployment] workspace headers:"
  printf '%s\n' "$workspace_headers"

  printf '%s' "$workspace_headers" | grep -qi '^www-authenticate: basic' && {
    echo "[verify-deployment] workspace route is still behind Basic auth" >&2
    exit 1
  }

  if [[ -n "$EXPECTED_CSP_FRAGMENT" ]]; then
    printf '%s' "$workspace_headers" | grep -qi "^content-security-policy: .*${EXPECTED_CSP_FRAGMENT}" || {
      echo "[verify-deployment] workspace CSP is missing expected fragment: ${EXPECTED_CSP_FRAGMENT}" >&2
      exit 1
    }
  fi
fi

echo "[verify-deployment] deployment verification passed"

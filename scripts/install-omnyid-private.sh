#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-local}"
WORKSPACE_NAME="${OMNYID_WORKSPACE_NAME:-My Private Assistant}"
OWNER_EMAIL="${OMNYID_OWNER_EMAIL:-you@example.com}"
REGION="${OMNYID_REGION:-}"
OUTPUT_ROOT="${OMNYID_OUTPUT_ROOT:-$HOME/Documents/OmnyID}"
LAUNCH_LOCAL="${OMNYID_LAUNCH_LOCAL:-false}"
ESTIMATED_TRANSFER_MB=1200

case "$MODE" in
  local) ESTIMATED_TRANSFER_MB=2200 ;;
  oracle|upcloud|ovhcloud|byoc) ESTIMATED_TRANSFER_MB=900 ;;
esac

case "$MODE" in
  local|oracle|upcloud|ovhcloud|byoc) ;;
  *)
    echo "Unsupported mode: $MODE"
    echo "Use one of: local, oracle, upcloud, ovhcloud, byoc"
    exit 1
    ;;
esac

read_value() {
  local prompt="$1"
  local default_value="${2:-}"
  local value
  if [[ -n "$default_value" ]]; then
    read -r -p "$prompt [$default_value]: " value
  else
    read -r -p "$prompt: " value
  fi
  if [[ -z "${value// }" ]]; then
    printf '%s\n' "$default_value"
  else
    printf '%s\n' "$value"
  fi
}

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

write_file() {
  local path="$1"
  shift
  printf '%s\n' "$@" > "$path"
}

command_available() {
  command -v "$1" >/dev/null 2>&1
}

rough_bandwidth_mbps() {
  if ! command_available curl; then
    return 1
  fi
  local url="https://speed.cloudflare.com/__down?bytes=5000000"
  local temp_file
  temp_file="$(mktemp)"
  local start end bytes seconds mbps
  start="$(python3 - <<'PY'
import time
print(time.time())
PY
)"
  if ! curl -L --fail --silent --show-error "$url" -o "$temp_file"; then
    rm -f "$temp_file"
    return 1
  fi
  end="$(python3 - <<'PY'
import time
print(time.time())
PY
)"
  bytes="$(wc -c < "$temp_file" | tr -d ' ')"
  rm -f "$temp_file"
  seconds="$(python3 - <<PY
start = float("$start")
end = float("$end")
print(max(end - start, 0.001))
PY
)"
  mbps="$(python3 - <<PY
bytes_value = float("$bytes")
seconds_value = float("$seconds")
print(round(((bytes_value * 8) / 1000000.0) / seconds_value, 1))
PY
)"
  printf '%s\n' "$mbps"
}

preflight_json() {
  local path="$1"
  local docker_available="false"
  local cargo_available="false"
  local cpu_count="unknown"
  local memory_gb="unknown"
  local free_disk_gb="unknown"
  local bandwidth="null"
  local estimated_download_minutes="8"
  local base_minutes="8"

  if command_available docker; then docker_available="true"; fi
  if command_available cargo; then cargo_available="true"; fi
  if command_available nproc; then
    cpu_count="$(nproc)"
  else
    cpu_count="$(sysctl -n hw.ncpu 2>/dev/null || printf 'unknown')"
  fi
  if command_available free; then
    memory_gb="$(free -g | awk '/Mem:/ {print $2}')"
  else
    memory_gb="$(python3 - <<'PY'
import subprocess
try:
    value = subprocess.check_output(["sysctl", "-n", "hw.memsize"]).decode().strip()
    print(round(int(value) / (1024 ** 3), 1))
except Exception:
    print("unknown")
PY
)"
  fi
  free_disk_gb="$(python3 - <<PY
import os
st = os.statvfs("$OUTPUT_ROOT")
print(round((st.f_bavail * st.f_frsize) / (1024 ** 3), 1))
PY
)"

  if bandwidth_value="$(rough_bandwidth_mbps 2>/dev/null)"; then
    bandwidth="$bandwidth_value"
    estimated_download_minutes="$(python3 - <<PY
transfer_mb = float("$ESTIMATED_TRANSFER_MB")
bandwidth = max(float("$bandwidth_value"), 0.1)
import math
print(int(math.ceil(((transfer_mb * 8) / bandwidth) / 60)))
PY
)"
  else
    if [[ "$MODE" == "local" && "$docker_available" == "false" ]]; then
      estimated_download_minutes="18"
    elif [[ "$MODE" == "local" ]]; then
      estimated_download_minutes="8"
    else
      estimated_download_minutes="6"
    fi
  fi

  case "$MODE" in
    local) [[ "$docker_available" == "true" ]] && base_minutes="4" || base_minutes="15" ;;
    *) base_minutes="10" ;;
  esac

  python3 - <<PY > "$path"
import json
mode = "$MODE"
docker_available = "$docker_available" == "true"
cargo_available = "$cargo_available" == "true"
estimated_download_minutes = int("$estimated_download_minutes")
base_minutes = int("$base_minutes")
total = estimated_download_minutes + base_minutes
recommendations = []
if not docker_available:
    recommendations.append("Install Docker Desktop, Colima, or OrbStack before local launch.")
if not cargo_available:
    recommendations.append("Install Rust 1.94.0 or run the installer from an OmnyID bundle host that already has cargo.")
try:
    memory = float("$memory_gb")
    if memory < 8:
        recommendations.append("8 GB RAM or more is recommended for local OpenClaw and CrewAI development.")
except Exception:
    pass
try:
    disk = float("$free_disk_gb")
    if disk < 20:
        recommendations.append("Free at least 20 GB of disk for Docker layers, runtime logs, and local workspace data.")
except Exception:
    pass
payload = {
    "installer_platform": "macos_or_linux",
    "deployment_mode": mode,
    "cpu_logical_cores": "$cpu_count",
    "memory_gb": "$memory_gb",
    "free_disk_gb": "$free_disk_gb",
    "docker_available": docker_available,
    "cargo_available": cargo_available,
    "rough_bandwidth_mbps": None if "$bandwidth" == "null" else "$bandwidth",
    "estimate": {
        "approximate_transfer_mb": int("$ESTIMATED_TRANSFER_MB"),
        "estimated_download_minutes": estimated_download_minutes,
        "estimated_total_minutes": total,
        "summary": (
            f"Local private install usually takes about {total} minutes depending on Docker readiness and bandwidth."
            if mode == "local"
            else f"Private cloud preparation usually takes about {total} minutes once credentials and provisioning are ready."
        ),
    },
    "recommendations": recommendations,
}
print(json.dumps(payload, indent=2))
PY
}

if [[ "$WORKSPACE_NAME" == "My Private Assistant" ]]; then
  WORKSPACE_NAME="$(read_value "Workspace name" "My Private Assistant")"
fi
if [[ "$OWNER_EMAIL" == "you@example.com" ]]; then
  OWNER_EMAIL="$(read_value "Owner email" "you@example.com")"
fi
if [[ -z "$REGION" ]]; then
  case "$MODE" in
    oracle) REGION="ap-sydney-1" ;;
    upcloud) REGION="au-syd1" ;;
    ovhcloud) REGION="syd" ;;
    byoc) REGION="customer-choice" ;;
    *) REGION="local-device" ;;
  esac
  REGION="$(read_value "Preferred region" "$REGION")"
fi

SLUG="$(slugify "$WORKSPACE_NAME")"
if [[ -z "$SLUG" ]]; then
  SLUG="omnyid-user"
fi

case "$MODE" in
  local) DOMAIN="$SLUG.local.omnyid" ;;
  oracle) DOMAIN="$SLUG.cloud.omnyid.com" ;;
  upcloud) DOMAIN="$SLUG.upcloud.omnyid.com" ;;
  ovhcloud) DOMAIN="$SLUG.ovh.omnyid.com" ;;
  *) DOMAIN="$SLUG.private.omnyid.com" ;;
esac

AGENT_ID="agent:$SLUG@$DOMAIN"
GATEWAY_AGENT_ID="agent:gateway-$SLUG@$DOMAIN"
BUNDLE_PATH="$OUTPUT_ROOT/$SLUG"
mkdir -p "$BUNDLE_PATH"
PREFLIGHT_PATH="$BUNDLE_PATH/preflight.json"
preflight_json "$PREFLIGHT_PATH"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYS_JSON="$(cd "$PROJECT_ROOT" && cargo run --quiet --bin omnyid_keys -- --format json)"

if [[ -z "$KEYS_JSON" ]]; then
  echo "Unable to generate OmnyID keys. Install Rust 1.94.0 and rerun this installer."
  exit 1
fi

extract_json_value() {
  local key="$1"
  python3 - "$key" <<'PY' <<<"$KEYS_JSON"
import json, sys
payload = json.loads(sys.stdin.read())
print(payload[sys.argv[1]])
PY
}

OMNYID_PUBLIC_KEY_HEX="$(extract_json_value OMNYID_PUBLIC_KEY_HEX)"
OMNYID_SIGNING_KEY_HEX="$(extract_json_value OMNYID_SIGNING_KEY_HEX)"
OMNYID_ENCRYPTION_KEY_HEX="$(extract_json_value OMNYID_ENCRYPTION_KEY_HEX)"

case "$MODE" in
  local) HOMESERVER_URL="http://127.0.0.1:8080" ;;
  *) HOMESERVER_URL="https://api.omnyid.com" ;;
esac
case "$MODE" in
  local) AFP_DELEGATION="127.0.0.1:8080" ;;
  *) AFP_DELEGATION="api.omnyid.com:443" ;;
esac

if [[ "$MODE" == "local" ]]; then
  PRIVACY_MODE="local_private"
  RUNTIME_ROOT="$BUNDLE_PATH/runtime-data"
elif [[ "$MODE" == "byoc" ]]; then
  PRIVACY_MODE="private_hosted"
  RUNTIME_ROOT="/srv/omnyid/$SLUG"
else
  PRIVACY_MODE="managed_private"
  RUNTIME_ROOT="/srv/omnyid/$SLUG"
fi

SEAWEEDFS_ROOT_PASSWORD="$(openssl rand -hex 18)"
TENANT_KEY_REF="omnyid/$SLUG/data-key"

write_file "$BUNDLE_PATH/.env.private" \
  "# OmnyID private install bundle" \
  "OMNYID_WORKSPACE_NAME=$WORKSPACE_NAME" \
  "OMNYID_PRIVACY_MODE=$PRIVACY_MODE" \
  "OMNYID_DEPLOYMENT_MODE=$MODE" \
  "OMNYID_REGION=$REGION" \
  "OMNYID_DOMAIN=$DOMAIN" \
  "OMNYID_HOMESERVER_URL=$HOMESERVER_URL" \
  "OMNYID_AFP_DELEGATION=$AFP_DELEGATION" \
  "OMNYID_AGENT_ID=$AGENT_ID" \
  "OMNYID_GATEWAY_AGENT_ID=$GATEWAY_AGENT_ID" \
  "OMNYID_EMAIL_ADDRESS=$OWNER_EMAIL" \
  "FROM_ADDRESS=$OWNER_EMAIL" \
  "OMNYID_PUBLIC_KEY_HEX=$OMNYID_PUBLIC_KEY_HEX" \
  "OMNYID_SIGNING_KEY_HEX=$OMNYID_SIGNING_KEY_HEX" \
  "OMNYID_ENCRYPTION_KEY_HEX=$OMNYID_ENCRYPTION_KEY_HEX" \
  "OMNYID_ENCRYPT_BY_DEFAULT=true" \
  "OMNYID_REQUIRE_ENCRYPTION=true" \
  "OMNYID_ALLOW_INSECURE_UNSIGNED=false" \
  "OMNYID_ALLOW_PLAINTEXT_STORAGE=false" \
  "OMNYID_ENABLE_INTERNAL_GRPC=false" \
  "OMNYID_ENABLE_SERVER_SUMMARIZATION=false" \
  "OMNYID_RUNTIME_ROOT=$RUNTIME_ROOT" \
  "OMNYID_TENANT_KEY_REF=$TENANT_KEY_REF" \
  "OMNYID_SUPPORT_ACCESS=disabled_by_default" \
  "SEAWEEDFS_ROOT_USER=omnyid_$SLUG" \
  "SEAWEEDFS_ROOT_PASSWORD=$SEAWEEDFS_ROOT_PASSWORD" \
  "OMNYID_MAIL_PROVIDER=optional_human_inbox_bridge" \
  "OMNYID_GMAIL_CLIENT_ID=__OPTIONAL__" \
  "OMNYID_GMAIL_CLIENT_SECRET=__OPTIONAL__" \
  "OMNYID_GMAIL_REFRESH_TOKEN=__OPTIONAL__" \
  "SMTP_HOST=__OPTIONAL__" \
  "SMTP_USER=__OPTIONAL__" \
  "SMTP_PASS=__OPTIONAL__" \
  "OMNYID_WEBTRANSPORT_CERT_PATH=__SET_IF_HOSTED__" \
  "OMNYID_WEBTRANSPORT_KEY_PATH=__SET_IF_HOSTED__"

python3 - <<'PY' "$BUNDLE_PATH/tenant.json" "$WORKSPACE_NAME" "$OWNER_EMAIL" "$MODE" "$PRIVACY_MODE" "$REGION" "$AGENT_ID" "$GATEWAY_AGENT_ID" "$HOMESERVER_URL" "$AFP_DELEGATION" "$TENANT_KEY_REF"
import json, sys
path, workspace_name, owner_email, mode, privacy_mode, region, agent_id, gateway_agent_id, homeserver_url, afp_delegation, tenant_key_ref = sys.argv[1:]
provider_notes = {
    "oracle": "Use Oracle Cloud VM APIs or Terraform/OpenTofu later to provision a dedicated tenant host or microVM.",
    "upcloud": "Use UpCloud API/Terraform to provision a dedicated tenant VM with encrypted volume.",
    "ovhcloud": "Use OVHcloud APIs/Terraform to provision a dedicated tenant VM with encrypted volume.",
    "byoc": "Best privacy path: provision inside the customer's own cloud account so OmnyID stays a control plane.",
    "local": "Strongest privacy story for non-technical users who want to keep data on their own machine.",
}
payload = {
    "workspace_name": workspace_name,
    "owner_email": owner_email,
    "deployment_mode": mode,
    "privacy_mode": privacy_mode,
    "region": region,
    "agent_id": agent_id,
    "gateway_agent_id": gateway_agent_id,
    "homeserver_url": homeserver_url,
    "afp_delegation": afp_delegation,
    "tenant_key_reference": tenant_key_ref,
    "isolation": {
        "runtime": "one customer, one isolated runtime",
        "storage": "one customer, one isolated storage volume",
        "secrets": "one customer, one isolated secret set",
        "auth": "one customer, one isolated auth boundary",
    },
    "support_access": {
        "default": "disabled",
        "break_glass": "time-limited and consent-based",
    },
    "provider_notes": provider_notes.get(mode, provider_notes["byoc"]),
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
PY

write_file "$BUNDLE_PATH/cloud-init.yaml" \
  "#cloud-config" \
  "package_update: true" \
  "packages:" \
  "  - docker.io" \
  "  - docker-compose-v2" \
  "  - cryptsetup" \
  "  - jq" \
  "runcmd:" \
  "  - mkdir -p /srv/omnyid/$SLUG" \
  "  - mkdir -p /srv/omnyid/$SLUG/runtime" \
  "  - mkdir -p /srv/omnyid/$SLUG/secrets" \
  "  - echo 'Mount an encrypted tenant volume here before placing runtime data.' > /srv/omnyid/$SLUG/README_PRIVACY.txt" \
  "  - echo 'Customer-managed keys or KMS-backed envelope encryption should be wired before production launch.' >> /srv/omnyid/$SLUG/README_PRIVACY.txt"

write_file "$BUNDLE_PATH/README.md" \
  "# OmnyID Private Install Bundle" \
  "" \
  "This bundle is designed to keep the website as a control plane and the user runtime as a separate private data plane." \
  "" \
  "## Platform note" \
  "- This shell installer is for macOS and Linux." \
  "- For Windows, use scripts/install-omnyid-private.ps1." \
  "- Local OpenClaw and CrewAI setup differs by OS, so OmnyID keeps separate installers instead of pretending one path fits everything." \
  "" \
  "## What was prepared" \
  "- One Agent ID: $AGENT_ID" \
  "- One isolated gateway ID: $GATEWAY_AGENT_ID" \
  "- One private env file: .env.private" \
  "- One tenant manifest: tenant.json" \
  "- One cloud-init bootstrap template: cloud-init.yaml" \
  "- One environment preflight report: preflight.json" \
  "" \
  "## Recommended privacy ladder" \
  "1. Local Private" \
  "   Best privacy for individuals. OmnyID helps install locally and the data stays on the user's machine." \
  "2. BYOC Private Cloud" \
  "   Best hosted privacy balance. OmnyID provisions into the customer's own Oracle, UpCloud, or OVHcloud account." \
  "3. Managed Private" \
  "   Easiest for non-technical users, but OmnyID still hosts the compute. Use only with explicit privacy disclosures." \
  "" \
  "## What to promise users" \
  "- Dedicated isolated runtime" \
  "- Dedicated isolated storage" \
  "- Dedicated isolated secrets" \
  "- Support access disabled by default" \
  "" \
  "## Estimated install time" \
  "$(python3 - <<'PY' "$PREFLIGHT_PATH"
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    payload = json.load(handle)
print(payload['estimate']['summary'])
PY
)" \
  "" \
  "## Local start command" \
  "docker compose --env-file \"$BUNDLE_PATH/.env.private\" -f \"$PROJECT_ROOT/docker-compose.yml\" up -d --build"

if [[ "$LAUNCH_LOCAL" == "true" && "$MODE" == "local" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker was not found. Install Docker Desktop, Colima, or OrbStack first, then rerun with OMNYID_LAUNCH_LOCAL=true."
    exit 1
  fi
  (cd "$PROJECT_ROOT" && docker compose --env-file "$BUNDLE_PATH/.env.private" -f "$PROJECT_ROOT/docker-compose.yml" up -d --build)
fi

echo
echo "OmnyID private install bundle created:"
echo "  $BUNDLE_PATH"
echo
echo "Preflight summary:"
python3 - <<'PY' "$PREFLIGHT_PATH"
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    payload = json.load(handle)
print("  " + payload["estimate"]["summary"])
if payload.get("rough_bandwidth_mbps") is not None:
    print(f"  Rough bandwidth: {payload['rough_bandwidth_mbps']} Mbps")
for item in payload.get("recommendations", []):
    print(f"    - {item}")
PY
echo
echo "Core privacy recommendation:"
echo "  Lead with Local Private and BYOC Private Cloud."
echo "  Treat hosted OmnyID as a control plane, not as a shared customer runtime."

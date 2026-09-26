#!/usr/bin/env bash
set -euo pipefail

env_file="${1:-}"
require_production="${2:-false}"

declare -A file_env=()
env_file_root=""

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

strip_matching_quotes() {
  local value="$1"
  if [[ ${#value} -ge 2 ]]; then
    local first="${value:0:1}"
    local last="${value: -1}"
    if [[ ( "$first" == '"' && "$last" == '"' ) || ( "$first" == "'" && "$last" == "'" ) ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf '%s' "$value"
}

load_env_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "[startup-policy] env file not found: $path" >&2
    exit 2
  fi
  env_file_root="$(cd "$(dirname "$path")" && pwd)"
  while IFS= read -r line || [[ -n "$line" ]]; do
    local trimmed
    trimmed="$(trim "$line")"
    if [[ -z "$trimmed" || "${trimmed:0:1}" == "#" ]]; then
      continue
    fi
    if [[ ! "$trimmed" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      continue
    fi
    local key="${trimmed%%=*}"
    local value="${trimmed#*=}"
    value="$(trim "$value")"
    value="$(strip_matching_quotes "$value")"
    file_env["$key"]="$value"
  done < "$path"
}

get_env_value() {
  local key="$1"
  if [[ -v "file_env[$key]" ]]; then
    printf '%s' "${file_env[$key]}"
  else
    printf '%s' "${!key-}"
  fi
}

get_secret_env_value() {
  local key="$1"
  local direct
  direct="$(trim "$(get_env_value "$key")")"
  if [[ -n "$direct" ]]; then
    printf '%s' "$direct"
    return 0
  fi
  local file_value resolved_path content
  file_value="$(trim "$(get_env_value "${key}_FILE")")"
  if [[ -z "$file_value" ]]; then
    return 0
  fi
  resolved_path="$(resolve_env_relative_path "$file_value")"
  if [[ -z "$resolved_path" || ! -f "$resolved_path" ]]; then
    return 0
  fi
  if ! content="$(<"$resolved_path")"; then
    return 0
  fi
  printf '%s' "$(trim "$content")"
}

resolve_env_relative_path() {
  local path
  path="$(trim "${1:-}")"
  if [[ -z "$path" ]]; then
    return 0
  fi
  if [[ "$path" = /* || "$path" =~ ^[A-Za-z]:[\\/].* || -z "$env_file_root" ]]; then
    printf '%s' "$path"
    return 0
  fi
  (
    cd "$env_file_root"
    if [[ "$path" == */* ]]; then
      local rel_dir rel_base abs_dir
      rel_dir="${path%/*}"
      rel_base="${path##*/}"
      abs_dir="$(cd "$rel_dir" 2>/dev/null && pwd -P)" || exit 1
      printf '%s/%s' "$abs_dir" "$rel_base"
    else
      printf '%s/%s' "$(pwd -P)" "$path"
    fi
  )
}

secret_presence_violation() {
  local key="$1"
  local direct file_value resolved_path content
  direct="$(trim "$(get_env_value "$key")")"
  if [[ -n "$direct" ]]; then
    return 1
  fi
  file_value="$(trim "$(get_env_value "${key}_FILE")")"
  if [[ -z "$file_value" ]]; then
    printf '%s' "$key or ${key}_FILE must be configured in production"
    return 0
  fi
  resolved_path="$(resolve_env_relative_path "$file_value")"
  if [[ -z "$resolved_path" || ! -f "$resolved_path" ]]; then
    printf '%s' "${key}_FILE points to a missing secret file: $file_value"
    return 0
  fi
  if ! content="$(<"$resolved_path")"; then
    printf '%s' "${key}_FILE could not be read: $file_value"
    return 0
  fi
  if [[ -z "$(trim "$content")" ]]; then
    printf '%s' "${key}_FILE points to a blank secret file: $file_value"
    return 0
  fi
  return 1
}

secret_must_be_file_backed_violation() {
  local key="$1"
  local direct file_value resolved_path content
  direct="$(trim "$(get_env_value "$key")")"
  if [[ -z "$direct" ]]; then
    return 1
  fi
  file_value="$(trim "$(get_env_value "${key}_FILE")")"
  if [[ -z "$file_value" ]]; then
    printf '%s' "$key must be supplied via ${key}_FILE in production; plaintext env values are not allowed"
    return 0
  fi
  resolved_path="$(resolve_env_relative_path "$file_value")"
  if [[ -z "$resolved_path" || ! -f "$resolved_path" ]]; then
    printf '%s' "${key}_FILE points to a missing secret file: $file_value"
    return 0
  fi
  if ! content="$(<"$resolved_path")"; then
    printf '%s' "${key}_FILE could not be read: $file_value"
    return 0
  fi
  if [[ -z "$(trim "$content")" ]]; then
    printf '%s' "${key}_FILE points to a blank secret file: $file_value"
    return 0
  fi
  return 1
}

is_truthy() {
  local value
  value="$(trim "${1:-}")"
  value="${value,,}"
  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]
}

is_falsy() {
  local value
  value="$(trim "${1:-}")"
  value="${value,,}"
  [[ "$value" == "0" || "$value" == "false" || "$value" == "no" || "$value" == "off" ]]
}

bool_like() {
  local value
  value="$(trim "${1:-}")"
  [[ -z "$value" ]] && return 0
  is_truthy "$value" || is_falsy "$value"
}

verify_composio_live_violation() {
  local should_verify api_key base_url timeout_secs probe_url http_status curl_exit
  should_verify="$(get_env_value OMNYID_VERIFY_COMPOSIO_LIVE)"
  if ! is_truthy "$should_verify"; then
    return 1
  fi

  api_key="$(trim "$(get_secret_env_value COMPOSIO_API_KEY)")"
  if [[ -z "$api_key" ]]; then
    printf '%s' "OMNYID_VERIFY_COMPOSIO_LIVE is enabled, but COMPOSIO_API_KEY is not configured"
    return 0
  fi

  base_url="$(trim "$(get_env_value OMNYID_COMPOSIO_API_BASE_URL)")"
  if [[ -z "$base_url" ]]; then
    base_url="https://backend.composio.dev"
  fi
  base_url="${base_url%/}"

  timeout_secs="$(trim "$(get_env_value OMNYID_COMPOSIO_VERIFY_TIMEOUT_SECS)")"
  if [[ ! "$timeout_secs" =~ ^[0-9]+$ || "$timeout_secs" -le 0 ]]; then
    timeout_secs=15
  fi

  probe_url="${base_url}/api/v3.1/tools?limit=1"
  http_status="$(
    curl \
      -sS \
      -o /dev/null \
      -w '%{http_code}' \
      --connect-timeout "$timeout_secs" \
      --max-time "$timeout_secs" \
      -H "x-api-key: ${api_key}" \
      -H 'accept: application/json' \
      "$probe_url"
  )"
  curl_exit=$?
  if [[ $curl_exit -ne 0 ]]; then
    printf '%s' "Could not reach Composio during startup validation (${probe_url})"
    return 0
  fi

  case "$http_status" in
    2*|3*)
      return 1
      ;;
    401|403)
      printf '%s' "COMPOSIO_API_KEY was rejected by Composio during startup validation (HTTP ${http_status})"
      return 0
      ;;
    429)
      printf '%s' "Composio rate limited startup validation (HTTP 429)"
      return 0
      ;;
    5*)
      printf '%s' "Composio upstream error during startup validation (HTTP ${http_status})"
      return 0
      ;;
    *)
      printf '%s' "Composio startup validation failed with HTTP ${http_status}"
      return 0
      ;;
  esac
}

startup_environment_label() {
  local key value
  for key in OMNYID_ENV APP_ENV ENVIRONMENT RUST_ENV NODE_ENV; do
    value="$(trim "$(get_env_value "$key")")"
    if [[ -n "$value" ]]; then
      printf '%s' "${value,,}"
      return 0
    fi
  done
  return 1
}

database_url_looks_like_dev_default() {
  local value
  value="$(trim "$1")"
  [[ -z "$value" || "$value" == "postgres://afp:afp@postgres:5432/afp" || "$value" == "postgres://afp:afp@localhost:5432/afp" || "$value" == "postgresql://afp:afp@postgres:5432/afp" || "$value" == "postgresql://afp:afp@localhost:5432/afp" ]]
}

env_var_present() {
  local value
  value="$(trim "$(get_env_value "$1")")"
  [[ -n "$value" ]]
}

secret_present() {
  local value
  value="$(trim "$(get_secret_env_value "$1")")"
  [[ -n "$value" ]]
}

stripe_secret_key_looks_valid() {
  local value
  value="$(trim "$1")"
  [[ ( "$value" == sk_live_* || "$value" == sk_test_* ) && ${#value} -gt 8 ]]
}

stripe_webhook_secret_looks_valid() {
  local value
  value="$(trim "$1")"
  [[ "$value" == whsec_* && ${#value} -gt 6 ]]
}

stripe_price_id_looks_valid() {
  local value
  value="$(trim "$1")"
  [[ "$value" == price_* && ${#value} -gt 6 ]]
}

stripe_production_config_present() {
  local key
  for key in \
    OMNYID_STRIPE_SECRET_KEY \
    OMNYID_STRIPE_WEBHOOK_SECRET \
    OMNYID_STRIPE_PRO_PRICE_ID \
    OMNYID_STRIPE_CHECKOUT_PRICE_ID \
    OMNYID_STRIPE_TEAM_PRICE_ID \
    OMNYID_WORKSPACE_BASE_URL \
    OMNYID_UI_BASE_URL; do
    if env_var_present "$key"; then
      return 0
    fi
  done
  return 1
}

billing_workspace_base_url_is_configured() {
  local workspace_base ui_base homeserver_url host derived_host
  workspace_base="$(trim "$(get_env_value OMNYID_WORKSPACE_BASE_URL)")"
  [[ -n "$workspace_base" ]] && return 0
  ui_base="$(trim "$(get_env_value OMNYID_UI_BASE_URL)")"
  [[ -n "$ui_base" ]] && return 0
  homeserver_url="$(trim "$(get_env_value OMNYID_HOMESERVER_URL)")"
  [[ -z "$homeserver_url" ]] && return 1
  if [[ "$homeserver_url" =~ ^https?://([^/]+) ]]; then
    host="${BASH_REMATCH[1]}"
    derived_host="${host#api.}"
    [[ -n "$derived_host" ]] && return 0
  fi
  return 1
}

absolute_like_path() {
  local value
  value="$(trim "$1")"
  [[ -n "$value" ]] || return 1
  [[ "$value" = /* || "$value" =~ ^[A-Za-z]:[\\/].* ]]
}

validate_delegation_key() {
  local key
  key="$(trim "$1")"
  if [[ -z "$key" ]]; then
    echo "OMNYID_DELEGATION_MASTER_KEY_HEX is not set. Configure a real 32-byte hex key."
    return 1
  fi
  if [[ "$key" == "$(printf '0%.0s' {1..64})" ]]; then
    echo "OMNYID_DELEGATION_MASTER_KEY_HEX is set to the all-zeros placeholder. Configure a real 32-byte hex key."
    return 1
  fi
  if [[ ! "$key" =~ ^[0-9A-Fa-f]{64}$ ]]; then
    echo "OMNYID_DELEGATION_MASTER_KEY_HEX must be valid hex encoding for 32 bytes."
    return 1
  fi
  return 0
}

add_boolean_syntax_violation_if_needed() {
  local key="$1"
  local value
  value="$(trim "$(get_env_value "$key")")"
  if ! bool_like "$value"; then
    violations+=("$key must be a boolean value (true/false/1/0/yes/no/on/off) when set")
  fi
}

resolve_boolean_flag() {
  local global_name="$1"
  local scoped_name="$2"
  local default_value="$3"
  local global_raw scoped_raw value
  global_raw="$(trim "$(get_env_value "$global_name")")"
  if [[ -z "$global_raw" ]]; then
    value="$default_value"
  elif is_truthy "$global_raw"; then
    value=true
  else
    value=false
  fi
  scoped_raw="$(trim "$(get_env_value "$scoped_name")")"
  if [[ -n "$scoped_raw" ]]; then
    if is_truthy "$scoped_raw"; then
      value=true
    else
      value=false
    fi
  fi
  printf '%s' "$value"
}

if [[ -n "$env_file" ]]; then
  load_env_file "$env_file"
fi

environment_label="$(startup_environment_label || true)"
if [[ "$environment_label" != "production" && "$environment_label" != "prod" ]]; then
  if is_truthy "$require_production"; then
    echo "[startup-policy] production startup policy requires OMNYID_ENV=production (or equivalent)"
    echo "[startup-policy] env=${environment_label:-unset}"
    exit 1
  fi
  echo "[startup-policy] production startup policy is disabled for this environment"
  echo "[startup-policy] env=${environment_label:-unset}"
  exit 0
fi

violations=()

if is_truthy "$(get_env_value OMNYID_ALLOW_INSECURE_UNSIGNED)"; then
  violations+=("OMNYID_ALLOW_INSECURE_UNSIGNED must be false in production")
fi

if is_truthy "$(get_env_value OMNYID_ALLOW_PLAINTEXT_STORAGE)"; then
  violations+=("OMNYID_ALLOW_PLAINTEXT_STORAGE must be false in production")
fi

if database_url_violation="$(secret_presence_violation DATABASE_URL)"; then
  violations+=("$database_url_violation")
fi

database_url="$(get_secret_env_value DATABASE_URL)"
if database_url_looks_like_dev_default "$database_url"; then
  violations+=("DATABASE_URL must be set to a non-default production database")
fi

delegation_key="$(get_env_value OMNYID_DELEGATION_MASTER_KEY_HEX)"
if ! delegation_message="$(validate_delegation_key "$delegation_key" 2>&1)"; then
  violations+=("$delegation_message")
fi

if session_secret_violation="$(secret_presence_violation OMNYID_SESSION_SECRET)"; then
  violations+=("$session_secret_violation")
fi

if postgres_password_violation="$(secret_presence_violation POSTGRES_PASSWORD)"; then
  violations+=("$postgres_password_violation")
fi

backup_dir="$(trim "$(get_env_value OMNYID_BACKUP_DIR)")"
if [[ -z "$backup_dir" ]]; then
  violations+=("OMNYID_BACKUP_DIR must be configured in production for backup verification and restore drills")
elif ! absolute_like_path "$backup_dir"; then
  violations+=("OMNYID_BACKUP_DIR must be an absolute path when configured in production")
fi

for file_backed_secret in \
  DATABASE_URL \
  POSTGRES_PASSWORD \
  OMNYID_SIGNING_KEY_HEX \
  OMNYID_ENCRYPTION_KEY_HEX \
  OMNYID_SESSION_SECRET \
  OMNYID_GMAIL_CLIENT_SECRET \
  OMNYID_GMAIL_REFRESH_TOKEN \
  OMNYID_IMAP_PASSWORD \
  SMTP_PASS \
  COMPOSIO_API_KEY \
  OMNYID_ANTHROPIC_KEY \
  OMNYID_RUNPOD_API_KEY \
  OMNYID_OPENAI_API_KEY; do
  if secret_file_violation="$(secret_must_be_file_backed_violation "$file_backed_secret")"; then
    violations+=("$secret_file_violation")
  fi
done

if is_truthy "$(get_env_value OMNYID_PUBLIC_OPERATIONAL_ENDPOINTS)"; then
  if operational_token_violation="$(secret_presence_violation OMNYID_OPERATIONAL_ENDPOINT_TOKEN)"; then
    violations+=("$operational_token_violation")
  fi
  if operational_token_file_violation="$(secret_must_be_file_backed_violation OMNYID_OPERATIONAL_ENDPOINT_TOKEN)"; then
    violations+=("$operational_token_file_violation")
  fi
fi

for flag in \
  OMNYID_ENABLE_SIMULATOR \
  OMNYID_ENABLE_SIMULATOR_PROMOTION \
  OMNYID_ENABLE_SIMULATOR_SAMPLING \
  OMNYID_ENABLE_SYNTHESIZER_SIMULATOR \
  OMNYID_ENABLE_SYNTHESIZER_SIMULATOR_PROMOTION \
  OMNYID_ENABLE_SYNTHESIZER_SIMULATOR_SAMPLING \
  OMNYID_ENABLE_WATCHER_SIMULATOR \
  OMNYID_ENABLE_WATCHER_SIMULATOR_PROMOTION \
  OMNYID_ENABLE_WATCHER_SIMULATOR_SAMPLING \
  OMNYID_VERIFY_COMPOSIO_LIVE; do
  add_boolean_syntax_violation_if_needed "$flag"
done

synth_enabled="$(resolve_boolean_flag OMNYID_ENABLE_SIMULATOR OMNYID_ENABLE_SYNTHESIZER_SIMULATOR true)"
synth_promotion_enabled="$(resolve_boolean_flag OMNYID_ENABLE_SIMULATOR_PROMOTION OMNYID_ENABLE_SYNTHESIZER_SIMULATOR_PROMOTION true)"
synth_sampling_enabled="$(resolve_boolean_flag OMNYID_ENABLE_SIMULATOR_SAMPLING OMNYID_ENABLE_SYNTHESIZER_SIMULATOR_SAMPLING false)"
watcher_enabled="$(resolve_boolean_flag OMNYID_ENABLE_SIMULATOR OMNYID_ENABLE_WATCHER_SIMULATOR false)"
watcher_promotion_enabled="$(resolve_boolean_flag OMNYID_ENABLE_SIMULATOR_PROMOTION OMNYID_ENABLE_WATCHER_SIMULATOR_PROMOTION false)"
watcher_sampling_enabled="$(resolve_boolean_flag OMNYID_ENABLE_SIMULATOR_SAMPLING OMNYID_ENABLE_WATCHER_SIMULATOR_SAMPLING false)"

if [[ "$synth_promotion_enabled" == true && "$synth_enabled" != true ]]; then
  violations+=("Synthesizer simulator promotion cannot be enabled when the synthesizer simulator is disabled")
fi

if [[ "$synth_sampling_enabled" == true && "$synth_enabled" != true ]]; then
  violations+=("Synthesizer simulator sampling cannot be enabled when the synthesizer simulator is disabled")
fi

if [[ "$watcher_promotion_enabled" == true && "$watcher_enabled" != true ]]; then
  violations+=("Watcher simulator promotion cannot be enabled when the watcher simulator is disabled")
fi

if [[ "$watcher_sampling_enabled" == true && "$watcher_enabled" != true ]]; then
  violations+=("Watcher simulator sampling cannot be enabled when the watcher simulator is disabled")
fi

if stripe_production_config_present; then
  stripe_secret_key="$(get_env_value OMNYID_STRIPE_SECRET_KEY)"
  if ! stripe_secret_key_looks_valid "$stripe_secret_key"; then
    violations+=("OMNYID_STRIPE_SECRET_KEY must be set to a valid Stripe secret key when self-serve billing is configured")
  fi

  stripe_webhook_secret="$(get_env_value OMNYID_STRIPE_WEBHOOK_SECRET)"
  if ! stripe_webhook_secret_looks_valid "$stripe_webhook_secret"; then
    violations+=("OMNYID_STRIPE_WEBHOOK_SECRET must be set to a valid Stripe webhook secret when self-serve billing is configured")
  fi

  pro_price_id="$(get_env_value OMNYID_STRIPE_PRO_PRICE_ID)"
  fallback_price_id="$(get_env_value OMNYID_STRIPE_CHECKOUT_PRICE_ID)"
  if ! stripe_price_id_looks_valid "$pro_price_id" && ! stripe_price_id_looks_valid "$fallback_price_id"; then
    violations+=("OMNYID_STRIPE_PRO_PRICE_ID or OMNYID_STRIPE_CHECKOUT_PRICE_ID must be set to a valid Stripe price id when self-serve billing is configured")
  fi

  team_price_id="$(get_env_value OMNYID_STRIPE_TEAM_PRICE_ID)"
  if [[ -n "$(trim "$team_price_id")" ]] && ! stripe_price_id_looks_valid "$team_price_id"; then
    violations+=("OMNYID_STRIPE_TEAM_PRICE_ID must be a valid Stripe price id when set")
  fi

  if ! billing_workspace_base_url_is_configured; then
    violations+=("OMNYID_WORKSPACE_BASE_URL, OMNYID_UI_BASE_URL, or a derivable OMNYID_HOMESERVER_URL must be configured when self-serve billing is enabled")
  fi
fi

if composio_live_violation="$(verify_composio_live_violation)"; then
  violations+=("$composio_live_violation")
fi

if [[ ${#violations[@]} -gt 0 ]]; then
  echo "[startup-policy] production env validation failed"
  for violation in "${violations[@]}"; do
    echo "[startup-policy] - $violation"
  done
  exit 1
fi

echo "[startup-policy] production env validation passed"

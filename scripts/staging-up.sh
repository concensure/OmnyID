#!/usr/bin/env bash
# Creates (once) and starts the isolated staging stack on the Oracle host.
# Usage: bash scripts/staging-up.sh   (run from the project root on the server)
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
SECRETS_DIR=".secrets-staging"
ENV_FILE=".env.staging"
COMPOSE=(docker compose --env-file "$ENV_FILE" -p omnyid-staging -f docker-compose.oracle.staging.yml)

rand_hex() { openssl rand -hex "$1"; }

if [[ ! -f "$SECRETS_DIR/omnyid_signing_key_hex" ]]; then
  echo "[staging-up] Generating staging-only secrets in $SECRETS_DIR"
  # World-readable on purpose: the containers run as non-root users, and these keys
  # protect only synthetic staging data.
  umask 022
  mkdir -p "$SECRETS_DIR"
  openssl genpkey -algorithm ed25519 -outform DER -out "$SECRETS_DIR/.ed25519.der"
  # PKCS8 and SPKI DER both end with the raw 32-byte key.
  tail -c 32 "$SECRETS_DIR/.ed25519.der" | xxd -p -c 64 > "$SECRETS_DIR/omnyid_signing_key_hex"
  openssl pkey -inform DER -in "$SECRETS_DIR/.ed25519.der" -pubout -outform DER \
    | tail -c 32 | xxd -p -c 64 > "$SECRETS_DIR/.public_key_hex"
  rm -f "$SECRETS_DIR/.ed25519.der"
  rand_hex 32 > "$SECRETS_DIR/omnyid_encryption_key_hex"
  rand_hex 32 > "$SECRETS_DIR/omnyid_session_secret"
  rand_hex 32 > "$SECRETS_DIR/omnyid_delegation_master_key_hex"
  pg_password="$(rand_hex 24)"
  printf '%s' "$pg_password" > "$SECRETS_DIR/postgres_password"
  printf 'postgres://afp:%s@staging-postgres:5432/afp' "$pg_password" > "$SECRETS_DIR/database_url"
  rand_hex 12 > "$SECRETS_DIR/seed_user_password"
fi
[[ -f "$SECRETS_DIR/omnyid_gmail_client_secret" ]] \
  || (umask 022; rand_hex 16 > "$SECRETS_DIR/omnyid_gmail_client_secret")

printf 'OMNYID_STAGING_PUBLIC_KEY_HEX=%s\n' "$(<"$SECRETS_DIR/.public_key_hex")" > "$ENV_FILE"

"${COMPOSE[@]}" up -d staging-postgres staging-electric staging-homeserver
"${COMPOSE[@]}" up --no-deps staging-ui

echo "[staging-up] Waiting for the homeserver to answer on 127.0.0.1:18081 ..."
for _ in $(seq 1 60); do
  # /healthz needs a session in production mode, so any HTTP status means it is listening.
  code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18081/healthz || true)"
  if [[ "$code" != "000" ]]; then
    ready=1
    break
  fi
  sleep 3
done
if [[ -z "${ready:-}" ]]; then
  echo "[staging-up] Homeserver did not become healthy within 180s." >&2
  echo "[staging-up] Inspect: ${COMPOSE[*]} logs --tail=60 staging-homeserver" >&2
  exit 1
fi

seed_email="staging-seed@staging.omnyid.com"
seed_password="$(<"$SECRETS_DIR/seed_user_password")"
status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:18081/auth/register \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$seed_email\",\"password\":\"$seed_password\",\"display_name\":\"Staging Seed\"}")"
echo "[staging-up] Seed user registration returned HTTP $status (200/201 new, 409 already exists)."
# Staging has no mail provider, so verification emails can never arrive.
"${COMPOSE[@]}" exec -T staging-postgres psql -U afp -d afp -q \
  -c "UPDATE users SET email_verified = true WHERE email = '$seed_email'"
echo "[staging-up] Seed login: $seed_email  (password in $SECRETS_DIR/seed_user_password)"

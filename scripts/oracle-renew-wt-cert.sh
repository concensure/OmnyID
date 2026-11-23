#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/ubuntu/omnyid}"
LE_DIR="${LE_DIR:-/home/ubuntu/letsencrypt}"
LE_WORK_DIR="${LE_WORK_DIR:-/home/ubuntu/letsencrypt-work}"
LE_LOG_DIR="${LE_LOG_DIR:-/home/ubuntu/letsencrypt-logs}"
EMAIL="${ACME_EMAIL:-ops@omnyid.com}"
DOMAIN="${WT_DOMAIN:-wt.omnyid.com}"

cd "$REPO_DIR"

mkdir -p "$LE_DIR" "$LE_WORK_DIR" "$LE_LOG_DIR"

# Free TCP/80 for the standalone ACME challenge, then restore the public proxy.
docker compose --env-file .env.oracle -f docker-compose.oracle.minimal.yml stop caddy
trap 'docker compose --env-file .env.oracle -f docker-compose.oracle.minimal.yml up -d caddy homeserver' EXIT

docker run --rm \
  -p 80:80 \
  -v "$LE_DIR:/etc/letsencrypt" \
  -v "$LE_WORK_DIR:/var/lib/letsencrypt" \
  -v "$LE_LOG_DIR:/var/log/letsencrypt" \
  certbot/certbot certonly \
  --standalone \
  --keep-until-expiring \
  --non-interactive \
  --agree-tos \
  -m "$EMAIL" \
  -d "$DOMAIN"

docker compose --env-file .env.oracle -f docker-compose.oracle.minimal.yml up -d caddy homeserver

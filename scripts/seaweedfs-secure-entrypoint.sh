#!/bin/sh
set -eu

access_file="${OMNYID_SEAWEEDFS_ACCESS_KEY_FILE:-/run/secrets/seaweedfs_app_access_key}"
secret_file="${OMNYID_SEAWEEDFS_SECRET_KEY_FILE:-/run/secrets/seaweedfs_app_secret_key}"
admin_access_file="${OMNYID_SEAWEEDFS_ADMIN_ACCESS_KEY_FILE:-/run/secrets/seaweedfs_admin_access_key}"
admin_secret_file="${OMNYID_SEAWEEDFS_ADMIN_SECRET_KEY_FILE:-/run/secrets/seaweedfs_admin_secret_key}"
bucket="${OMNYID_SEAWEEDFS_BUCKET:-omnyid-attachments}"

require_secret() {
  path="$1"
  label="$2"
  [ -f "$path" ] || { echo "missing $label secret file" >&2; exit 1; }
  value=$(tr -d '\r\n' < "$path")
  [ "${#value}" -ge "$3" ] || { echo "$label is too short" >&2; exit 1; }
  case "$value" in
    *[!A-Za-z0-9_-]*) echo "$label contains unsupported characters" >&2; exit 1 ;;
  esac
  printf '%s' "$value"
}

case "$bucket" in
  ''|*[!a-z0-9.-]*) echo "invalid SeaweedFS bucket" >&2; exit 1 ;;
esac

access_key=$(require_secret "$access_file" "SeaweedFS access key" 20)
secret_key=$(require_secret "$secret_file" "SeaweedFS secret key" 32)
admin_access_key=$(require_secret "$admin_access_file" "SeaweedFS admin access key" 20)
admin_secret_key=$(require_secret "$admin_secret_file" "SeaweedFS admin secret key" 32)
umask 077
config=/run/seaweedfs-s3-config.json
{
  printf '{"identities":[{'
  printf '"name":"omnyid-app","credentials":[{"accessKey":"%s","secretKey":"%s"}],' "$access_key" "$secret_key"
  printf '"actions":["Read:%s","List:%s","Tagging:%s","Write:%s"]' "$bucket" "$bucket" "$bucket" "$bucket"
  printf '},{'
  printf '"name":"omnyid-storage-admin","credentials":[{"accessKey":"%s","secretKey":"%s"}],' "$admin_access_key" "$admin_secret_key"
  printf '"actions":["Admin","Read","List","Tagging","Write"]'
  printf '}]}\n'
} > "$config"
unset access_key secret_key admin_access_key admin_secret_key value

exec /usr/bin/weed server -dir=/data -ip=seaweedfs -s3 -s3.config="$config"

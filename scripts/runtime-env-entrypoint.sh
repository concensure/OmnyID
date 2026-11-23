#!/usr/bin/env sh
set -eu

for file_var in $(env | awk -F= '/^[A-Za-z_][A-Za-z0-9_]*_FILE=/{print $1}'); do
  base_var=${file_var%_FILE}
  file_path=$(printenv "$file_var" || true)
  if [ -z "$file_path" ]; then
    continue
  fi
  if [ ! -f "$file_path" ]; then
    echo "[runtime-env-entrypoint] missing secret file for $file_var: $file_path" >&2
    exit 1
  fi
  value=$(cat "$file_path")
  if [ -z "$(printf '%s' "$value" | tr -d '[:space:]')" ]; then
    echo "[runtime-env-entrypoint] blank secret file for $file_var: $file_path" >&2
    exit 1
  fi
  export "$base_var=$value"
done

exec "$@"

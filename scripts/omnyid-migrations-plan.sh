#!/usr/bin/env bash
# omnyid-migrations-plan.sh - Preview embedded OmnyID migrations without applying them.
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/omnyid-migrations-plan.sh
#
# Output:
#   - applied versions from omnyid_schema_migrations
#   - pending versions from postgres/migrations
#   - a non-zero exit code when pending migrations exist and
#     OMNYID_FAIL_ON_PENDING_MIGRATIONS=true is set

set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
FAIL_ON_PENDING="${OMNYID_FAIL_ON_PENDING_MIGRATIONS:-false}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
MIGRATIONS_DIR="${PROJECT_DIR}/postgres/migrations"

if [[ ! -d "${MIGRATIONS_DIR}" ]]; then
  echo "[omnyid-migrations-plan] ERROR: migrations directory not found at ${MIGRATIONS_DIR}"
  exit 1
fi

all_versions=()
while IFS= read -r migration_file; do
  base_name="$(basename "${migration_file}")"
  all_versions+=("${base_name%.sql}")
done < <(find "${MIGRATIONS_DIR}" -maxdepth 1 -type f -name '*.sql' | sort)

applied_versions=()
while IFS= read -r version; do
  [[ -n "${version}" ]] && applied_versions+=("${version}")
done < <(
  psql "${DATABASE_URL}" -Atqc \
    "SELECT version FROM omnyid_schema_migrations ORDER BY version" 2>/dev/null || true
)

declare -A applied_map=()
for version in "${applied_versions[@]}"; do
  applied_map["${version}"]=1
done

pending_versions=()
for version in "${all_versions[@]}"; do
  if [[ -z "${applied_map[${version}]:-}" ]]; then
    pending_versions+=("${version}")
  fi
done

echo "[omnyid-migrations-plan] Embedded migration files: ${#all_versions[@]}"
echo "[omnyid-migrations-plan] Applied migrations: ${#applied_versions[@]}"
echo "[omnyid-migrations-plan] Pending migrations: ${#pending_versions[@]}"

if [[ ${#pending_versions[@]} -gt 0 ]]; then
  echo "[omnyid-migrations-plan] Pending versions:"
  for version in "${pending_versions[@]}"; do
    echo "  - ${version}"
  done
else
  echo "[omnyid-migrations-plan] No pending migrations."
fi

if [[ "${FAIL_ON_PENDING,,}" == "true" && ${#pending_versions[@]} -gt 0 ]]; then
  exit 2
fi

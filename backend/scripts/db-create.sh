#!/usr/bin/env bash
# Creates the application database if it does not already exist.
# Mirrors the old `sequelize-cli db:create` behaviour.
set -euo pipefail

# Load .env (npm run does not do this automatically).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/../.env"
  set +a
fi

# DATABASE_URL = postgresql://postgres:admin@localhost:5432/tu-properies?schema=public
URL="${DATABASE_URL:-postgresql://postgres:admin@localhost:5432/tu-properies?schema=public}"

# Strip the scheme and pull out user / password / host / port.
DB_USER=$(printf '%s' "$URL" | sed -nE 's#.*://([^:]+).*#\1#p')
DB_PASS=$(printf '%s' "$URL" | sed -nE 's#.*://[^:]+:([^@]+).*#\1#p')
DB_HOST=$(printf '%s' "$URL" | sed -nE 's#.*@([^:]+).*#\1#p')
DB_PORT=$(printf '%s' "$URL" | sed -nE 's#.*@[^/]+:([0-9]+)/.*#\1#p')
DB_NAME=$(printf '%s' "$URL" | sed -nE 's#.*/([^?]+).*#\1#p')

export PGPASSWORD="$DB_PASS"

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  echo "Database '$DB_NAME' already exists."
else
  createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -O "$DB_USER" "$DB_NAME"
  echo "Database '$DB_NAME' created."
fi
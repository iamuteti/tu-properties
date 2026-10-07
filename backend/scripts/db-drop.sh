#!/usr/bin/env bash
# Drops the application database if it exists.
# Mirrors the old `sequelize-cli db:drop` behaviour.
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

DB_USER=$(printf '%s' "$URL" | sed -nE 's#.*://([^:]+).*#\1#p')
DB_PASS=$(printf '%s' "$URL" | sed -nE 's#.*://[^:]+:([^@]+).*#\1#p')
DB_HOST=$(printf '%s' "$URL" | sed -nE 's#.*@([^:]+).*#\1#p')
DB_PORT=$(printf '%s' "$URL" | sed -nE 's#.*@[^/]+:([0-9]+)/.*#\1#p')
DB_NAME=$(printf '%s' "$URL" | sed -nE 's#.*/([^?]+).*#\1#p')

export PGPASSWORD="$DB_PASS"

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
  echo "Database '$DB_NAME' dropped."
else
  echo "Database '$DB_NAME' does not exist; nothing to drop."
fi
#!/usr/bin/env bash
set -euo pipefail

ROOT="/var/www/tu-properties"

# `npm ci` deletes node_modules — including the generated Prisma client — so
# `npm run db:generate` must run before the build and the migrations.
cd "$ROOT/backend" && git pull && npm ci && npm run db:generate && npm run build && npx prisma migrate deploy && pm2 restart properties-api-prod
cd "$ROOT/frontend" && git pull && npm ci --legacy-peer-deps && npm run build && pm2 restart properties-front-prod

pm2 save

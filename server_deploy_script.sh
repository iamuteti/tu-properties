#!/usr/bin/env bash
set -euo pipefail

ROOT="/var/www/tu-properties"

# NODE_ENV=production in this shell makes npm omit devDependencies — the
# `prisma` CLI and `nest` live there. The app process gets NODE_ENV from
# ecosystem.config.js instead, so unset it here.
unset NODE_ENV

# `npm ci` deletes node_modules — including the generated Prisma client — so
# `npm run db:generate` must run before the build and the migrations.
#
# `--legacy-peer-deps` is mandatory for the backend: the committed lockfile was
# produced with it (the `prisma` CLI pulls in `@prisma/studio-core`, whose
# react peer deps are not in the lockfile), and a plain `npm ci` refuses to
# install an out-of-sync lockfile. npm ci validates the lockfile BEFORE it
# wipes node_modules, so that failure leaves the *previous* node_modules — and
# its stale Prisma client — in place, and the build then fails with
# "Property 'tenant' does not exist on type 'PrismaService'" instead of with
# an install error.
cd "$ROOT/backend" && git pull && npm ci --include=dev --legacy-peer-deps && npm run db:generate && npm run build && npx prisma migrate deploy && pm2 restart properties-api-prod

# The build's Prisma types come from node_modules/.prisma/client. If that file
# is older than the schema, the client is stale and the build fails with
# "Property '<model>' does not exist on type 'PrismaService'".
node -e "const fs=require('fs');const c='node_modules/.prisma/client/index.d.ts',s='src/prisma/schema.prisma';if(!fs.existsSync(c)||fs.statSync(c).mtimeMs<=fs.statSync(s).mtimeMs){console.error('stale Prisma client - run npm run db:generate');process.exit(1)}"

cd "$ROOT/frontend" && git pull && npm ci && npm run build && pm2 restart properties-front-prod

pm2 save

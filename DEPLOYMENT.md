# tu-properties — Deployment Guide

> **AGENT RESUME CHECKPOINT** — If you're resuming a session (context maxed, session expired, etc.), read this file top to bottom. It contains everything needed to continue without rediscovery.
>
> **Current Status** (2026-10-19): tu-properties is a NestJS 11 + Prisma 7 + PostgreSQL backend (port 3003) and Next.js 16 frontend (port 3002). Real Estate Property Management SaaS. Prisma schema at `backend/src/prisma/schema.prisma`. Deployments are manual via PM2 + nginx; CI runs typecheck, tests, and builds on push to `main`.
>
> **Key Files to Re-read**: `AGENTS.md` (project commands & layout), `docs/00-MASTER-ARCHITECTURE.md` (architecture & design decisions), `backend/.env.example`, `frontend/.env.example`.

---

## Quick Start (Fresh Machine)

```bash
# 1. Clone & install
git clone <repo-url>
cd tu-properties

# 2. Backend
cd backend
npm install
cp .env.example .env          # edit DB creds + JWT_SECRET (required)
npx prisma generate           # client from src/prisma/schema.prisma
npx prisma migrate deploy     # apply migrations
npm run start:dev             # PORT=3003 (from .env)

# 3. Frontend (new terminal)
cd ../frontend
npm install
cp .env.example .env.local    # NEXT_PUBLIC_BACKEND_URL=http://localhost:3003
npm run dev                   # http://localhost:3002
```

> Prisma is configured via `backend/prisma.config.ts` (schema: `src/prisma/schema.prisma`, migrations: `src/prisma/migrations`). Always run prisma commands from `backend/`.

---

## Running the Project

### Backend Scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Watch mode via `nest start` |
| `npm run start:dev` | `nest start --watch` |
| `npm run start:prod` | Run `dist/main` |
| `npm run build` | Compile to `dist/` |
| `npm run lint` | eslint `--fix` (mutates files in place) |
| `npm test` | jest (unit, `rootDir: src`) |
| `npm run test:e2e` | jest e2e config |
| `npm run db:create` / `db:drop` | Create / drop database |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:migrate:undo:all` | `prisma migrate reset --force` |
| `npm run db:seed` | `prisma db seed` (`src/prisma/seed.ts`) |
| `npm run db:seed:demo` | Demo data (`src/prisma/demo-data.ts`) |
| `npm run db:seed:jedan` | Jedan Apartments immersive seed (`src/prisma/jedan-apartments-seed.ts`) |
| `npm run db:reset:demo` | Drop → create → migrate → seed → demo data (full reset) |

### Frontend Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | `next dev -p 3002` |
| `npm run build` | Production build (`.next/`) |
| `npm run start` | `next start` (serve production build) |
| `npm run lint` | eslint |

### Database Scripts

| Command | Description |
|---------|-------------|
| `npm run db:create` / `db:drop` | Create / drop database — `scripts/db-admin.ts`, cross-platform (no `bash`, no `psql` on the PATH) |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:migrate:undo:all` | Revert all migrations |
| `npm run db:seed` | Run `prisma db seed` |
| `npm run db:seed:demo` | Demo dataset only — `DEMO_COUNTRIES=KE,ZA,IN` seeds a subset, `DEMO_COUNTRY=IN` makes India the primary market |
| `npm run db:seed:jedan` | Jedan Apartments immersive dataset only |
| `npm run db:reset:demo` | Full reset: drop → create → migrate → seed → demo. It wipes the database, so anything seeded separately (`npm run db:seed:jedan`) has to be re-seeded afterwards |
| `npx prisma generate` | Regenerate Prisma client |

---

## Testing & Quality Gates

### Backend (run from `backend/`)

```bash
# Type checking
npx tsc --noEmit

# Lint (⚠ runs eslint --fix, MUTATES FILES IN PLACE)
npm run lint

# Unit tests (src/**/*.spec.ts only — rootDir=src)
npm test

# E2E tests (needs test DB)
npm run test:e2e
```

> **Critical**: `npm test` does **NOT** run e2e — jest `rootDir: "src"` excludes `test/`. Always run both.

### Frontend (run from `frontend/`)

```bash
# Type checking
npx tsc --noEmit

# Build (skips ESLint — ignoreDuringBuilds: true)
npm run build

# Lint (run separately)
npm run lint

# Unit tests (Vitest)
npm test
```

### Pre-Push Checklist (Both Apps)

```bash
# Backend
cd backend
npx tsc --noEmit
npm run lint
npm test
npm run test:e2e

# Frontend
cd ../frontend
npx tsc --noEmit
npm run build
npm run lint
npm test
```

---

## Debugging

### Backend Debugging

1. **VS Code**: Use `npm run start:dev` (watch) or attach inspector to `start:debug`.
2. **Logs**: `main.ts` creates `backend/uploads/` on boot; PM2 logs written to `./logs` via ecosystem config.
3. **Database**: Connect to `tu-properies` on `localhost:5432`.
4. **Common issues**:
   - Port conflicts: `PORT` lives in `backend/.env` (3003); frontend `PORT` is 3002.
   - JWT secret missing: `JWT_SECRET` required in `.env`.
   - Migration failures: Migrations are immutable — never edit committed ones.
   - Prisma schema path: `backend/src/prisma/schema.prisma` (wired via `prisma.config.ts`), NOT `backend/prisma/schema.prisma`.

### Frontend Debugging

1. **Browser DevTools**: Console for React errors, Network for API calls.
2. **Common issues**:
   - `NEXT_PUBLIC_BACKEND_URL` mismatch with backend port (3003).
   - Token expiry: check auth cookie / localStorage handling in `frontend/lib/api.ts`.
   - Frontend env vars are baked in at build time — change them, then rebuild.

### E2E Debugging

```bash
cd backend
# Run single e2e spec
npx jest --config ./test/jest-e2e.json test/<module>.e2e-spec.ts
```

---

## Key Conventions (Must Follow)

### Backend

1. **Multi-tenancy**: tenant-scoping is per-organization (`Organization`). Scope queries by `organizationId` where applicable; never trust client-supplied tenant IDs.
2. **Validation**: Every controller input = `class-validator` DTO. Global `ValidationPipe` with `whitelist: true` strips unknown fields.
3. **Guards order** (`main.ts`): `JwtAuthGuard` → `RolesGuard` → `RightsGuard` → `ModuleGuard` → `TenantScopeGuard` (last).
4. **CORS**: `CorsAllowlistService` drives `enableCors` origin from `CORS_ORIGINS`. Production origins must be the exact `https://` origin; an HTTP origin is rejected.
5. **Tests**: Add `*.service.spec.ts` next to service. Run `npm test` (unit) and `npm run test:e2e` separately.
6. **Migrations**: Immutable. Add new, never edit committed ones.
7. **Response DTOs**: Field-accurate with explicit `@ApiProperty` types (no `Record<string, unknown>`).
8. **Storage**: `STORAGE_DRIVER=local` (default, files in `backend/uploads/`) or `s3` (AWS/MinIO via `S3_*` env vars). Selected in `storage.module.ts`.

### Frontend

1. **IDs are strings**: Prisma `cuid()` IDs — treat as strings, never numbers.
2. **API client**: `frontend/lib/api.ts` — centralized Axios base URL from `NEXT_PUBLIC_BACKEND_URL`.
3. **Env vars**: `NEXT_PUBLIC_*` are baked in at build time; require a rebuild to change.
4. **Next.js 16**: `next dev -p 3002`, `next build`, `next start`.

---

## Working with the Codebase

### Adding a New Module

1. Create module in `backend/src/modules/<name>/`.
2. Follow existing patterns: `controller.ts`, `service.ts`, `module.ts`, DTOs, `*.spec.ts`.
3. Apply tenant scoping + authorization guards per `ARCHITECTURE.md`.
4. Create response DTOs with field-accurate types.
5. Add unit spec + register module in `app.module.ts`.
6. Frontend: add pages under `frontend/src/app/`, components, and `api.ts` namespace as needed.

### Adding a Migration

```bash
cd backend
# Edit schema.prisma, then:
npx prisma migrate deploy   # production-style deploy
# or in dev:
npx prisma db push --accept-data-loss
```

> **Hand-maintained indexes**: `notifications_landlordId_readAt_idx` and `utility_charges_no_double_bill_bulk` exist only as raw-SQL migrations. Generated migrations will propose DROPs for both — delete those DROP statements before applying, then verify with `SELECT indexname FROM pg_indexes WHERE indexname IN (...)` afterwards.

### Adding a Seeder

```bash
cd backend
# Create seed in src/prisma/seed.ts or src/prisma/demo-data.ts
# Idempotent: check exists before insert
npm run db:seed
npm run db:seed:demo
```

---

## Common Tasks

### Run Only Specific Tests

```bash
# Backend unit tests for a module
cd backend
npx jest --testPathPatterns=users.service

# Backend e2e for a module
npx jest --config ./test/jest-e2e.json test/<module>.e2e-spec.ts

# Frontend tests
cd frontend
npm test -- --run
```

### Database Operations

```bash
# Full reset: drop DB, create it fresh, run migrations, then seed + demo data
cd backend
npm run db:reset:demo

# Or step by step
npm run db:migrate:undo:all && npm run db:migrate && npm run db:seed

# Demo data only
npm run db:seed:demo

# Demo data for specific markets (ISO-3166-1 alpha-2 codes)
DEMO_COUNTRIES=KE,ZA,IN,BR npm run db:seed:demo   # a subset
DEMO_COUNTRY=IN npm run db:seed:demo                # India as the primary market
DEMO_MODE=multi npm run db:seed:demo                # + Global Properties International

# The demo seed DELETES every organization and re-seeds from scratch — run
# `npm run db:seed:jedan` afterwards to bring the Jedan Apartments dataset back.

# Validate schema before deploy
npx prisma validate
```

> The `DEMO_*` variables are shell syntax above. On PowerShell use `$env:DEMO_COUNTRIES="KE,ZA,IN,BR"; npm run db:seed:demo` instead.

### Generate API Types

No automated `api:gen` pipeline exists in this repo. Frontend types are hand-written against backend DTOs; keep them in sync manually.

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Default | Required | Notes |
|----------|---------|----------|-------|
| `PORT` | `3003` | No | Single source of truth; nginx proxies to this |
| `NODE_ENV` | `development` | No | `production` disables dev-only behaviour |
| `FRONTEND_URL` | `https://properties.tuhame.co.ke` | Yes | Exact production origin; used by the frontend / nginx proxying |
| `CORS_ORIGINS` | `https://properties.tuhame.co.ke` | Yes | Comma-separated origins allowed by CORS; drives the allowlist in `src/security/cors.ts` |
| `DATABASE_URL` | `postgresql://postgres:admin@localhost:5432/tu-properies?schema=public` | Yes | |
| `SHADOW_DATABASE_URL` | `postgresql://.../tu-properies-shadow` | No | Only for `prisma migrate diff --from-migrations` |
| `JWT_SECRET` | — | **Yes** | `openssl rand -base64 48`; rotate per environment |
| `JWT_EXPIRES_IN` | `7d` | No | |
| `CRM_WEBHOOK_SECRET` | — | No | Module 3 lead-capture webhook secret |
| `CRM_WEBHOOK_ORGANIZATION_ID` | — | No | |
| `NOTIFICATION_CREDENTIALS_KEY` | — | No | Module 17 — encrypts stored SMS provider credentials |
| `STORAGE_DRIVER` | `local` | No | `local` (default) or `s3` |
| `S3_ENDPOINT` | — | No | Required when `STORAGE_DRIVER=s3` |
| `S3_REGION` | `us-east-1` | No | |
| `S3_BUCKET_NAME` | — | No | Required when `STORAGE_DRIVER=s3` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | — | No | Required when `STORAGE_DRIVER=s3` |
| `S3_FORCE_PATH_STYLE` | `true` | No | Required for MinIO |
| `STORAGE_DIR` | `./uploads` | No | Local storage directory |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | — | No | Email; blank = no mail |
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` / `MPESA_SHORT_CODE` / `MPESA_PASSKEY` / `MPESA_ENV` | — | No | M-Pesa live credentials (per property) |
| `DEMO_COUNTRY` | `KE` | No | Demo seed only. The *primary* market (ISO-3166-1 alpha-2) — the one that gets Rohi + Westhill |
| `DEMO_COUNTRIES` | all 15 markets | No | Demo seed only. Comma-separated ISO-3166-1 alpha-2 codes to seed (`KE ZA US GB CA AU DE FR IN CN JP KR BR MX AE`) |
| `DEMO_MODE` | — | No | Demo seed only. `multi` adds the Global Properties International org with its branches |

> Also read by code (absent from `.env.example`): `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_DURATION_MINUTES`, `PASSWORD_RESET_URL_BASE`, `PASSWORD_RESET_TTL_SECONDS`.

### Frontend (`frontend/.env` / `.env.local`)

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `3002` | Read for `dev`/`build`/`start` |
| `NEXT_PUBLIC_BACKEND_URL` | `https://api-properties.tuhame.co.ke` | Backend base URL; baked at build time |

---

## CI/CD (GitHub Actions)

- Workflow: `.github/workflows/ci.yml` (at repo root)
- Triggers: push to `main`, pull requests
- **Backend job** (`node 20`): `npm ci`, `npx prisma generate`, `npx tsc --noEmit`, `npm test -- --runInBand`
- **Frontend job** (`node 20`): `npm ci --legacy-peer-deps`, `npx tsc --noEmit`, `npm run build`
- Deployments are **manual** — no CD workflow exists.

---

## Known Gotchas

| Issue | Solution |
|-------|----------|
| `npm run lint` mutates files | Apply style changes as a separate, reviewed step |
| `npm test` (backend) skips e2e | Run `npm run test:e2e` explicitly |
| Frontend build skips ESLint | Run `npm run lint` separately |
| Port mismatch (3002/3003) | Keep `PORT` and `NEXT_PUBLIC_BACKEND_URL` in sync |
| Prisma schema path | Schema is `backend/src/prisma/schema.prisma` — run prisma from `backend/` |
| `declare` on model fields | Every `@Column()`/`@Field()` property needs `declare` (copy style from existing models) |
| Hand-maintained indexes | Delete DROP statements for `notifications_landlordId_readAt_idx` and `utility_charges_no_double_bill_bulk` from generated migrations |
| CORS rejects HTTP origin | `CORS_ORIGINS` must list exact `https://` production origins |
| `NEXT_PUBLIC_*` changes need rebuild | Frontend env vars are baked in at build time |
| Silent storage fallback | Wrong S3/MinIO credentials fall back to local `uploads/`; verify first real upload |
| Demo seed wipes all organizations | `db:seed:demo` deletes every org, invoice and user before re-seeding; re-run `db:seed:jedan` afterwards |
| Unknown market code in `DEMO_COUNTRIES` | The seed fails loudly by design — a skipped market is worse than a stopped seed |

---

## Documentation Map

| File | Purpose |
|------|---------|
| `AGENTS.md` | Project commands, layout, typecheck/lint/test commands |
| `docs/00-MASTER-ARCHITECTURE.md` | Architecture & design decisions |
| `DEPLOYMENT.md` | **You are here** — deployment guide |
| `docs/01-...` through `docs/20-...` | Module specs and database schema (20 module docs) |
| `Testing.md` | Testing guide — demo logins, data isolation scenarios, `DEMO_COUNTRIES` / `DEMO_COUNTRY` |

---

## Production Deployment (VPS)

### Stack Overview

| Component | Tech | Port | Process |
|-----------|------|------|---------|
| Backend | NestJS 11 + Prisma 7 + PostgreSQL | 3003 | PM2 `tu-properties-api-prod` → `dist/main.js` |
| Frontend | Next.js 16 (`next start`) | 3002 | PM2 `tu-properties-front-prod` |
| Proxy | nginx | 80/443 | systemd |
| Storage | Local disk (`backend/uploads/`) by default; S3/MinIO via `STORAGE_DRIVER=s3` | — | Backend serves files |

- Domains: `properties.tuhame.co.ke` (frontend), `api-properties.tuhame.co.ke` (backend) — see the nginx and certbot blocks below.
- Multi-tenant organizations can use subdomains/custom domains (`Organization.subdomain`, `Organization.customDomain`); plan wildcard DNS (`*.properties.tuhame.co.ke`) if using org subdomains.
- Payments: M-Pesa STK push configured per property (`mpesaPropertyPayNumber`). Switch to live credentials in production.
- No Redis/Bull dependency — nothing to install or harden for caching/queues.

### 1. Missing Server Software (install on VPS)

```bash
# PostgreSQL (REQUIRED)
sudo apt update && sudo apt install -y postgresql postgresql-contrib

# PM2 process manager (REQUIRED)
sudo npm i -g pm2

# SSL certificates
sudo apt install -y certbot python3-certbot-nginx

# Native build deps for bcrypt (compiles from source)
sudo apt install -y build-essential python3

# Recommended: log rotation for PM2
pm2 install pm2-logrotate
```

Recommended Node version: **22 LTS**.

### 2. PostgreSQL Setup

```bash
sudo -u postgres psql
```

```sql
CREATE USER tu_properties WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE tu-properies OWNER tu_properties;
\q
```

Then apply migrations (from `backend/`):

```bash
npx prisma migrate deploy
npm run db:seed        # optional
```

Always back up before migrations: `pg_dump tu-properies > backup_$(date +%F).sql`

### 3. Production Environment Variables

Write `backend/.env` and `frontend/.env` with production values (see Environment Variables Reference above). Key changes from dev:

- `NODE_ENV=production`
- `FRONTEND_URL="https://properties.tuhame.co.ke"` (exact origin)
- `DATABASE_URL` pointing to production DB with strong password
- `JWT_SECRET` regenerated (`openssl rand -base64 48`)
- `MPESA_ENV="production"` with live keys
- SMTP credentials for email

### 4. Create `ecosystem.config.js` (does not exist yet)

`nano ecosystem.config.js` (repo root):

```js
module.exports = {
  apps: [
    {
      name: 'properties-api-prod',
      cwd: './backend',
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'properties-front-prod',
      cwd: './frontend',
      script: 'npm',
      args: 'run start',
      instances: 1,
      autorestart: true,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
```

### 5. Create `server_deploy_script.sh` (does not exist yet)

`nano server_deploy_script.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="/var/www/tu-properties"

cd "$ROOT/backend" && git pull && npm ci && npm run build && npx prisma migrate deploy && pm2 restart tu-properties-api-prod
cd "$ROOT/frontend" && git pull && npm ci --legacy-peer-deps && npm run build && pm2 restart tu-properties-front-prod

pm2 save
```

### 6. nginx Configuration

Bootstrap (HTTP, before certs):

```bash
sudo nano /etc/nginx/sites-available/properties.tuhame.co.ke.conf
```

```nginx
server {
    listen 80;
    server_name properties.tuhame.co.ke www.properties.tuhame.co.ke;
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name api-properties.tuhame.co.ke;
    client_max_body_size 25M;
    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/properties.tuhame.co.ke.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d properties.tuhame.co.ke -d www.properties.tuhame.co.ke -d api-properties.tuhame.co.ke
```

Then replace with full HTTPS config (redirect 80→443, ssl_certificate paths from certbot, gzip, `/_next/static/` caching, 25M body limit). Enforce HTTPS — `CORS_ORIGINS` must list exact `https://` origins and CORS compares exact origins.

### 7. Firewall

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

PostgreSQL (5432) stays on localhost — never expose publicly.

### 8. Deployment Steps (Fresh VPS → Live)

1. Install PostgreSQL, PM2, certbot, build-essential (step 1)
2. Create database and user (step 2)
3. Clone repo to `/var/www/tu-properties`
4. Write production `backend/.env` and `frontend/.env` (step 3)
5. Build backend: `cd backend && npm ci && npm run build && npx prisma generate`
6. Apply migrations: `npx prisma migrate deploy`
7. Build frontend: `cd frontend && npm ci --legacy-peer-deps && npm run build`
8. Create `ecosystem.config.js` + `server_deploy_script.sh` (steps 4–5)
9. Start: `pm2 start ecosystem.config.js && pm2 save && pm2 startup`
10. Configure nginx + SSL (step 6); point DNS A records to VPS IP
11. If using S3/MinIO, set `STORAGE_DRIVER=s3` + `S3_*` vars, then `pm2 restart tu-properties-api-prod`
12. Enable firewall (step 7); `pm2 install pm2-logrotate`
13. Switch payment keys to live (step 3)

### 9. Post-Deploy Verification Checklist

- [ ] `https://api-properties.tuhame.co.ke/` responds through nginx
- [ ] `https://properties.tuhame.co.ke` loads and API calls succeed (no CORS errors)
- [ ] Login / signup works; email arrives if SMTP configured
- [ ] Create a property/unit/lease through the app
- [ ] Upload a document — confirms storage driver (`uploads/` or S3/MinIO)
- [ ] `pm2 list` shows both apps online; `pm2 logs` clean
- [ ] PostgreSQL port not reachable from the public internet
- [ ] HTTPS enforced (HTTP redirects), cert auto-renewal active (`sudo certbot certificates`)

### 10. Ongoing / Redeploy

```bash
bash server_deploy_script.sh

# or manually
cd /var/www/tu-properties/backend && git pull && npm ci && npm run build && npx prisma migrate deploy && pm2 restart tu-properties-api-prod
cd /var/www/tu-properties/frontend && git pull && npm ci --legacy-peer-deps && npm run build && pm2 restart tu-properties-front-prod
```

- CI runs on push to `main` (`.github/workflows/ci.yml`); deploys remain manual.
- `NEXT_PUBLIC_*` frontend env changes require a rebuild, not just a restart.

---

## License

MIT — see `LICENSE`

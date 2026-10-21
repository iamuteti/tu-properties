# TU Properties — Production Deployment Guide (VPS)

Checklist for deploying TU Properties to a production VPS as a client demo
under the `tuhame.co.ke` domain (sub-domain per project).

> **Editor convention:** all file edits in this guide use `nano` from the terminal
> (e.g. `sudo nano /etc/nginx/sites-available/properties.tuhame.co.ke.conf`). In nano:
> paste with `Ctrl+Shift+V` (or right-click), save with `Ctrl+O` then `Enter`,
> exit with `Ctrl+X`.

> Local development commands (install, typecheck, lint, tests, demo seeds) live in
> `AGENTS.md`. This file covers production deployment only.

## Stack Overview

| Component | Tech | Port | Process |
|-----------|------|------|---------|
| Backend | NestJS 11 + Prisma 7 + PostgreSQL | 3003 | PM2 `properties-api-prod` → `dist/main.js` |
| Frontend | Next.js 16 (`next start`) | 3002 | PM2 `properties-front-prod` → `npm run start` |
| Uploads | Local disk (`STORAGE_DIR`) by default; S3/MinIO via `STORAGE_DRIVER=s3` | — | backend, over authenticated routes |
| Proxy | nginx | 80/443 | systemd |

- Domains: `properties.tuhame.co.ke` (frontend), `api-properties.tuhame.co.ke` (backend)
- nginx site file: `/etc/nginx/sites-available/properties.tuhame.co.ke.conf`
- Sessions: the JWT lives in an httpOnly `auth_token` cookie (`sameSite=strict`,
  `secure` in production). The API origin must be **same-site** with the frontend
  — it is, both sit under `tuhame.co.ke`. Move the API to another registrable
  domain and the browser stops sending the cookie.
- Payments: **no payment gateway is integrated** — rent and invoices are
  *recorded*, not processed. `mpesaPropertyPayNumber` and the STK-push switches
  are per-property fields in the UI, and there are no gateway credentials to
  set at deploy time (no `MPESA_*` variable is read by the code).
- Email and SMS: configured **in the admin panel** — SMTP and SMS provider
  credentials live encrypted in the database. There are no `SMTP_*` env vars;
  `NOTIFICATION_CREDENTIALS_KEY` is the only secret to set at deploy time.
- There is **no Redis/Bull, no Socket.IO and no Swagger** in this project.
  Recurring billing and other scheduled work run inside the API
  (`@nestjs/schedule`), so there is nothing extra to install or harden.
- The frontend calls the API **cross-origin** at `NEXT_PUBLIC_BACKEND_URL`
  (`next.config.ts` has no rewrites), which is why `CORS_ORIGINS` matters.

## 1. Server Software (fresh VPS — install everything)

```bash
# Node.js 22 LTS (Next.js 16 and the backend's @types/node ^22 both want >= 20)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt update && sudo apt install -y nodejs
node -v   # expect v22.x

# nginx, PostgreSQL, SSL, build deps for bcrypt
sudo apt install -y nginx postgresql postgresql-contrib certbot python3-certbot-nginx build-essential python3

# PM2 process manager (ecosystem.config.js at the repo root depends on it)
sudo npm i -g pm2
pm2 install pm2-logrotate
```

## 2. PostgreSQL Setup

```bash
sudo -u postgres psql
```

```sql
CREATE USER tu_properties WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE tu-properies OWNER tu_properties;
\q
```

Then migrate + seed (from `backend/`, with the production `.env` in place):

```bash
cd /var/www/tu-properties/backend
npm run db:generate      # Prisma client — see section 4.1
npm run db:migrate       # prisma migrate deploy
npm run db:seed          # super admin + system roles + demo organizations
```

What `db:seed` creates:

- Super Admin `admin@tuproperties.co.ke` / `Password123!` — **log in immediately
  after deploy and change this password**
- The thirteen system roles with their permission matrix
- The demo organizations (Rohi Estate Management and Westhill Properties) and
  their demo data

If you want an **empty** production database instead of the demo dataset, run
only `npm run db:seed:roles` (roles + permissions) and create the first
organization through the UI.

> Do NOT run `npm run db:seed:demo` against a live database — it deletes every
> organization and re-seeds all 15 markets with the public `Password123!`
> password. Use it only on a staging copy.

## 3. Production Environment Variables

### Backend `backend/.env`

```bash
nano /var/www/tu-properties/backend/.env
```

```bash
# Application
PORT=3003
NODE_ENV=production

# CORS allow-list — comma-separated EXACT origins. In production an empty
# value denies every browser origin (fail-closed); a wildcard subdomain
# pattern (*.tuhame.co.ke) is supported for per-organization subdomains.
# The `www` alias (if you keep it, section 5) is a separate origin and must
# be listed too: CORS_ORIGINS="https://properties.tuhame.co.ke,https://www.properties.tuhame.co.ke"
CORS_ORIGINS="https://properties.tuhame.co.ke"

# Database (created in step 2)
DATABASE_URL="postgresql://tu_properties:STRONG_PASSWORD@127.0.0.1:5432/tu-properies?schema=public"

# JWT — generate: openssl rand -base64 48
# If this is unset the API falls back to the literal "superSecretKey".
# Never deploy without it.
JWT_SECRET="<strong-random-value>"

# Module 17 — encrypts the SMS provider credentials stored in the database.
# Any strong value works (it is SHA-256 derived); generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Required before an admin can store a provider credential — the API boots
# without it and only fails when one is saved. Losing it makes every stored
# credential unrecoverable — that is the point of encrypting them, and why the
# admin panel lets a key be re-entered.
NOTIFICATION_CREDENTIALS_KEY="<64-hex-chars>"

# Uploads — MUST be an absolute path outside the git checkout so `git pull`
# never wipes stored files, and the PM2 user must own it (section 4.4).
STORAGE_DRIVER=local
STORAGE_DIR=/var/lib/tu-properties/uploads

# Module 3 — optional public lead-capture webhook
# (POST /crm/public/leads with header x-webhook-secret).
# CRM_WEBHOOK_SECRET="<random>"
# CRM_WEBHOOK_ORGANIZATION_ID="<organization-id>"

# TOTP issuer label shown in authenticator apps (default: "TU Properties").
# MFA_ISSUER="TU Properties"

# S3 / MinIO — only when STORAGE_DRIVER=s3
# S3_ENDPOINT="https://minio.example.com"
# S3_REGION="us-east-1"
# S3_BUCKET="tu-properties"
# S3_ACCESS_KEY="..."
# S3_SECRET_KEY="..."
# S3_FORCE_PATH_STYLE=true
```

> **Variables the code does NOT read** — do not rely on them: `FRONTEND_URL`
> (CORS is driven by `CORS_ORIGINS` alone), `JWT_EXPIRES_IN` (the session TTL is
> hardcoded to 60 minutes), `SMTP_*` and `MPESA_*` (email, SMS and payments are
> configured in the admin panel or not integrated at all), and `S3_BUCKET_NAME`
> (the variable is `S3_BUCKET`).

### Frontend `frontend/.env`

```bash
nano /var/www/tu-properties/frontend/.env
```

> `NEXT_PUBLIC_*` values are baked in at BUILD TIME — set them BEFORE running
> `npm run build` on the server. Changing them later requires a rebuild.

```bash
NEXT_PUBLIC_BACKEND_URL=https://api-properties.tuhame.co.ke

# Next.js listens on this for `npm run dev`, `npm run build` and
# `npm run start` (scripts/with-port.mjs feeds it to `next`).
PORT=3002

# Public landing page — comma-separated, in display order.
# 14 currencies cover the 15 markets (Germany and France share the euro).
# NEXT_PUBLIC_LANDING_MARKETS=KE,ZA,US,GB,CA,AU,DE,FR,IN,CN,JP,KR,BR,MX,AE
# NEXT_PUBLIC_LANDING_CURRENCIES=USD,KES,ZAR,GBP,CAD,AUD,EUR,INR,CNY,JPY,KRW,BRL,MXN,AED
```

PM2 does **not** set ports in `ecosystem.config.js` — `PORT` comes from this
file (frontend) and `backend/.env` (backend), so the `.env` files stay the
single source of truth. An exported `PORT` in the shell still overrides them.

## 4. Repo/Config Fixes Required Before Deploying

1. **Prisma client generation** — Prisma 7 dropped the automatic client
   generation: `@prisma/client` has no `postinstall` hook and
   `prisma migrate deploy` no longer generates it either. `npm ci` deletes
   `node_modules` (including the generated client) before reinstalling, so
   **`npm run db:generate` is mandatory after every install**, before
   `npm run build` and before `npm run db:migrate`. Skipping it fails the API
   and every seed with `Cannot find module '.prisma/client/default'`.

   > A **stale** client (generated before the models were added) fails
   > differently: the build reports
   > `Property '<model>' does not exist on type 'PrismaService'` for every
   > model added since. The Prisma types come from
   > `backend/node_modules/.prisma/client/index.d.ts` — that is the file
   > `prisma generate` writes, and the only place the model delegates come from.
   > Check it with
   > `grep -c "get tenant()" node_modules/.prisma/client/index.d.ts`.

2. **Dev dependencies must be installed** — the `prisma` CLI and `@nestjs/cli`
   are devDependencies. `npm ci` omits them when `NODE_ENV=production` is set
   in the shell that runs npm (npm's `omit` default), and `nest build` then has
   nothing to build with. Install with `npm ci --include=dev` and keep
   `NODE_ENV` unset (or `development`) in the deploy shell — `ecosystem.config.js`
   sets `NODE_ENV=production` for the app process itself, which is where it
   belongs.

3. **`--legacy-peer-deps` is mandatory for the backend** — the committed
   `backend/package-lock.json` was produced with `--legacy-peer-deps`: the
   `prisma` CLI depends on `@prisma/studio-core`, whose react peer deps are not
   in the lockfile. A plain `npm ci` therefore refuses to install:

   ```
   npm error `npm ci` can only install packages when your package.json and
   package-lock.json ... are in sync.
   npm error Missing: react@19.3.1 from lock file
   ```

   npm validates the lockfile **before** it wipes `node_modules`, so the failed
   install leaves the previous `node_modules` — and its stale Prisma client —
   in place, and the build fails with the confusing
   `Property 'tenant' does not exist on type 'PrismaService'` instead of with
   an install error. Always install the backend with
   `npm ci --include=dev --legacy-peer-deps`. The frontend needs no such flag:
   its tree resolves cleanly against React 19, so `npm ci` works there (this is
   what Vercel runs).

4. **`ecosystem.config.js` (repo root)** — it uses **relative** `cwd` paths
   (`./backend`, `./frontend`), so PM2 must be started **from the repo root**
   (`/var/www/tu-properties`). Starting it from anywhere else resolves the
   wrong directories. A plain `pm2 restart properties-api-prod` keeps the
   originally resolved paths; use `pm2 restart ecosystem.config.js --update-env`
   from the repo root after changing the file.

5. **`STORAGE_DIR` must be absolute and owned by the PM2 user**:

   ```bash
   sudo mkdir -p /var/lib/tu-properties/uploads
   sudo chown -R $USER:$USER /var/lib/tu-properties/uploads
   ```

6. **CORS is already locked down** — `backend/src/security/cors.ts` reads
   `CORS_ORIGINS` and denies everything in production when the list is empty;
   it never falls back to `*`. Just make sure
   `CORS_ORIGINS="https://properties.tuhame.co.ke"` is set (section 3).

7. **No Swagger** — the API does not mount `/api-docs` in any environment.
   Verify a live instance with `GET /` (returns `Hello World!`).

8. **Frontend API URL has no fallback** — `frontend/lib/api.ts` falls back to
   `http://localhost:3003` when `NEXT_PUBLIC_BACKEND_URL` is unset. Always set
   it explicitly (section 3); the fallback never works in production.

9. **Hand-maintained indexes** — `notifications_landlordId_readAt_idx` and
   `utility_charges_no_double_bill_bulk` exist only as raw SQL in their own
   migrations; Prisma cannot express the partial predicate. A generated
   migration proposes DROPs for both — delete those two DROP statements before
   applying, then verify with
   `SELECT indexname FROM pg_indexes WHERE indexname IN (...)`.

## 5. nginx Configuration

Site file name (per project convention — one file per sub-domain project):

`/etc/nginx/sites-available/properties.tuhame.co.ke.conf`

### DNS check before issuing certificates

Each name must resolve to this VPS's public IP before certbot runs:

```bash
curl -4 ifconfig.me                          # this server's public IP
dig +short properties.tuhame.co.ke A
dig +short api-properties.tuhame.co.ke A
dig +short properties.tuhame.co.ke A @1.1.1.1   # bypass stale local resolver
```

Let's Encrypt does its own lookups, so a stale local cache doesn't block
issuance. Before changing any record, lower its TTL to 300 seconds and wait
for the old TTL to expire.

### Step 1 — Bootstrap config (before certificates exist)

```bash
sudo nano /etc/nginx/sites-available/properties.tuhame.co.ke.conf
```

Plain HTTP blocks so certbot can issue certificates:

```nginx
# Frontend
server {
    listen 80;
    server_name properties.tuhame.co.ke www.properties.tuhame.co.ke;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Backend API
server {
    listen 80;
    server_name api-properties.tuhame.co.ke;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/properties.tuhame.co.ke.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d properties.tuhame.co.ke -d www.properties.tuhame.co.ke -d api-properties.tuhame.co.ke
```

### Step 2 — Full production config (after certificates are issued)

```bash
sudo nano /etc/nginx/sites-available/properties.tuhame.co.ke.conf
```

Replace the file contents with this complete configuration. Certbot will have
added the `ssl_certificate` lines; keep the exact paths it printed (shown
below with the default paths — adjust only if your cert names differ).

```nginx
# ---------------------------------------------------------------
# HTTP → HTTPS redirect
# ---------------------------------------------------------------
server {
    listen 80;
    server_name properties.tuhame.co.ke www.properties.tuhame.co.ke api-properties.tuhame.co.ke;
    return 301 https://$host$request_uri;
}

# ---------------------------------------------------------------
# FRONTEND — Next.js (http://127.0.0.1:3002)
# ---------------------------------------------------------------
server {
    listen 443 ssl;
    http2 on;
    server_name properties.tuhame.co.ke www.properties.tuhame.co.ke;

    ssl_certificate     /etc/letsencrypt/live/properties.tuhame.co.ke/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/properties.tuhame.co.ke/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss image/svg+xml;
    gzip_min_length 1024;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Next.js hashed build output — cache forever
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}

# ---------------------------------------------------------------
# BACKEND — NestJS API (http://127.0.0.1:3003)
# ---------------------------------------------------------------
server {
    listen 443 ssl;
    http2 on;
    server_name api-properties.tuhame.co.ke;

    ssl_certificate     /etc/letsencrypt/live/api-properties.tuhame.co.ke/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api-properties.tuhame.co.ke/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Document uploads (multipart). The API itself imposes no per-file
    # cap, so this is the only limit on an uploaded document.
    client_max_body_size 25M;

    gzip on;
    gzip_types application/json text/plain application/javascript;

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;      # long-running reports and exports
        proxy_send_timeout 300s;
    }
}
```

### Apply

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run   # verify auto-renewal works
```

### nginx Notes for This Project

- **No WebSocket upgrade headers needed** — the app has no Socket.IO or
  websocket routes. Standard proxy headers are sufficient.
- **CORS is enforced by the API, not by nginx** — the browser calls
  `https://api-properties.tuhame.co.ke` directly. `CORS_ORIGINS` in
  `backend/.env` must contain the exact frontend origin; an HTTP origin is
  rejected and an empty list denies everything.
- **HTTPS is mandatory** — the auth cookie is `secure` in production, so over
  plain HTTP the browser drops it and every request comes back unauthenticated.
- **`client_max_body_size` covers multipart only.** The API's JSON body limit
  is Express's default **100 KB**, and the bulk CSV import posts the CSV as a
  JSON string — a CSV over ~100 KB fails with `413 Payload Too Large` before
  nginx is even consulted.
- **Uploaded files are not static assets** — they are streamed through
  `GET /documents/:id/download` behind the auth guard. There is no `/uploads/`
  location to add, and the directory must never be exposed by nginx directly.
- **Do not strip or alter request bodies** on the API block. Default
  `proxy_request_buffering on` is fine; no transformations.
- Keep PostgreSQL (5432) bound to localhost — never expose it publicly.

## 6. Firewall

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

PostgreSQL (5432) stays bound to localhost.

## 7. Deployment Steps (Fresh VPS → Live)

1. Install Node 22, nginx, PostgreSQL, PM2, certbot, build-essential (step 1)
2. Create database and user (step 2)
3. Clone repo; e.g. `/var/www/tu-properties` with `backend/` and `frontend/`
4. Write production `backend/.env` and `frontend/.env` with nano (step 3)
5. Create + chown the upload dir:
   `sudo mkdir -p /var/lib/tu-properties/uploads && sudo chown -R $USER:$USER /var/lib/tu-properties/uploads` (step 4.4)
6. Backend:
   `cd backend && npm ci --include=dev --legacy-peer-deps && npm run db:generate && npm run build`,
   then `npm run db:migrate` and `npm run db:seed` (step 2)
7. Frontend: `cd frontend && npm ci && npm run build`
   (the production `.env` must already be in place — `NEXT_PUBLIC_*` is baked
   in at build time)
8. Start the processes **from the repo root** (the `cwd` paths in
   `ecosystem.config.js` are relative):
   - Both apps: `pm2 start ecosystem.config.js && pm2 save && pm2 startup`
   - Backend only: `pm2 start ecosystem.config.js --only properties-api-prod && pm2 save`
   - Frontend only: `pm2 start ecosystem.config.js --only properties-front-prod && pm2 save`

   Useful PM2 commands:
   - `pm2 list` — show app status
   - `pm2 logs [properties-api-prod|properties-front-prod] --lines 50` — view logs
   - `pm2 restart properties-api-prod` / `pm2 restart properties-front-prod` — restart one app
   - `pm2 restart ecosystem.config.js` — restart both apps
   - `pm2 stop properties-api-prod|properties-front-prod` — stop one app
   - `pm2 delete properties-api-prod|properties-front-prod` — remove one app from PM2
   - `pm2 save` — persist the process list
   - `pm2 startup` — configure PM2 to resurrect apps on boot
9. Configure nginx + SSL (step 5); point DNS A records to the VPS IP
   (`properties.tuhame.co.ke`, `api-properties.tuhame.co.ke`)
10. Enable firewall (step 6)
11. Log in as `admin@tuproperties.co.ke` / `Password123!` and change the
    password; create the real organization and users through the UI
12. Configure SMTP (email) and the SMS provider in the admin panel — the
    credentials are stored encrypted in the database, not in `.env`
13. Verify the landing page shows the intended markets and currencies
    (`NEXT_PUBLIC_LANDING_MARKETS` / `NEXT_PUBLIC_LANDING_CURRENCIES`, step 3)

## 8. Post-Deploy Verification Checklist

- [ ] `https://api-properties.tuhame.co.ke/` returns `Hello World!` through nginx
- [ ] `https://properties.tuhame.co.ke` loads; sign-in works (no CORS errors —
      confirms `CORS_ORIGINS` and `NEXT_PUBLIC_BACKEND_URL`)
- [ ] The session survives a page reload (the httpOnly `auth_token` cookie is
      sent — confirms HTTPS and same-site cookies)
- [ ] Log in as `admin@tuproperties.co.ke`; the password is changed
- [ ] Create a property, a unit and a lease through the app
- [ ] Upload a document — confirms the storage driver (a file in
      `/var/lib/tu-properties/uploads`, or an object in the S3 bucket) and the
      25 MB nginx cap
- [ ] Configure SMTP in the admin panel and send a test notification — without
      an active provider the email channel is suppressed, not delivered
- [ ] Tenant isolation: log in as an org admin and confirm only that
      organization's data is visible
- [ ] `pm2 list` shows `properties-api-prod` + `properties-front-prod` online;
      `pm2 logs` clean
- [ ] Ports as declared in the `.env` files are actually bound:
      `ss -tlnp | grep -E '300[23]'` should show the backend on 3003 and the
      frontend on 3002
- [ ] PostgreSQL port not reachable from the public internet
- [ ] HTTPS enforced (HTTP redirects), cert auto-renewal active
      (`sudo certbot certificates`)
- [ ] The API boots without `Cannot find module '.prisma/client/default'`
      (confirms `db:generate` ran)

## 9. Ongoing / Redeploy

```bash
# The repo ships a redeploy script (repo root, server_deploy_script.sh)
bash /var/www/tu-properties/server_deploy_script.sh

# or manually
cd /var/www/tu-properties/backend && git pull && npm ci --include=dev --legacy-peer-deps && npm run db:generate && npm run build && npm run db:migrate && pm2 restart properties-api-prod
cd /var/www/tu-properties/frontend && git pull && npm ci && npm run build && pm2 restart properties-front-prod
pm2 save
```

> **The backend install must use `--legacy-peer-deps`** (step 4.3). A plain
> `npm ci` fails on the committed lockfile and — because npm validates the
> lockfile before it wipes `node_modules` — leaves the *previous* `node_modules`
> and its stale Prisma client in place. The build then fails with
> `Property 'tenant' does not exist on type 'PrismaService'` for every model
> added since that client was generated. If you see that error, the client is
> stale: `rm -rf node_modules && npm ci --include=dev --legacy-peer-deps &&
> npm run db:generate && npm run build`.

> `server_deploy_script.sh` unsets `NODE_ENV` itself. With `NODE_ENV=production`
> exported, npm omits the devDependencies (the `prisma` CLI and `nest` live
> there) and `nest build` has nothing to build with. The app process still gets
> `NODE_ENV=production` from `ecosystem.config.js`, and a plain
> `pm2 restart` keeps that stored env.

- **Always back up before migrating**:
  `pg_dump -U tu_properties tu-properies > backup_$(date +%F).sql`
  (plus `tar -czf uploads_$(date +%F).tar.gz /var/lib/tu-properties/uploads`)
- `npm ci` deletes `node_modules` — including the generated Prisma client — so
  `npm run db:generate` is mandatory on every deploy.
- `NEXT_PUBLIC_*` frontend env changes require a **rebuild**, not just a restart.
- Migrations are immutable — never edit a committed one, add a new one.
- CI runs on push to `main` (`.github/workflows/ci.yml`: typecheck, unit tests,
  production build); deploys remain manual.
- Never run `db:seed:demo` against production (public `Password123!` passwords).

## 10. Storage & Uploads Ops

Uploads live on local disk by default (`STORAGE_DIR`), keyed per organization,
and are streamed to the browser through `GET /documents/:id/download` behind the
auth guard — the directory is never exposed as a static path.

### 10.1 Persistence

- `STORAGE_DIR` must be an **absolute path outside the git checkout** (section
  3 uses `/var/lib/tu-properties/uploads`) — `git pull` and fresh clones must
  never touch it.
- The API creates the directory on boot, but the PM2 user still needs ownership
  (step 4.4), otherwise writes fail with 500s.

### 10.2 Backups (required — single disk, no redundancy)

```bash
# Database + uploads, e.g. nightly via cron (adjust offsite target):
pg_dump -U tu_properties tu-properies > /backup/tu-properties_$(date +%F).sql
tar -czf /backup/tu-properties-uploads_$(date +%F).tar.gz /var/lib/tu-properties/uploads
```

Copy `/backup` offsite and test restores on a staging copy.

### 10.3 Routine checks

```bash
pm2 list && pm2 logs --lines 50
df -h /var/lib/tu-properties/uploads      # real disk usage
sudo certbot certificates
```

### 10.4 Cautions specific to this codebase

- **`STORAGE_DRIVER=s3` has no local fallback.** With wrong S3/MinIO
  credentials the upload *fails* rather than quietly landing in `uploads/` —
  and because the file is written before the Document row is created, a failed
  upload leaves no orphan row either. The failure mode to look for is the
  bucket, not the absence of local files: upload one document, then confirm the
  object exists in the bucket.
- **The demo seed deletes every organization and wipes `<backend>/uploads`**
  (the hardcoded default root) before writing its contract scans. A custom
  `STORAGE_DIR` is not cleaned — its files stay on disk while their Document
  rows are gone. Do not run `db:seed:demo` on a database whose uploaded
  documents matter.
- **Losing `NOTIFICATION_CREDENTIALS_KEY` makes stored SMS credentials
  unrecoverable** — that is the point of encrypting them, and why the admin
  panel lets a key be re-entered. Back the key up with the database.
- **`backend/.env` holds secrets** (`JWT_SECRET`, the database password,
  `NOTIFICATION_CREDENTIALS_KEY`) — never commit it, never paste it into a
  ticket.

### 10.5 Object storage follow-up (not for day one)

If uploads outgrow a single disk, set `STORAGE_DRIVER=s3` with the `S3_*`
variables (AWS or MinIO via `S3_ENDPOINT`) and stop using `STORAGE_DIR` — the
driver is selected at boot, so restart the API after changing it. Until then,
local disk plus the offsite `tar` backup above is sufficient for a demo
instance.

## 11. Seeding & Demo Data

The seeders are development tools. On production, use them deliberately:

| Command | What it does | Safe on production? |
|---------|--------------|---------------------|
| `npm run db:seed` | Super Admin + 13 roles + demo organizations (Rohi, Westhill) | Yes, on a **fresh** database — then change the admin password |
| `npm run db:seed:roles` | Roles + permission matrix only | Yes — the right choice for an empty production database |
| `npm run db:seed:demo` | **Deletes every organization** and re-seeds all 15 markets with `Password123!` | No |
| `npm run db:seed:jedan` | The Jedan Apartments dataset (1 estate, 44 units, 53 tenants) | Only as a demo dataset — run it *after* `db:seed:demo`, because the demo seed wipes organizations |
| `npm run db:backfill:unit-types` | Gives existing units a unit type and a deposit rule | Yes — safe to run twice, leaves units that already have a type alone |

The demo market is chosen with `DEMO_COUNTRY` / `DEMO_COUNTRIES`
(ISO-3166-1 alpha-2; Africa is Kenya and South Africa only). An unknown code
fails the seed loudly on purpose — a skipped market is worse than a stopped
seed. Full account list: `Testing.md`.

> Never point the demo seed at a production database: every seeded account
> shares the password `Password123!`.

## Known Blockers / Pre-Launch Summary

| Item | Status | Action |
|------|--------|--------|
| Fresh VPS | Nothing installed | Full toolchain install (step 1) |
| PostgreSQL | Not created | Create user + DB, `db:migrate`, `db:seed` (step 2) |
| Production secrets | No `.env` files yet | Write backend + frontend env (step 3); `JWT_SECRET` via `openssl rand -base64 48`, `NOTIFICATION_CREDENTIALS_KEY` via the node one-liner |
| Prisma client | Not generated | `npm run db:generate` after every `npm ci` (step 4.1) |
| CORS | Fails closed | `CORS_ORIGINS="https://properties.tuhame.co.ke"` (step 3) |
| ecosystem.config.js | Relative `cwd` paths | Always `pm2 start ecosystem.config.js` from the repo root (step 4.3) |
| `STORAGE_DIR` | Relative default (`./uploads`) | Absolute path + chown (steps 3, 4.4) |
| Super Admin password | Public default (`Password123!`) | Change on first login (steps 2, 7.11) |
| Email / SMS | Not configured | Configure SMTP + SMS in the admin panel (steps 3, 7.12) |
| M-Pesa | Pay numbers recorded per property, no gateway integrated | Set the per-property pay number; live STK push needs a gateway integration |
| SSL + DNS | No records/certs | A records + certbot for both subdomains (step 5) |
| Backups | None | `pg_dump` + uploads `tar` on a cron (step 10.2) |

# Tuhame — Production Deployment Guide (VPS)

Reusable checklist for deploying the Tuhame platform to a production VPS.

> **Editor convention:** all file edits in this guide use `nano` from the terminal
> (e.g. `sudo nano /etc/nginx/sites-available/tuhame`). In nano: paste with
> `Ctrl+Shift+V` (or right-click), save with `Ctrl+O` then `Enter`, exit with `Ctrl+X`.

## Stack Overview

| Component | Tech | Port | Process |
|-----------|------|------|---------|
| Backend | NestJS 11 + Prisma 7 + PostgreSQL | 3001 | PM2 `tuhame-api-prod` → `dist/src/main.js` |
| Frontend | Next.js 16 (`next start`) | 3000 | PM2 `tuhame-front-prod` (must be added) |
| Cache/Queues | Redis (Bull/BullMQ + ioredis) | 6379 | systemd |
| Images | MinIO AIStor (S3-compatible) via backend upload | 9000 (localhost) | systemd `minio` |
| Proxy | nginx | 80/443 | — |

- Domains: `tuhame.co.ke` (frontend), `api.tuhame.co.ke` (backend), `cdn.tuhame.co.ke` (images)
- Payments: Paystack / Pesapal / M-Pesa (live keys required — sandbox does not work in prod)
- Listing images are uploaded through the backend (multipart) to object storage, then served
  via `cdn.tuhame.co.ke` — see section 11 for the full MinIO setup.

## 1. Missing Server Software (install on VPS)

Node.js, nginx and Redis are already installed. Still required:

```bash
# PostgreSQL (REQUIRED — app cannot run without it)
sudo apt update && sudo apt install -y postgresql postgresql-contrib

# PM2 process manager (REQUIRED — deploy script depends on it)
sudo npm i -g pm2

# SSL certificates
sudo apt install -y certbot python3-certbot-nginx

# Native build deps for bcrypt (compiles from source)
sudo apt install -y build-essential python3

# Recommended: log rotation for PM2
pm2 install pm2-logrotate
```

Recommended Node version: **22 LTS** (Next.js 16 requires Node >= 20.9; backend targets `@types/node` ^22).

## 2. PostgreSQL Setup

```bash
sudo -u postgres psql
```

```sql
CREATE USER tuhame WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE tuhame OWNER tuhame;
\q
```

Then apply migrations (from `backend/`):

```bash
npx prisma migrate deploy
# optional initial data:
npm run db:seed
```

## 3. Production Environment Variables

### Backend `backend/.env`

```bash
nano backend/.env
```

> The checked-in `.env` contains dev-only values. All of the following MUST change for production.

```bash
# Application
PORT=3001
NODE_ENV=production

USE_NGROK=false

# Must be the exact production frontend origin (used by CORS)
FRONTEND_URL="https://tuhame.co.ke"

# Database (Postgres created in step 2)
DATABASE_URL="postgresql://tuhame:STRONG_PASSWORD@localhost:5432/tuhame?schema=public"

# JWT — generate: openssl rand -base64 48
JWT_SECRET="<strong-random-value>"
JWT_EXPIRES_IN="7d"

# Google OAuth (add https://tuhame.co.ke to authorized origins in Google console)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_MAPS_API_KEY="..."

# Storage — local | bunny | s3 | minio (production: "minio" — see section 11)
# NOTE: dev value points at http://205.209.121.85:9000 (private IP, HTTP) — unusable in prod
STORAGE_TYPE="minio"
S3_ENDPOINT="https://cdn.tuhame.co.ke"
BUNNY_STORAGE_ZONE=
BUNNY_API_KEY=
BUNNY_PULL_ZONE=
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
S3_BUCKET_NAME="tuhame"

# Email (verification / password reset / notifications)
SMTP_HOST="..."
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="..."
SMTP_PASS="..."
SMTP_FROM="..."
BREVO_SMTP_USER=""
BREVO_SMTP_API_KEY=""

# Payments — PAYMENT_METHOD must match frontend NEXT_PUBLIC_PAYMENT_METHOD
PAYMENT_METHOD="paystack"
MPESA_CONSUMER_KEY=""
MPESA_CONSUMER_SECRET=""
MPESA_SHORT_CODE="174379"
MPESA_PASSKEY=""
MPESA_ENV="production"        # was "sandbox"
PESAPAL_CONSUMER_KEY=""
PESAPAL_CONSUMER_SECRET=""
PESAPAL_BASE_URL="https://api.pesapal.com"
PAYSTACK_SECRET_KEY="..."     # live key

# Redis (set a password — see step 4)
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_PASSWORD="<redis-password>"

# Optional integrations
OPENAI_API_KEY=""
AFRICASTALKING_USERNAME=""
AFRICASTALKING_API_KEY=""
WHATSAPP_API_KEY=""
TELEGRAM_BOT_TOKEN=""
TELEGRAM_ADMIN_CHAT_ID=""
```

### Frontend `frontend/.env`

```bash
nano frontend/.env
```

> `NEXT_PUBLIC_*` values are baked in at BUILD TIME — set them BEFORE running `npm run build` on the server. Changing them later requires a rebuild.

```bash
NEXT_PUBLIC_BACKEND_URL=https://api.tuhame.co.ke
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
NEXT_PUBLIC_FACEBOOK_APP_ID=
NEXT_PUBLIC_PAYMENT_METHOD=paystack
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN=true
NEXT_PUBLIC_ENABLE_FACEBOOK_SIGNIN=true
```

## 4. Redis Hardening

```bash
sudo nano /etc/redis/redis.conf
```

Set (or replace) these lines:

```conf
bind 127.0.0.1
requirepass <redis-password>
```

Then:

```bash
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

Use the same password in the backend `REDIS_PASSWORD`.

## 5. Repo/Config Fixes Required Before Deploying

1. **`backend/ecosystem.config.js`** — only contains backend apps, but `server_deploy_script.sh` restarts `tuhame-front-prod`, which does not exist (PM2 restart will fail). Add a frontend entry (`nano backend/ecosystem.config.js`):

   ```js
   {
     name: 'tuhame-front-prod',
     cwd: '/var/www/tuhame/frontend',        // adjust to real path
     script: 'node_modules/.bin/next',
     args: 'start -p 3000',
     interpreter: 'node',
     instances: 1,
     autorestart: true,
     exec_mode: 'fork',
     max_memory_restart: '1G',
     env: { NODE_ENV: 'production' },
   }
   ```

2. **`server_deploy_script.sh`** — paths still reference `/home/developer/Products/...` and branches `master`/`production`. Align with the actual VPS layout and git branches (`nano server_deploy_script.sh`).

3. **Prisma schema path mismatch** — `backend/package.json` declares `prisma.schema = prisma/schema.prisma`, but the schema lives at `backend/src/prisma/schema.prisma`. Verify on the server before deploying:

   ```bash
   cd backend && npx prisma validate
   ```

4. **CORS** (`backend/src/main.ts`) — allows all `*.vercel.app` origins; ensure `FRONTEND_URL` is the production domain.

5. **Google OAuth console** — add `https://tuhame.co.ke` to authorized JavaScript origins.

## 6. nginx Configuration

### DNS check before issuing certificates

Each name must resolve to this VPS's public IP before certbot runs:

```bash
curl -4 ifconfig.me                       # this server's public IP
dig +short tuhame.co.ke A
dig +short api.tuhame.co.ke A
dig +short cdn.tuhame.co.ke A
```

If a local resolver returns a stale address, query a public resolver to confirm the record:

```bash
dig +short cdn.tuhame.co.ke A @1.1.1.1
```

Let's Encrypt does its own lookups, so a stale local cache doesn't block issuance. Before changing any record, lower its TTL to 300 seconds and wait for the old TTL to expire. Otherwise a cached answer can hold for up to 24 hours.

### Step 1 — Bootstrap config (before certificates exist)

```bash
sudo nano /etc/nginx/sites-available/tuhame
```

Plain HTTP blocks so certbot can issue certificates:

```nginx
# Frontend
server {
    listen 80;
    server_name tuhame.co.ke www.tuhame.co.ke;

    location / {
        proxy_pass http://127.0.0.1:3000;
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

# Backend API (WebSocket upgrade headers are REQUIRED for Socket.IO)
server {
    listen 80;
    server_name api.tuhame.co.ke;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3001;
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

# CDN — MinIO object storage (see section 11.8, Pass 1)
server {
    listen 80;
    server_name cdn.tuhame.co.ke;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tuhame /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tuhame.co.ke -d www.tuhame.co.ke -d api.tuhame.co.ke -d cdn.tuhame.co.ke
```

### Step 2 — Full production config (after certificates are issued)

```bash
sudo nano /etc/nginx/sites-available/tuhame
```

Replace the file contents with this complete configuration. It is self-contained — certbot
will have added the `ssl_certificate` lines; keep those exact paths it printed (shown below
with the default wildcard paths). Adjust only if your cert names differ.

```nginx
# ---------------------------------------------------------------
# HTTP → HTTPS redirect
# ---------------------------------------------------------------
server {
    listen 80;
    server_name tuhame.co.ke www.tuhame.co.ke api.tuhame.co.ke cdn.tuhame.co.ke;
    return 301 https://$host$request_uri;
}

# ---------------------------------------------------------------
# FRONTEND — Next.js (http://127.0.0.1:3000)
# ---------------------------------------------------------------
server {
    listen 443 ssl;
    http2 on;
    server_name tuhame.co.ke www.tuhame.co.ke;

    ssl_certificate     /etc/letsencrypt/live/tuhame.co.ke/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tuhame.co.ke/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Uploads go directly to storage via presigned URLs, but keep a sane cap
    client_max_body_size 25M;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss image/svg+xml;
    gzip_min_length 1024;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Next.js hashed build output — cache forever
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}

# ---------------------------------------------------------------
# BACKEND — NestJS API (http://127.0.0.1:3001)
# ---------------------------------------------------------------
server {
    listen 443 ssl;
    http2 on;
    server_name api.tuhame.co.ke;

    ssl_certificate     /etc/letsencrypt/live/api.tuhame.co.ke/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.tuhame.co.ke/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 25M;

    gzip on;
    gzip_types application/json text/plain application/javascript;

    # Socket.IO (payments websocket) requires these upgrade headers —
    # do NOT remove them or real-time payment status will break
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;      # long-running payment/webhook calls
        proxy_send_timeout 300s;
        proxy_buffering off;          # required for streaming responses
    }

    # Optional: tighter rate limit for auth endpoints
    # location /auth/ {
    #     limit_req zone=api burst=10 nodelay;
    #     proxy_pass http://127.0.0.1:3001;
    #     ...same headers as above...
    # }
}

# ---------------------------------------------------------------
# CDN — MinIO (http://127.0.0.1:9000)
# ---------------------------------------------------------------
server {
    listen 443 ssl;
    http2 on;
    server_name cdn.tuhame.co.ke;

    ssl_certificate     /etc/letsencrypt/live/cdn.tuhame.co.ke/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cdn.tuhame.co.ke/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 25M;
    proxy_request_buffering off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    # Image objects: keys are unique and immutable, so long caching is safe
    location ~* \.(jpg|jpeg|png|webp|avif|gif|svg)$ {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Optional rate-limiting zone — add to `/etc/nginx/nginx.conf` inside the `http {}` block:

```nginx
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    ...
}
```

### Apply

```bash
sudo ln -s /etc/nginx/sites-available/tuhame /etc/nginx/sites-enabled/   # once
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run   # verify auto-renewal works
```

### nginx Notes for This Project

- **API block needs WebSocket upgrade headers** — the frontend connects Socket.IO via
  `NEXT_PUBLIC_BACKEND_URL` (`usePaymentWebsocket`), so every Socket.IO poll/upgrade
  request traverses this block.
- **`client_max_body_size 25M`** — images use presigned S3/Bunny uploads and bypass
  nginx, but listing JSON payloads and any direct uploads still pass through.
- **HTTPS must be enforced** — `FRONTEND_URL` in the backend env is `https://tuhame.co.ke`,
  and CORS compares exact origins; an HTTP origin will be rejected.
- Keep Redis (6379), PostgreSQL (5432) and MinIO (9000/9001) on localhost — MinIO is reached
  only through the `cdn.tuhame.co.ke` block above.

## 7. Firewall

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Redis (6379), PostgreSQL (5432) and MinIO (9000/9001) stay bound to localhost — never expose them publicly.

## 8. Deployment Steps (Fresh VPS → Live)

1. Install PostgreSQL, PM2, certbot, build-essential (step 1)
2. Create database and user (step 2)
3. Clone repo; e.g. `/var/www/tuhame` with `backend/` and `frontend/`
4. Write production `backend/.env` and `frontend/.env` with nano (step 3)
5. Build backend: `cd backend && npm ci && npm run build && npm run prisma:generate`
6. Apply migrations: `npx prisma migrate deploy`
7. Build frontend: `cd frontend && npm ci && npm run build` (prod env vars already in place)
8. Fix and verify `ecosystem.config.js` + `server_deploy_script.sh` paths (step 5)
9. Start processes: `pm2 start ecosystem.config.js && pm2 save && pm2 startup`
10. Configure nginx + SSL (step 6); point DNS A records to the VPS IP (`tuhame.co.ke`, `api.tuhame.co.ke`, `cdn.tuhame.co.ke`)
11. Set up MinIO storage: license, bucket, public read policy, service account, nginx CDN, backend env (section 11)
12. Enable firewall (step 7); install `pm2-logrotate` (logs are written to `./logs` via ecosystem config)
13. Update Google OAuth authorized origins (step 5.5)
14. Switch payment keys from sandbox to live (step 3)

## 9. Post-Deploy Verification Checklist

- [ ] `https://api.tuhame.co.ke/health` (or any public endpoint) responds through nginx
- [ ] `https://tuhame.co.ke` loads and API calls succeed (no CORS errors)
- [ ] Socket.IO connects (payment websocket works — confirms nginx upgrade headers)
- [ ] Sign up / login / email verification email arrives
- [ ] Google sign-in works with production origin
- [ ] Create a listing with images (MinIO upload works; URL loads from `cdn.tuhame.co.ke`)
- [ ] Complete a small real payment (Paystack/M-Pesa live) and confirm subscription/premium unlock
- [ ] `pm2 list` shows both apps online; `pm2 logs` clean
- [ ] Redis, Postgres and MinIO ports not reachable from the public internet
- [ ] HTTPS enforced (HTTP redirects), certificate auto-renewal active (`sudo certbot certificates`)

## 10. Ongoing / Redeploy

```bash
# via project script (after fixing paths/branches)
bash server_deploy_script.sh production

# or manually per app
cd /var/www/tuhame/backend && git pull && npm ci && npm run build && npx prisma migrate deploy && pm2 restart tuhame-api-prod
cd /var/www/tuhame/frontend && git pull && npm ci && npm run build && pm2 restart tuhame-front-prod
```

- **Always back up the database before migrations**: `pg_dump tuhame > backup_$(date +%F).sql`
- `NEXT_PUBLIC_*` frontend env changes require a rebuild, not just a restart
- There is no CI/CD in the repo (`.github/` has no workflows); deployments are manual via the script above

## 11. MinIO Object Storage Setup (for tuhame.co.ke)

Single-node, single-drive MinIO AIStor, serving as the production image store behind
`cdn.tuhame.co.ke` (referenced in `frontend/next.config.ts`). The AIStor FREE license covers this
topology. There is no redundancy, so backups are required (11.12).

> **Secrets:** never paste passwords, access keys or secret keys into chat, commit messages or
> shell commands that land in history. If one is exposed, rotate it (11.7).

### 11.0 Install the server package

```bash
curl --progress-bar -L https://dl.min.io/aistor/minio/release/linux-amd64/minio.deb -o minio.deb
sudo dpkg -i minio.deb
sudo apt -f install          # only if dpkg reports missing dependencies
minio --version
```

The package creates the `minio-user` account, `/etc/default/minio`, and a `minio.service` unit
at `/usr/lib/systemd/system/minio.service`. Confirm:

```bash
id minio-user
systemctl cat minio | head -20
```

The service does not start automatically. You'll enable it in 11.4.

If `journalctl -u minio` shows the MinIO usage text and the service exits with status 1, the
configuration is wrong. Usually `MINIO_VOLUMES` is missing or unset in `/etc/default/minio`. Fix
11.3 and restart.

### 11.1 Install the license

The server runs in offline mode, and denies all S3 operations, until a valid license is registered.

1. Log in to https://subnet.min.io, open **Deployments**, and select **License**.
2. Save it to the license path:

```bash
sudo mkdir -p /opt/minio
sudo touch /opt/minio/minio.license
sudo nano /opt/minio/minio.license      # paste the license string, nothing else
sudo chown minio-user:minio-user /opt/minio/minio.license
sudo chmod 640 /opt/minio/minio.license
```

### 11.2 Data directory

```bash
sudo mkdir -p /mnt/minio-data
sudo chown -R minio-user:minio-user /mnt/minio-data
```

### 11.3 Configure `/etc/default/minio`

```bash
sudo nano /etc/default/minio
```

Replace the entire file with:

```conf
# Data path
MINIO_VOLUMES="/mnt/minio-data"

# Listen on localhost only. TLS is terminated by nginx, not MinIO (no -S flag).
MINIO_OPTS="--address 127.0.0.1:9000 --console-address 127.0.0.1:9001"

# Root credentials (use the admin account only for administration)
MINIO_ROOT_USER="admin"
MINIO_ROOT_PASSWORD="<STRONG-PASSWORD-min-8-chars>"

# Public URL used in presigned links. Must match the nginx site in 11.8.
MINIO_SERVER_URL="https://cdn.tuhame.co.ke"
```

Restrict the file, since it holds the root password:

```bash
sudo chown root:minio-user /etc/default/minio
sudo chmod 640 /etc/default/minio
```

Notes:

- The package default sets `MINIO_OPTS="-S /etc/minio/certs/"` and `MINIO_CONFIG_ENV_FILE`. Both are
  replaced here on purpose. The `-S` flag makes MinIO serve TLS itself, but nginx needs to proxy plain
  HTTP to port 9000.
- If you ever need the `/etc/minio/config.env` approach instead, keep `MINIO_CONFIG_ENV_FILE` in this
  file and put the credentials there as `export` lines. Don't use both for the same variables.

### 11.4 Start the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now minio
sudo journalctl -u minio -n 50 --no-pager
curl -i http://127.0.0.1:9000/minio/health/live     # expect HTTP 200
```

Expected in the log on first start:

- `First-time cluster setup completed successfully` with `Pool-0: 1/1 drives formatted and online`
- `Started minio.service`
- `API: https://cdn.tuhame.co.ke` — this is the `MINIO_SERVER_URL` value being displayed, not a sign
  that MinIO is serving TLS.
- Warnings about fewer than 8 CPUs are a performance note for a small VPS, not a failure.
- `No valid license found, running in offline mode` is expected until you register the license in 11.5.

Confirm MinIO is bound to localhost only:

```bash
sudo ss -tlnp | grep -E ':9000|:9001'     # both should show 127.0.0.1
```

The package unit reads `MINIO_VOLUMES` and `MINIO_OPTS` from `/etc/default/minio`. No unit override
is needed.

### 11.5 Install `mc` and register the license

Download the `mc` client from the AIStor download path and install it system-wide:

```bash
wget https://dl.min.io/aistor/mc/release/linux-amd64/mc -O mc
chmod +x mc
sudo mv mc /usr/local/bin/mc
sudo chmod 755 /usr/local/bin/mc
mc --version
```

Create the admin alias:

```bash
mc alias set local http://127.0.0.1:9000 admin '<MINIO_ROOT_PASSWORD>'
```

Register the license:

```bash
mc license register local --license /opt/minio/minio.license
```

Expect a warning like `Could not register cluster with SUBNET` and a registration URL. The license
still applies locally. To finish the SUBNET step:

1. Open the URL in a browser on your own computer, not the server.
2. Log in to SUBNET with the account that issued the license.
3. Approve the registration. The token is single-use, so act promptly.

Don't share the registration URL. The token ties the cluster to your account.

Verify the license and server:

```bash
mc license info local      # Plan: FREE, Product: AIStor, Nodes: 1
mc admin info local        # Cluster: Online, Drives: 1/1
```

S3 commands (such as `mc mb`) succeed only when the license is active, so this is the working check.
If the server log still shows `offline mode` after a restart, check the license file's contents and
ownership.

### 11.6 Bucket and public read

```bash
mc mb local/tuhame
mc anonymous set download local/tuhame
mc anonymous get local/tuhame        # expect: download
```

**Important:** `backend/src/utils/s3.ts` sends `ACL: 'public-read'`, but MinIO ignores that header.
The `mc anonymous set download` policy is what lets listing images load in `<img>` tags without auth.
Listing a bucket stays private under this policy, so the bucket root returns 403. That is expected.

### 11.7 Application user and service account (never use root)

Create the user, attach the policy, and create a service account for the backend:

```bash
mc admin user add local tuhame-app '<STRONG-APP-PASSWORD>'
mc admin policy attach local readwrite --user tuhame-app
mc admin user svcacct add local tuhame-app
```

The last command prints an `Access Key` and `Secret Key`. The secret is shown once. Store both in
a password manager or straight into `backend/.env` (11.9).

Note: `mc admin accesskey create` does not accept `--user`. Use `svcacct add` for application keys.

`readwrite` grants access to every bucket on this server. This server only hosts `tuhame` for now.
Restrict the policy if you add other buckets.

Test the service account. Replace the placeholders with the keys from the previous step:

```bash
mc alias set tuhame-app http://127.0.0.1:9000 '<ACCESS_KEY>' '<SECRET_KEY>'
echo test > /tmp/minio-test.txt
mc cp /tmp/minio-test.txt tuhame-app/tuhame/listings/test.txt
mc ls tuhame-app/tuhame/listings/
curl -i http://127.0.0.1:9000/tuhame/listings/test.txt     # expect HTTP 200, body "test"
mc rm tuhame-app/tuhame/listings/test.txt
rm /tmp/minio-test.txt
```

**Rotate keys** if a key or password was exposed (pasted into chat, committed, or typed into shared
history). Remove the old service account and create a new one:

```bash
mc admin user svcacct rm local <OLD_ACCESS_KEY>
mc admin user svcacct add local tuhame-app
```

**Shell history:** commands typed with a password on the command line are saved in
`~/.bash_history`. Remove those lines, or rotate the password.

### 11.8 nginx for `cdn.tuhame.co.ke`

Section 6 contains both passes of the CDN config. This subsection says where each one goes.

**Pass 1 (before certificates).** The plain-HTTP `cdn.tuhame.co.ke` block in section 6, Step 1 is
used for certificate issuance. The DNS check in section 6 must pass first.

**Pass 2 (after certificates).** The HTTPS `cdn.tuhame.co.ke` block in section 6, Step 2 replaces
Pass 1. The HTTP redirect block in Step 2 already includes `cdn.tuhame.co.ke`.

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certificates        # confirm cdn.tuhame.co.ke is listed with a valid expiry
```

The image-extension `location` is a top-level block, not nested inside `location /`. Nginx does not
allow a regex location inside a prefix location.

### 11.9 Backend `.env`

Update these values in `backend/.env` (section 3 has the full file):

```bash
STORAGE_TYPE="minio"
S3_ENDPOINT="https://cdn.tuhame.co.ke"
S3_BUCKET_NAME="tuhame"
AWS_REGION="us-east-1"                 # MinIO ignores it, but it must be non-empty
AWS_ACCESS_KEY_ID="<access key from 11.7>"
AWS_SECRET_ACCESS_KEY="<secret key from 11.7>"
```

Then restart the API:

```bash
pm2 restart tuhame-api-prod
```

### 11.10 Verify end to end

```bash
mc admin info local
mc ls local/tuhame/
curl -I https://cdn.tuhame.co.ke/tuhame/listings/<an-existing-object>
```

- `curl -I` on the public name should return a valid TLS response with HTTP 200 for an existing object.
- Public access to `127.0.0.1:9000` should fail from the internet. Check from another machine:
  `curl -m 5 http://<vps-ip>:9000/` should time out.

Then create a listing through the app and confirm the stored URL is
`https://cdn.tuhame.co.ke/tuhame/listings/...` and the image renders in the browser.

### 11.11 Console access

The console listens only on `127.0.0.1:9001`. Open it through an SSH tunnel from your own computer:

```bash
ssh -L 9001:127.0.0.1:9001 <user>@<vps-ip>
```

Then browse to `http://localhost:9001`. Don't expose the console publicly.

### 11.12 Cautions specific to this codebase

- **Silent fallback:** if MinIO credentials or the endpoint are wrong, `listings.service.ts` writes
  into the backend's local `uploads/` folder, which nginx never serves. You get broken image URLs
  rather than an error. Verify the first real upload.
- **Old image URLs:** existing rows contain `http://205.209.121.85:9000/<bucket>/...`. They work only
  while that endpoint is reachable. Either keep a catch-all for it, or migrate objects and rewrite the
  stored URLs.
- **Single drive, no redundancy:** schedule backups. Example (adjust the destination to your offsite
  target):
  ```bash
  mc mirror local/tuhame /backup/tuhame
  ```
  Add it to cron and copy the backup offsite.
- **Disk usage:** the capacity shown by `mc admin info` can include the underlying OS disk. Check
  real usage with `df -h /mnt/minio-data`.
- **Performance:** the server has one CPU. MinIO recommends eight. That's fine for a small listing
  site, but plan for more capacity before traffic grows.
- **License:** the AIStor FREE license covers this single-node, single-drive setup. If you add drives
  or nodes, check the license terms first.

### 11.13 Routine checks

```bash
sudo systemctl status minio --no-pager
mc admin info local
mc license info local
df -h /mnt/minio-data
sudo certbot certificates
```

---

## Known Blockers Summary

| Item | Status | Action |
|------|--------|--------|
| PostgreSQL | Not installed | Install + create DB + `migrate deploy` |
| Frontend PM2 entry | Missing from `ecosystem.config.js` | Add `tuhame-front-prod` app |
| PM2, certbot, build deps | Not installed | Install (step 1) |
| Production secrets | Dev values in `.env` | Regenerate/rotate all (step 3) |
| Payment mode | Sandbox | Switch to live keys |
| Storage | AIStor FREE licensed; bucket, public-read and service account created; CDN TLS issued | Finish backend `.env` (11.9), then verify (11.10) |
| SSL + DNS | `cdn.tuhame.co.ke` certificate issued | Confirm `tuhame.co.ke` and `api.tuhame.co.ke` certificates (`sudo certbot certificates`) |
| SUBNET registration | Browser step pending | Finish in SUBNET (11.5) |

# AGENTS.md

Project-specific commands and conventions for working in this repository.

## Layout
- `backend/` — NestJS + Prisma/PostgreSQL API (port 3003).
- `frontend/` — Next.js frontend (port 3002).
- `backend/src/prisma/schema.prisma` — Prisma schema (source of truth).
- `docs/` — deployment and testing guides. Product/architecture reference is `GUIDE.md`; progress and open
  tasks are `ROADMAP.md` (the single source of truth during development).

## Quick start

```bash
# Backend (from backend/, needs a local Postgres on localhost:5432, db "tu-properies")
npm run start          # or: npm run start:dev  (watch mode)
# Frontend (from frontend/)
npm run dev
```

### Watch mode and compiler memory
- `start`, `start:dev` and `build` invoke the Nest CLI through
  `node --max-old-space-size=6144` (4096 for build) instead of the bare `nest` binary. The default V8 heap is
  ~2 GB, and this project needs more: the Prisma 7 client's generated `index.d.ts` is ~16 MB for 112 models.
- `tsconfig.json` no longer emits declarations (`"declaration": false`). With declarations on, every watch
  rebuild retained a full symbol graph for `.d.ts` emit and the compiler died with
  `FATAL ERROR: Ineffective mark-compacts near heap limit` after ~20 minutes of file changes. Nothing in the
  repo consumes backend `.d.ts` files, so this costs nothing.
- `tsconfig.json` excludes `dist`, so `tsc --noEmit` no longer re-typechecks emitted declaration files.
- If you run the compiler another way (bare `nest start --watch`, an IDE, CI), set
  `NODE_OPTIONS=--max-old-space-size=6144`. Typecheck-only: `npm run typecheck`.

## Auth transport (`AUTH_MODE`)
- The session credential is an httpOnly cookie **or** a bearer token, and which one is a **deployment switch**,
  not a code change: `AUTH_MODE=cookie` (default) or `AUTH_MODE=bearer` in `backend/.env`.
- **`cookie`** — the backend sets `auth_token` (`httpOnly`, `sameSite: strict`, `secure` in production, 1h) and
  the browser sends it by itself. JavaScript never sees the token. **Only works when the frontend and the API are
  same-site** (same registrable domain): a `SameSite=Strict` cookie is never sent on a cross-site request, so a
  frontend on `*.vercel.app` calling `api-properties.tuhame.co.ke` logs in and is then bounced straight back to
  `/auth/login` by the 401 interceptor.
- **`bearer`** — the backend returns the JWT as `accessToken` in the login/register/MFA-verify response and clears
  any stale cookie; the frontend stores it in `localStorage['tu_auth_token']` and sends `Authorization: Bearer`
  (`frontend/lib/api.ts` request interceptor). Works from any origin. The JWT strategy accepts both
  (`backend/src/modules/auth/jwt.strategy.ts`).
- The frontend **auto-detects**: it stores `accessToken` when the response carries one and clears it when it does
  not, so the two modes never fight over the same browser. No frontend env var, no rebuild — flip `AUTH_MODE` on
  the API and log in again. The impersonation token (Module 19) always wins over the session token: it is set on
  `api.defaults.headers.common` and the request interceptor leaves an existing `Authorization` header alone.
- Session lifetime is 1 hour in both modes (the `Session` row's `expiresAt` is what the JWT strategy checks), so
  either way the user signs in again hourly.

## Request bodies (`rawBody`)
- The Stripe webhook verifies its signature over the untouched request bytes, and those come from Nest's own
  parser: `NestFactory.create(AppModule, { rawBody: true })` in `backend/src/main.ts`. `req.body` stays a parsed
  object, and the raw payload is copied to `req.rawBody`.
- **Do not add `app.use(express.raw({ type: 'application/json' }))` (or any other `bodyParser` middleware) in
  `main.ts`.** `app.use` registers ahead of the parser middleware that `app.listen()` installs, so a global raw
  parser consumes the stream first and leaves `req.body` as a `Buffer` for *every* JSON request: every `@Body()`
  DTO then sees `undefined` fields, and `POST /auth/login` dies inside Prisma as `where: { email: undefined }`
  (a 500 with a stack trace) — this is exactly what broke every write endpoint on 2026-11-12.
- `backend/src/main.bootstrap.spec.ts` fails the build if a global raw parser returns or the `rawBody` option is
  dropped, and the webhook itself answers 400 for a missing/forged signature and 500 if `req.rawBody` is absent.

## Database
- Connection: `postgresql://postgres:admin@localhost:5432/tu-properies?schema=public` (see `backend/.env`).
- **Prisma 7 does not generate the client on install** — `@prisma/client` has no `postinstall` hook and
  `prisma migrate deploy` no longer generates it. After any `npm install`/`npm ci` run `npm run db:generate`
  (from `backend/`, which resolves the schema via `backend/prisma.config.ts` → `src/prisma/schema.prisma`).
  A missing client fails as `Cannot find module '.prisma/client/default'` in every script that imports
  `@prisma/client` (seeds, and the API at boot). `backend/package.json` has a `postinstall` hook for it, but
  `npm ci` deletes the generated client before reinstalling, so the deploy script still calls it explicitly.
- **The backend lockfile must be installed with `--legacy-peer-deps`** — it was produced with it (the `prisma` CLI
  pulls in `@prisma/studio-core`, whose react peer deps are not in the lockfile), so a plain `npm ci` refuses to
  install: `Missing: react@19.3.1 from lock file`. npm validates the lockfile *before* it wipes `node_modules`, so
  the failed install leaves the previous `node_modules` — and its stale Prisma client — in place, and the build then
  fails with `Property 'tenant' does not exist on type 'PrismaService'` for every model added since. Use
  `npm ci --include=dev --legacy-peer-deps` in `backend/`. The frontend needs no flag — its tree resolves cleanly
  against React 19, so a plain `npm ci`/`npm install` works (this is what Vercel runs). The Prisma types come only
  from `backend/node_modules/.prisma/client/index.d.ts`; check it with
  `grep -c "get tenant()" node_modules/.prisma/client/index.d.ts`.
- **The frontend rich-text editor is `react-quill-new`, not `react-quill`** — the original `react-quill@2.0.0` declares a
  React ≤18 peer dep (which broke `npm install` on Vercel with `ERESOLVE`) and calls `ReactDOM.findDOMNode`, removed in
  React 19. `react-quill-new@3.x` supports React 16-19, uses a ref instead, and bundles Quill 2. `onChange` emits Quill 2
  *semantic* HTML (`getSemanticHTML()`), not the old `root.innerHTML` — set `useSemanticHTML={false}` for the old shape.
  Quill 2 has no `bullet` format (the `list` format covers ordered and bullet), so a `formats` whitelist naming `bullet`
  logs a Quill "Cannot register" error.
- Apply schema changes → `npx prisma db push --accept-data-loss` (dev workflow; regenerates the client).
- Seed demo data → `npm run db:seed:demo` (ts-node demo-data script).
- **`npm run db:reset:demo` drops, recreates, migrates and seeds the demo once** (`db:reset` then `db:seed`).
  Do not chain `db:seed:demo` after `db:seed` — `seed.ts` already calls `seedDemoData()`, so both together
  wiped and rebuilt the entire dataset twice and left NULL-org suppliers/accounts behind.
- **Every ts-node script runs with `-T` (transpile-only), and `db:seed` calls `seed.ts` directly instead of
  `prisma db seed`.** Type-checking loads the generated client's ~16 MB `index.d.ts`, which is what gets a
  1 GB host killed while seeding; `npm run typecheck` / `npm run build` still check these files. Keep
  `prisma.config.ts`'s seed command in sync for `prisma migrate reset`.
- **A tenant-scoped table whose `organizationId` is `onDelete: SetNull` must be deleted explicitly** in
  `seedDemoData()`'s clean block. `organization.deleteMany()` only nils the column, so anything skipped
  survives as a NULL-org orphan on every re-seed (`supplier` and `account` did). `demo-data.seed.spec.ts`
  re-seeds and fails on NULL-org suppliers/accounts or a supplier sequence that does not restart at
  `SUP-0001`.
- Seed the role matrix only → `npm run db:seed:roles`. **A permission change is not live until this runs** — the
  matrix lives in `backend/src/prisma/roles-seed.ts` and the twelve system roles are rows in the `roles` table.
  `backend/src/security/permission-keys.spec.ts` fails the build if a controller asks for a permission module the
  matrix does not declare, so add the module to `PERMISSION_MODULES` and to the roles that should hold it, then
  run this.
- Give existing units a kind of unit and a deposit rule → `npm run db:backfill:unit-types`. Safe to run twice; a
  property that already has unit types is left alone. This is the path for an estate that was created before
  `PropertyUnitType` existed.
- The demo seed's default markets are **Kenya and the United States** (`DEMO_COUNTRIES` defaults to `KE,US`). The other jurisdiction profiles still seed when asked for by code — `DEMO_COUNTRY=XX` makes XX the primary market (Rohi + Westhill); `DEMO_COUNTRIES=KE,ZA,IN` seeds a subset. Both take ISO-3166-1 alpha-2 codes and an unknown code fails the seed loudly. Market data comes from `backend/src/prisma/jurisdictions.ts` — add a country there, not as a constant in the seeder.
- **Hand-maintained indexes are invisible to Prisma and `migrate dev` will try to DROP them.** `notifications_landlordId_readAt_idx` and `utility_charges_no_double_bill_bulk` (partial unique) exist only as raw SQL in their own migrations — the schema cannot express the partial predicate, so every generated migration proposes both DROPs. 2026-10-11: a generated migration was applied with the DROPs in it and both guards silently vanished (restored same day, no violating rows). Always delete those two DROP statements from a generated migration before applying, and verify with `SELECT indexname FROM pg_indexes WHERE indexname IN (...)` afterwards.
- **The migration history can build a working schema from empty — keep it that way.** 2026-11-16: `db:reset:demo` on an empty database died twice. `20261101000000_sync_schema_with_db_push` used `ALTER TABLE … ADD CONSTRAINT IF NOT EXISTS`, which Postgres rejects (it now uses a `DO $$ … pg_constraint` guard), and the history was missing `organizations.stripeCustomerId`/`stripeSubscriptionId`, the plain `subscriptions.planId` index and JSONB types on `subscription_plans.prices`/`features`. The latter are captured by `20261116000000_sync_organization_stripe_and_plan_drift`. The dev database had been kept in line by `db push`, which is why only a fresh reset exposed it — run `db:reset:demo` against an empty database after schema work, and check `prisma migrate diff --from-config-datasource --to-schema src/prisma/schema.prisma --script` shows nothing but the two index DROPs.

## Public landing page
- The landing page (`frontend/app/page.tsx` + `frontend/components/landing/*`) is the only public face of the product.
  **Every string on it must be traceable to code, seed data or a module document.** It records payments rather than
  processing them, sends in-app/email/SMS rather than WhatsApp or push, and ships 13 seeded system roles — say what
  the code does, not what it might do.
- **The landing page is five blocks: hero, interactive engine, pricing, FAQ, final CTA.** Reference material lives on
  its own routes — `/features` (the 20 modules), `/demo` (seeded logins, deliberately `noindex`), `/security` (derived
  accounting + role matrix) and `/contact`. Pages are server components that export their own metadata;
  `components/landing/LandingLayout.tsx` supplies the navbar, footer and trial modal, and `trial-context.tsx` lets any
  section open that modal without a callback prop. Do not put a second promotional section back on the landing page —
  the previous version stacked fifteen of them and repeated three arguments five times each.
- **The platform is priced in two currencies — Kenya (KES) and the United States (USD) — but is not limited to two
  countries.** `backend/src/common/pricing-currencies.ts` holds `PRICED_CURRENCIES` (the currencies the plan catalogue
  quotes) and `DEFAULT_DEMO_MARKETS` (what the demo seed covers). It governs the priced surfaces only: the landing
  pricing table, the trial modal and `TrialSignupDto`'s currency check. Onboarding is broader — `OnboardOrganizationDto`
  accepts any ISO-4217 currency and `Organization.currency` is a free column — so an operator can run an organization
  in any of the fifteen jurisdiction profiles in `backend/src/prisma/jurisdictions.ts`. Do not turn "we price two
  currencies" into a country allow-list on onboarding.
- **Which markets and currencies the page shows is deployment configuration, not page copy:**
  `NEXT_PUBLIC_LANDING_MARKETS` (ISO-3166-1 alpha-2) and `NEXT_PUBLIC_LANDING_CURRENCIES` (ISO-4217) in
  `frontend/.env`. Both are comma-separated and **order-significant** — the order in the env file is the order on the
  page. They drive the hero market switcher, the footer chips and the demo market tabs (the jurisdiction configurator
  and market proof strip no longer exist). Unset, they default to `KE,US` and `KES,USD`.
  **A market shown on the page must be priceable.** A new priced currency needs three things: the code in the
  `PricingCurrency` union, an amount for every tier in `PRICING_PLANS` (the `Record` type makes a missing tier a compile
  error), and a symbol in `PricingSection.tsx`'s `CURRENCY_SYMBOLS` (also a `Record`, so a missing symbol is a compile
  error). `NEXT_PUBLIC_*` values are inlined at build time: change them and rebuild.
- The pricing section no longer calls `ipapi.co` and the trial modal no longer does either — with two currencies the
  visitor's IP had nothing to decide, and the call sent every visitor's address to a third party. The modal falls back
  to the browser's own time zone (`Africa/Nairobi` → KES, otherwise USD) when it is opened outside the pricing section.
- The market *profiles* (currency, locale, timezone, tax rate, telephone format, tax-ID shape, utility tariffs, rent band)
  are a hand-copy of `backend/src/prisma/jurisdictions.ts` in `frontend/components/landing/data/landingData.ts` —
  the frontend must not import backend source. Add a country there and in the frontend copy, not in a component.
- Production origin is `properties.tuhame.co.ke` (backend `api-properties.tuhame.co.ke`) — see the nginx block in
  `docs/DEPLOYMENT.md`. CORS compares origins exactly, so `backend/.env`'s `CORS_ORIGINS` must list that exact origin.

## Testing / verification
- Typecheck: `npx tsc --noEmit` (from `backend/`).
- Lint: `npm run lint` (from `backend/`). NB: the codebase has many pre-existing
  `no-unsafe-*` errors because `req.user` is typed `any` (Express.User is not augmented
  globally). This is a known baseline; do not treat a single `req.user` usage as new noise.
- Unit tests: `npx jest` (from `backend/`).

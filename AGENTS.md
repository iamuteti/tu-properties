# AGENTS.md

Project-specific commands and conventions for working in this repository.

## Layout
- `backend/` — NestJS + Prisma/PostgreSQL API (port 3003).
- `frontend/` — Next.js frontend (port 3002).
- `backend/src/prisma/schema.prisma` — Prisma schema (source of truth).
- `docs/` — module specs and database schema.

## Quick start

```bash
# Backend (from backend/, needs a local Postgres on localhost:5432, db "tu-properies")
npm run start          # or: npm run start:dev  (watch mode)
# Frontend (from frontend/)
npm run dev
```

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
  `npm ci --include=dev --legacy-peer-deps` in `backend/` (the frontend already does). The Prisma types come only
  from `backend/node_modules/.prisma/client/index.d.ts`; check it with
  `grep -c "get tenant()" node_modules/.prisma/client/index.d.ts`.
- Apply schema changes → `npx prisma db push --accept-data-loss` (dev workflow; regenerates the client).
- Seed demo data → `npm run db:seed:demo` (ts-node demo-data script).
- Seed the role matrix only → `npm run db:seed:roles`. **A permission change is not live until this runs** — the
  matrix lives in `backend/src/prisma/roles-seed.ts` and the twelve system roles are rows in the `roles` table.
  `backend/src/security/permission-keys.spec.ts` fails the build if a controller asks for a permission module the
  matrix does not declare, so add the module to `PERMISSION_MODULES` and to the roles that should hold it, then
  run this.
- Give existing units a kind of unit and a deposit rule → `npm run db:backfill:unit-types`. Safe to run twice; a
  property that already has unit types is left alone. This is the path for an estate that was created before
  `PropertyUnitType` existed.
- The demo seed covers 15 markets (KE, ZA, US, GB, CA, AU, DE, FR, IN, CN, JP, KR, BR, MX, AE) — Africa is Kenya and South Africa only. `DEMO_COUNTRY=XX` makes XX the primary market (Rohi + Westhill); `DEMO_COUNTRIES=KE,ZA,IN` seeds a subset. Both take ISO-3166-1 alpha-2 codes and an unknown code fails the seed loudly. Market data comes from `backend/src/prisma/jurisdictions.ts` — add a country there, not as a constant in the seeder.
- **Hand-maintained indexes are invisible to Prisma and `migrate dev` will try to DROP them.** `notifications_landlordId_readAt_idx` and `utility_charges_no_double_bill_bulk` (partial unique) exist only as raw SQL in their own migrations — the schema cannot express the partial predicate, so every generated migration proposes both DROPs. 2026-10-11: a generated migration was applied with the DROPs in it and both guards silently vanished (restored same day, no violating rows). Always delete those two DROP statements from a generated migration before applying, and verify with `SELECT indexname FROM pg_indexes WHERE indexname IN (...)` afterwards.

## Public landing page
- The landing page (`frontend/app/page.tsx` + `frontend/components/landing/*`) is the only public face of the product.
  **Every string on it must be traceable to code, seed data or a module document.** It records payments rather than
  processing them, sends in-app/email/SMS rather than WhatsApp or push, and ships 13 seeded system roles — say what
  the code does, not what it might do.
- **Which markets and currencies the page shows is deployment configuration, not page copy:**
  `NEXT_PUBLIC_LANDING_MARKETS` (ISO-3166-1 alpha-2) and `NEXT_PUBLIC_LANDING_CURRENCIES` (ISO-4217) in
  `frontend/.env`. Both are comma-separated and **order-significant** — the order in the env file is the order on the
  page. They drive the hero badge, the hero market switcher, the footer chips, the jurisdiction configurator, the
  market proof strip and the pricing currency switcher, and the counts in the copy are derived from them.
  **Fourteen currencies cover fifteen markets** — Germany and France share the euro — and every market's currency must
  be priceable. A new currency therefore needs three things: the code in the `PricingCurrency` union, an amount for
  every tier in `PRICING_PLANS` (the `Record` type makes a missing tier a compile error), and a symbol in
  `PricingSection.tsx`'s `CURRENCY_SYMBOLS`. `NEXT_PUBLIC_*` values are inlined at build time: change them and
  rebuild.
- The market *profiles* (currency, locale, timezone, tax rate, telephone format, tax-ID shape, utility tariffs, rent band)
  are a hand-copy of `backend/src/prisma/jurisdictions.ts` in `frontend/components/landing/data/landingData.ts` —
  the frontend must not import backend source. Add a country there and in the frontend copy, not in a component.
- Production origin is `properties.tuhame.co.ke` (backend `api-properties.tuhame.co.ke`) — see the nginx block in
  `DEPLOYMENT.md`. CORS compares origins exactly, so `backend/.env`'s `CORS_ORIGINS` must list that exact origin.

## Testing / verification
- Typecheck: `npx tsc --noEmit` (from `backend/`).
- Lint: `npm run lint` (from `backend/`). NB: the codebase has many pre-existing
  `no-unsafe-*` errors because `req.user` is typed `any` (Express.User is not augmented
  globally). This is a known baseline; do not treat a single `req.user` usage as new noise.
- Unit tests: `npx jest` (from `backend/`).

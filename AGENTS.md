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
- Apply schema changes → `npx prisma db push --accept-data-loss` (dev workflow; regenerates the client).
- Seed demo data → `npm run db:seed:demo` (ts-node demo-data script).

## Testing / verification
- Typecheck: `npx tsc --noEmit` (from `backend/`).
- Lint: `npm run lint` (from `backend/`). NB: the codebase has many pre-existing
  `no-unsafe-*` errors because `req.user` is typed `any` (Express.User is not augmented
  globally). This is a known baseline; do not treat a single `req.user` usage as new noise.
- Unit tests: `npx jest` (from `backend/`).

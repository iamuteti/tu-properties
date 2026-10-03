# Module 1: Core Platform

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status

> **Completed 2026-10-03 (backend).** Auth/security groundwork was finished in Module 0 (`01-MODULE-stabilization.md`) — CORS allowlist, httpOnly JWT cookie, httpOnly sessions backed by a server-side `Session` table, password reset, TOTP MFA, per-user session revocation, login rate limiting, and audit logging via `AuditInterceptor`. Module 1 delivers the core-platform surface that every other module depends on.

Verified as live on a running server (`backend` on `http://localhost:3003`):

- **Branches** — tenant-scoped CRUD. A `PROPERTY_MANAGER` is denied `branches.create` (403) and also denied `GET /users` (403); an org admin can create/list/update/delete branches and they are tenant-scoped.
- **Permissions engine** — structured `Role.permissions` JSON with per-module `view/create/update/delete` flags (modules: properties, units, landlords, tenants, leases, moveouts, invoices, payments, receipts, users, audit, settings, organizations, branches, documents). 12 system roles seeded (orgId = null). Legacy flat `UserRole` enum (`SUPER_ADMIN/ADMIN/PROPERTY_MANAGER/ACCOUNTANT/USER`) is mapped as a fallback so old roles still resolve to a structured role. A structured role **overrides** the legacy role: e.g. an Accountant whose only assignment is the `Tenant` role is denied `finance/invoices` (403), and removing the assignment restores access.
- **Document Center** — upload (local filesystem driver by default; S3/MinIO driver available via `STORAGE_DRIVER=s3` + `@aws-sdk/client-s3`), versioned re-uploads (same `entityType`/`entityId`/`fileName` → `version = max + 1`), paginated `GET /documents`, single `GET /documents/:id`, raw `GET /documents/:id/download` (streamed `Content-Disposition`), `DELETE /documents/:id`. Tenant-scoped: cross-tenant read returns 404; delete requires `documents.delete` (a `PROPERTY_MANAGER` is denied, 403).
- **System Settings** — `GET/PATCH /organizations/me` persists `currency`, `timezone`, `legalName`, `taxId` per org (verified end-to-end).
- **Users management** — invite (`POST /users` returns the user + a `temporaryPassword`), assign/replace roles (`PATCH /users/:id/roles`), `GET /users/roles` lists the 12 system roles.
- **Audit hardening** — `AuditInterceptor` records `LOGIN`, `MFA_*`, `PASSWORD_RESET`, `SESSIONS_REVOKED`, `CREATE/UPDATE/DELETE` rows with `ipAddress` + `userAgent`; `GET /audit` (filterable by `entity`/`action`), `GET /audit/entity/:entity/:entityId`, `GET /audit/user/:userId`, and `GET /auth/login-history` all return populated `ipAddress`.
- **Login rate limiting** — 10 attempts / 5 min per IP on `/auth/login` (returns `429` with `retryAfter`).

### Bug found & fixed during verification
`DELETE /users/:id` returned HTTP 500 because `AuditLog.userId` and `Document.uploadedBy` referenced `User` with `onDelete: Restrict`, so any user who had audit rows or had uploaded documents could not be deleted. Fixed in `backend/src/prisma/schema.prisma` by making both FKs **nullable** (`String?`) with **`onDelete: SetNull`**: deleting a user now nulls the actor reference on audit-document rows (audit history is retained, only the actor link is severed); the DB constraint was applied with `npx prisma db push` and the client regenerated.

## Module Goal

Foundation every other module depends on: organizations, branches, users, roles/permissions, audit logs, system settings, document center — and, critically, making the security/auth side of this actually production-grade.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- Organizations, users, roles CRUD — implemented (11 backend modules cover this).
- `AuditLog` Prisma model and a `logAction()` service exist, but `logAction` is never called anywhere in the codebase — no functioning audit trail today despite the model existing.
- Multi-tenant filtering via `getTenantId()` is used in queries, but RBAC is not enforced granularly at controller/DTO level — verified inconsistent (e.g. Accountant role hidden from a parent nav item while its child route stays reachable).
- JWT auth exists but token is stored in frontend `localStorage` (XSS risk); no password reset, MFA, or session revocation; no rate limiting on auth endpoints; CORS is currently wildcard.
- No document center found — no file upload/versioning/e-signature infrastructure exists yet.

## Scope / Sub-modules
- Organization Management: company profile, branches, departments, business units, multi-company support
- User & Access Control: users, roles, permissions, teams, activity logs, login history, 2FA
- System Settings: currencies, time zones, languages, tax settings, number formats, email/SMS configuration
- Document Center: file uploads, images, PDFs, versioning, e-signature support — storage via MinIO (S3-compatible)

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Identity & Organization

## Tasks Checklist
- [x] Most auth/security hardening (CORS, JWT storage, password reset, MFA, rate limiting, AuditLog wiring) is covered in Module 0 Stabilization — done 2026-10-03, Module 0 is complete (see `01-MODULE-stabilization.md`); this module's remaining tasks assume it's done
- [x] Audit existing Organization/User/Role models against `01-DATABASE-SCHEMA.md`; reconcile gaps → structured `Role`/`RoleAssignment` added (`schema.prisma` models `Role` with `permissions Json`, `RoleAssignment` on table `user_roles`); 12 system roles seeded via `backend/src/prisma/roles-seed.ts`
- [x] Confirm Branch/department support exists or add it → `BackendModule: branches` added (`Branch` model, tenant-scoped CRUD routes `GET/POST /branches`, `GET/PATCH/DELETE /branches/:id`)
- [x] Build a real, structured permissions model (`Role.permissions Json` with granular per-module CRUD flags) — current roles appear to be name-based only, not enforced per-action → `PermissionsGuard` (`backend/src/security/guards/permissions.guard.ts`) + `@Permissions()` decorator + `PermissionsService`; legacy `UserRole` enum mapped to a fallback structured role
- [x] Add login history tracking — every login now writes an audited `LOGIN` row (entity `User`, entityId = userId); MFA/SESSIONS_REVOKED/PASSWORD_RESET events audited too. `ipAddress`/`userAgent` captured on audit rows (`AuditInterceptor`); `GET /auth/login-history` and `GET /audit/user/:userId` expose them. (Login-history **UI** remains a frontend task, out of scope for this backend pass.)
- [x] Build System Settings UI + backend (currency, timezone, tax settings per org) — **backend done:** `GET/PATCH /organizations/me` persists `currency`, `timezone`, `legalName`, `taxId` per org. (Settings **UI** remains a frontend task.)
- [x] Build the Document Center from scratch: upload endpoint, storage (local filesystem driver by default, S3/MinIO when `STORAGE_DRIVER=s3`), versioning, polymorphic list-by-entity, download streaming, and evaluate e-signature (deferred to a third-party embed like DocuSign/SignRequest rather than building signing infrastructure in-house)
- [x] Build a real Settings page in the frontend — `frontend/app/(dashboard)/settings/page.tsx` exists (org profile + Security: 2FA + sessions); **backend** update endpoint for org fields now wired (`PATCH /organizations/me`). Currency/timezone/tax persistence and the User-management UI page are frontend follow-ups.

## Backend: NestJS Notes
- Modules live at `backend/src/modules/{organizations,users,permissions,branches,documents}/` plus shared guards in `backend/src/security/guards/` (`permissions.guard.ts`) and the storage abstraction in `backend/src/modules/documents/storage/`.
- Roles: seed the 12 standard roles from the master doc's role table (Super Admin, Company Admin, Property Manager, Leasing Officer, Sales Agent, Accountant, Maintenance Manager, Technician, Landlord, Tenant, Procurement Officer, HR Manager) — seeded via `src/prisma/roles-seed.ts` with `organizationId = null` (system roles).
- Document storage: local filesystem driver is the default (`LocalStorage`, rooted at `<backend>/uploads`, path-traversal guarded). To use S3/MinIO, set `STORAGE_DRIVER=s3` and provide `S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY/S3_FORCE_PATH_STYLE`. The `@aws-sdk/client-s3` package is a declared dependency.

## Frontend: Next.js Notes
- Settings page exists (`/settings` — org profile + Security: 2FA + active sessions, wired to `useAuth().organization`). Backend `PATCH /organizations/me` now persists org + legal/tax fields; the frontend Save button and currency/timezone/tax settings form are a frontend follow-up.
- User management UI (invite, deactivate, assign roles) — exists in the frontend scaffold (`frontend/app/(dashboard)/users/`) and the backend endpoints (`POST /users`, `GET /users/roles`, `PATCH /users/:id/roles`, `DELETE /users/:id`) are live; role-gated navigation is in `frontend/components/layout/sidebar.tsx`.

## Acceptance Criteria  (verified 2026-10-03)
- [x] An org admin can create branches, invite users, assign granular roles, and see a real, populated audit log.
- [x] Settings page exists and persists currency/timezone/tax settings per organization (`PATCH /organizations/me` verified).
- [x] Document upload works end-to-end (upload, list, download, version increment, 2xx on re-upload → v2).
- [x] A user with a restricted role cannot access an endpoint outside their permissions, even by calling the API directly (a `PROPERTY_MANAGER` receives 403 on `branches.create`, `GET /users`, and `documents:delete`; an accountant whose structured role is `Tenant` is denied `finance/invoices` and restored when the role is removed).

## Verification Evidence
- Full smoke suite (20 end-to-end checks incl. branches, roles/permissions override, document upload/list/download/versioning/cross-tenant isolation, login history, audit `ipAddress`): **20/20 PASS**, clean cleanup (no leftover data).
- `npx tsc --noEmit` — clean (no type errors).
- `npx jest` — 36/36 unit tests pass (5 suites).
- `npm run lint` — pre-existing baseline only (hundreds of `no-unsafe-*` on `req.user: any` across untouched files; `req.user` is not augmented globally). New Module 1 files are clean modulo the same `req.user: any` convention used project-wide.

## Dependencies on Other Modules
- Everything else depends on this module
- Workflow Engine depends on Role/permission model here
- Overlaps heavily with Module 0 Stabilization on the security side — do that first

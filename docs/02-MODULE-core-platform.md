# Module 1: Core Platform

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
CRUD exists and is real (11 backend modules cover org/user/role basics). Auth/security hardening is now done in Module 0 (CORS allowlist, httpOnly JWT cookie, password reset, TOTP MFA, session revocation, auth rate limiting, tenant-scoped `AuditLog`). Settings page now exists (org profile + Security: 2FA + active sessions). **Still missing:** structured `Role.permissions` model (name-based only), document center, system settings UI/backend, login-history UI.

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
- [ ] Audit existing Organization/User/Role models against `01-DATABASE-SCHEMA.md`; reconcile gaps
- [ ] Confirm Branch/department support exists or add it
- [ ] Build a real, structured permissions model (`Role.permissions Json` with granular per-module CRUD flags) — current roles appear to be name-based only, not enforced per-action
- [~] Add login history tracking (can reuse AuditLog with a dedicated action type once that's wired in Stabilization) — **partially done 2026-10-03:** every login now writes an audited `LOGIN` row (entity `User`, entityId = userId) and MFA/SESSIONS_REVOKED/PASSWORD_RESET events are audited too. Remaining: capture `ipAddress`/`userAgent` on audit rows (interceptor doesn't populate them yet) and build a login-history UI view
- [ ] Build System Settings UI + backend (currency, timezone, tax settings per org) — this feeds Finance module's multi-tax-jurisdiction handling
- [ ] Build the Document Center from scratch: upload endpoint, MinIO storage (S3-compatible), versioning, polymorphic list-by-entity, and evaluate e-signature (defer to a third-party embed like DocuSign/SignRequest rather than building signing infrastructure in-house)
- [~] Build a real Settings page in the frontend — **partially done 2026-10-03:** `frontend/app/(dashboard)/settings/page.tsx` is now a live page (organization profile read from `useAuth().organization`, plus a Security card: TOTP enable/disable, active-sessions list, "revoke other sessions"). Remaining: the Save button is still disabled (no backend update endpoint wired for org contact fields yet) and currency/timezone/tax settings aren't persisted

## Backend: NestJS Notes
- Module likely at `backend/src/organizations/`, `backend/src/users/`, `backend/src/roles/`, `backend/src/auth/` — check actual folder names before creating new ones.
- Roles: seed the 12 standard roles from the master doc's role table (Super Admin, Company Admin, Property Manager, Leasing Officer, Sales Agent, Accountant, Maintenance Manager, Technician, Landlord, Tenant, Procurement Officer, HR Manager) if not already seeded.
- Document storage: MinIO (S3-compatible) — already decided. Build upload endpoints on this foundation so every later module's document needs use the same storage.

## Frontend: Next.js Notes
- Settings page now exists (`/settings` — org profile + Security: 2FA + sessions); the Save button is still disabled pending a backend update endpoint.
- User management UI (invite, deactivate, assign roles) — verify exists and bring up to `00-UX-CROSS-CUTTING-STANDARDS.md` (detail view per user, row actions, etc.).

## Acceptance Criteria
- An org admin can create branches, invite users, assign granular roles, and see a real, populated audit log
- Settings page exists and persists currency/timezone/tax settings per organization
- Document upload works for at least one entity type end-to-end (upload, list, download, version increment)
- A user with a restricted role cannot access an endpoint outside their permissions, even by calling the API directly (not just a hidden UI element)

## Dependencies on Other Modules
- Everything else depends on this module
- Workflow Engine depends on Role/permission model here
- Overlaps heavily with Module 0 Stabilization on the security side — do that first

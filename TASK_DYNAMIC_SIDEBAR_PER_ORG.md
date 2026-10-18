# Task: Dynamic Per-Organization Sidebar (Super Admin Controlled Modules)

**Status:** Planning — no code written yet  
**Created:** Sun Oct 18 2026  
**Goal:** Replace the hardcoded admin-visible sidebar with a dynamic sidebar where each organization's enabled modules are controlled by a SUPER_ADMIN via the platform UI. Sidebar visibility must depend on BOTH the user's role AND whether that module is enabled for their organization.

---

## 1. Goal (one paragraph)

Today every sidebar item is hardcoded in `frontend/components/layout/sidebar.tsx` and filtered only by `user.role`. As a result, when logged in as admin, ALL modules are visible regardless of organization.

We want: a SUPER_ADMIN can toggle modules on/off **per organization** (e.g. org "Acmerent" has Maintenance + Billing enabled but HR disabled). The sidebar for ANY user (SUPER_ADMIN, ADMIN, PROPERTY_MANAGER, etc.) must then show only modules that are (a) enabled for their organization AND (b) visible to their role. SUPER_ADMIN (platform-level, no org) continues to see everything / a platform switcher.

This is **not** about route protection (API guards already exist via `@Permissions('module.action')`). It is about **what the sidebar displays**. Route access remains enforced by the backend.

---

## 2. Current state (what exists)

### Frontend
- Single sidebar: `frontend/components/layout/sidebar.tsx` (540 lines).
- `navItems: NavItem[]` is fully hardcoded (~30 groups/items, lines 95–356).
- `NavItem` type: `href`, `label`, `icon`, `roles: UserRole[]`, `badge?`, `children?`. **No `module` key.**
- Filtering (lines 405–408): `navItems.filter(item => user && item.roles.includes(user.role))`. Children filtered the same way.
- `useAuth()` from `frontend/context/auth-context.tsx` provides `user` (with `role`, `organizationId`, nested `organization`) and `organization`.
- Frontend `User` type (`frontend/types/index.ts`): no `enabledModules` field.

### Backend
- `Organization` model (`backend/src/prisma/schema.prisma`): has `plan`, `maxUsers`, `maxProperties`, `isActive`, `subscription` relation. **No `enabledModules` field.**
- `Subscription` model: `plan`, `status`, etc. **No module list.**
- `Role.permissions` JSON is per-role (not per-org) with shape `{ modules: { "<module>": { view, create, update, delete } } }`. `PERMISSION_MODULES` list exists in `backend/src/prisma/roles-seed.ts`.
- `PermissionsGuard` checks `@Permissions('module.action')`; SUPER_ADMIN bypasses.
- `getTenantId()` returns `undefined` for SUPER_ADMIN (cross-org), org-scoped otherwise.
- `GET /auth/profile` returns user + nested organization.

### Docs
- `docs/01-DATABASE-SCHEMA.md` line ~1736 proposes `SubscriptionPlan.enabledModules String[]` — **not implemented**.
- `docs/02-MODULE-core-platform.md` describes structured RBAC + sidebar role-gating.

---

## 3. Desired state

| Layer | Change |
|-------|--------|
| Data model | Organization (or Subscription) gains an `enabledModules` list of module keys. |
| Backend | SUPER_ADMIN can GET/PATCH enabled modules for an organization via `/platform/organizations/:id/modules` (or on the org detail). Profile endpoint returns caller's enabled modules. |
| Frontend | `NavItem` gains a `module` key (e.g. `'maintenance'`). Sidebar filters by `roles.includes(user.role) && enabledModules.includes(item.module)`. SUPER_ADMIN sees all (or a platform org-switcher). |
| UI | Super Admin module-toggle screen in Platform section (per-org checkbox list of modules). |

---

## 4. Module key inventory (from sidebar + backend)

Proposed canonical module keys (must match between backend enablement list and frontend `NavItem.module`):

`dashboard`, `organizations`, `properties`, `units`, `landlords`, `tenants`, `leases`, `moveouts`, `invoices`, `payments`, `receipts`, `payables`, `refunds`, `credits`, `credit-notes`, `tax`, `accounting`, `users`, `audit`, `settings`, `branches`, `documents`, `crm-leads`, `crm-contacts`, `sales`, `tenant-requests`, `notifications`, `workflows`, `approvals`, `maintenance`, `work-orders`, `assets`, `pm-schedules`, `purchase-requests`, `suppliers`, `rfqs`, `purchase-orders`, `inventory-items`, `warehouses`, `stock-movements`, `employees`, `leave-requests`, `leave-policies`, `holidays`, `payroll`, `facilities`, `facility-bookings`, `visitors`, `access-cards`, `utility-meters`, `meter-readings`, `utility-rates`, `utility-charges`, `contracts`, `reports`, `platform`, `support`.

> ⚠️ Decision needed: which of these are "always on" (e.g. Dashboard, Settings) vs togglable. See questions below.

---

## 5. Checklist (update as work progresses)

### Phase A — Data model & backend
- [x] Add `enabledModules String[]` to `Subscription` in `schema.prisma`
- [x] `prisma db push` + regenerate client
- [x] Seed/default: existing orgs get all modules enabled (ALL_MODULE_KEYS in demo-data.ts)
- [x] Backend GET endpoint: enabled modules for an org (SUPER_ADMIN) — `GET /platform/organizations/:id/modules`
- [x] Backend PATCH endpoint: set enabled modules for an org (SUPER_ADMIN) — `PATCH /platform/organizations/:id/modules`
- [x] `GET /auth/profile` returns caller's `enabledModules` (via `organization.subscription`)
- [x] Frontend types updated: `Organization.subscription?.enabledModules` in `types/index.ts`
- [x] Verify typecheck (`npx tsc --noEmit` from backend) and lint pass (backend: only pre-existing mock errors; frontend: clean)
- [x] Update `OnboardOrganizationDto` to accept `enabledModules` + `platform.service.onboard` passes it through

### Phase B — Frontend sidebar
- [x] Add `module?: string` to `NavItem` interface
- [x] Add `module` key to every `navItems` entry (leaf + group)
- [x] Fetch `enabledModules` for user's org (from `user.organization.subscription.enabledModules` via profile)
- [x] Sidebar filter: `roles.includes(user.role) && (!item.module || enabledModules.includes(item.module) || isSuperAdmin)`
- [x] SUPER_ADMIN (no org) bypasses module filter (sees all / platform view)
- [x] Hidden empty groups (group with all children disabled returns null)
- [x] Handle org-switch / profile refresh re-rendering sidebar (handled by auth context refreshProfile)

### Phase C — Super Admin module-toggle UI
- [ ] Platform org list page (already exists?) shows per-org module toggles
- [ ] Per-org "Manage modules" modal/page: checkbox per module key, save → PATCH backend
- [ ] Confirm enabled/disabled state reflects immediately (or after refresh)

### Phase D — Verification
- [x] Log in as org admin → only enabled modules show
- [x] Log in as SUPER_ADMIN → platform view / all modules
- [x] Disable a module → sidebar item disappears without page crash
- [x] Direct URL to disabled module → frontend `ModuleGuard` redirects to `/dashboard`; backend `@Permissions` guard returns 403 (defense in depth)
- [x] `npm run lint` + `npx tsc --noEmit` clean (backend); frontend typecheck/build (frontend ✅)

### Phase E — Docs & seeders
- [x] Update demo seeders for new `enabledModules` field (`seedDemoData` creates subscriptions with `ALL_MODULE_KEYS` for Westhill, Rohi, and Intl orgs)
- [x] Update `docs/00-MASTER-ARCHITECTURE.md` — new "Navigation / dynamic sidebar — per-organization module enablement" section documenting data model, frontend behavior, admin UI, and always-on vs togglable matrix

---

## 6. Bugs (log any regressions found during this task)

| # | Description | Severity | Status | Found in |
|---|-------------|----------|--------|----------|
|   |             |          |        |          |

*(Add rows as you find issues.)*

---

## 7. Decisions (all questions answered — 8/8)

| # | Question | Decision |
|---|----------|----------|
| 1 | Where does enabled-modules list live? | **Organization + Subscription combined.** Modules chosen when creating/editing a Subscription; SUPER_ADMIN can toggle an org's modules at any time. |
| 2 | Module keys + always-on | **All modules togglable except Platform** (SUPER_ADMIN only, not togglable). Always-on: Dashboard, Settings, Support. |
| 3 | SUPER_ADMIN sidebar behavior | **See all modules** (bypasses enablement). Platform group visible to SUPER_ADMIN. |
| 4 | Frontend enabledModules source | **Extend GET /auth/profile** to return `enabledModules`. |
| 5 | SUPER_ADMIN toggle UI location | **Inside Platform section** — new "Manage modules" screen at `/platform/organizations/:id/modules`, SUPER_ADMIN only. |
| 6 | Direct URL to disabled module | **Both** — backend 403 guard + frontend route guard redirect (defense in depth). |
| 7 | Empty groups | **Hide the group** if all its children are disabled for the org. |
| 8 | Module key placement | **Per-leaf (individual keys)** — every leaf NavItem has its own `module` key for fine-grained control. |

---

## 7b. Canonical togglable module keys (per-leaf)

All sidebar leaf items except Platform get a `module` key. Always-on (no `module` key / always shown subject to role): Dashboard, Settings, Support.

Togglable leaf keys (matching sidebar groups):
`maintenance`, `work-orders`, `work-orders/board`, `maintenance/assets`, `maintenance/schedules`, `procurement`, `procurement/purchase-requests`, `procurement/rfqs`, `procurement/purchase-orders`, `procurement/suppliers`, `inventory`, `inventory/items`, `inventory/warehouses`, `inventory/stock-movements`, `landlords`, `landlords/statements`, `landlords/payouts`, `properties`, `properties/units`, `crm`, `crm/leads`, `crm/contacts`, `sales`, `sales/commissions`, `tenants`, `leases`, `tenant-requests`, `moving-out`, `invoices`, `payments`, `arrears`, `payables`, `finance/suppliers`, `refunds`, `credits`, `receipts`, `rent-receipts`, `chart-of-accounts`, `journal-entries`, `trial-balance`, `hr`, `hr/employees`, `hr/leave`, `hr/payroll`, `hr/settings/payroll-rules`, `hr/me`, `facilities`, `facilities/bookings`, `facilities/visits`, `facilities/visitors`, `facilities/access-cards`, `utilities`, `utilities/readings`, `utilities/tariffs`, `utilities/billing`, `contracts`, `contracts/expiry-report`, `contracts/new`, `reports`, `users`, `branches`, `documents`, `notifications`, `approvals`.

> Note: Group headers are hidden when ALL their children are disabled (decision #7). Always-on items (Dashboard, Settings, Support) have no module key and are role-gated only.

---

## 8. Bugs (log any regressions found during this task)

| # | Description | Severity | Status | Found in |
|---|-------------|----------|--------|----------|
|   |             |          |        |          |

*(Add rows as you find issues.)*

---

## 9. Open questions (none remaining)

All design questions are answered. If a new question arises during implementation, add it here and answer before proceeding.

---

## 8. Session handoff / resume

If context is lost or a new session starts:
1. Read this file (`TASK_DYNAMIC_SIDEBAR_PER_ORG.md`).
2. Check the Checklist section for unchecked items.
3. Check the Bugs section for regressions to fix.
4. Re-read `frontend/components/layout/sidebar.tsx` and `backend/src/prisma/schema.prisma` if needed.
5. Continue from the first unchecked checklist item.

---

## 9. Relevant files

- `frontend/components/layout/sidebar.tsx` — hardcoded nav to make dynamic
- `frontend/context/auth-context.tsx` — `useAuth`, profile fetch
- `frontend/types/index.ts` — `User`, `Organization` frontend types
- `frontend/app/(dashboard)/layout.tsx` + `frontend/components/layout/dashboard-layout.tsx` — sidebar wrapper
- `backend/src/prisma/schema.prisma` — `Organization`, `Subscription`, `User`, `Role` models
- `backend/src/prisma/roles-seed.ts` — `PERMISSION_MODULES` list
- `backend/src/modules/auth/auth.controller.ts` + `auth.service.ts` — `getProfile`
- `backend/src/modules/organizations/organizations.controller.ts` — org CRUD (SUPER_ADMIN)
- `backend/src/security/guards/permissions.guard.ts` — `@Permissions('module.action')`
- `docs/00-MASTER-ARCHITECTURE.md`, `docs/01-DATABASE-SCHEMA.md`, `docs/02-MODULE-core-platform.md`

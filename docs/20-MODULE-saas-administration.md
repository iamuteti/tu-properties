# Module 19: SaaS Administration (Platform-Level)

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint

**Largely absent — but the audit that underwrote that verdict is half right in an instructive way, and the half it got wrong is the dangerous half.** The live repo has no platform-admin route group, no onboarding flow, no subscription/invoice/usage tables, and no impersonation — all of §4b's "0%" is real for the tenant-facing behaviour. But the *scaffolding those features would be built on* already exists and is inert, and two of it is broken in ways the absent feature obscures:

**1. Organization suspension is a no-op.** `Organization.isActive` exists and defaults `true`, and `usersService.findOne()` already loads the relation — but neither `auth.service.login` nor the `jwt.strategy` session check reads `organization.isActive`. Verified live by setting Westhill's `isActive = false` directly: its admin still logged in (201), and its existing token still returned data (200). An organization cannot be suspended. This is §4b row 19's most important miss, because it means the flag an operator would flip to cut off a tenant changes nothing.

**2. The organizations controller's write/list methods are tenant-blind in code shape, gated only by a class-level role decorator.** `OrganizationService.findAll/findOne/update/remove` build `findMany`/`findUnique` with **no tenant filter and no caller context in the signature** — the exact anti-pattern §2 warns against, because it makes the filter invisible to anyone reading the service. **Important correction to the first draft of this doc:** those five methods are *not* an active cross-tenant leak, because the controller class carries `@Roles(UserRole.SUPER_ADMIN)` at the top and the `me` routes are the only ones it overrides. Verified live: a Westhill admin reaches `GET /organizations`, `POST /organizations`, and `GET /organizations/:id` with 403 every time. The honest statement is sharper than "latent leak, one edit away": **the isolation is currently enforced by a decorator, not by a query, and §2's whole point is that a filter you cannot see in the code is a filter that breaks when someone reads the wrong method.** The defensive fix is to make the service tenant-aware so the invariant survives a decorator edit.

The rest of the surface is scaffolding that is declared and never enforced: `Organization.plan`, `maxUsers`, and `maxProperties` are set by the demo seed but read by nothing (a user or property create never consults them), and `POST /organizations/me` correctly whitelists what a tenant admin may change. `Organization.subdomain` and `customDomain` are real columns, but I could not find a handler that resolves a tenant from them — all routing goes through the bare tenant JWT, not a domain. Worth verifying before either is offered to customers.

The gap between this audit and the module doc's own task list is therefore **not "start from nothing" but "wire what is already shaped".** Modules that read a field that no module uses are how the same shape re-anchors: this is the `Invoice.landlordId` lesson (issue 116) again — `where: { isActive }` was not in the code, and until it is, the column is a lie told to the accountant who opens a tenant and switches them off.

## What is actually there (audit, 2026-10-07)

| Piece | State | Evidence |
|---|---|---|
| `Organization` platform fields | ✅ present, inert | `slug`, `subdomain`, `customDomain`, `plan`, `maxUsers`, `maxProperties`, `isActive`, `logoUrl`, `primaryColor`, `contactEmail`, `contactPhone`, `legalName`, `taxId` in `schema.prisma`; `plan`/`maxUsers`/`maxProperties` only ever set in `demo-data.ts` |
| `organizations.view/create/update/delete` permissions | ⚠️ no role holds any of them | `roles-seed.ts`: zero roles with an `organizations` module — issue 121 inverted |
| `GET /organizations` as SUPER_ADMIN | ✅ platform-wide, all 2 | live: returns Rohi + Westhill; as a tenant admin it is 403 only because of the vacuous permission |
| `POST /organizations/me` self-service profile | ✅ works, whitelisted | `organizations.service.updateProfile` — plan, limits, subdomain and custom domain stay platform-managed |
| `Organization.isActive` suspending users | ❌ no-op | live: Westhill deactivated → login 201, token 200 |
| `plan`/`maxUsers`/`maxProperties` enforced | ❌ never read | only `demo-data.ts` mentions them |
| Per-tenant filter on org CRUD | ❌ absent from code | `findAll/findOne/update/remove` have no `organizationId` where-clause |
| Onboarding flow (org + first admin + trial) | ❌ absent | `auth.service.register` is a raw `UserCreateInput` passthrough |
| Platform-admin route group / guard | ❌ absent | nothing under a `platform/` controller |
| `SubscriptionPlan` / `Subscription` / `PlatformInvoice` / `SupportTicket` tables | ❌ absent | no such models |
| Impersonation | ❌ absent | no such endpoint; no audit action for it |
| Usage tracking | ❌ absent | no counters anywhere |

See each task in the checklist below for how it maps onto this table. The order I would build is documented in a new section near the end.

### Verified live, 2026-10-07 (suspension)

| Check | Before fix | After fix |
|---|---|---|
| Westhill `isActive` deactivated, its admin tries to log in | **201, `admin@westhill.co.ke`** (wrong credentials) | **403** — *"This organization has been suspended. Contact your administrator."* |
| Westhich admin's existing session continues to call the API mid-suspension | **200** (data returned) | **401** — session rejected on the next request |
| Westhich admin logs in after `isActive` restored | — | **201** |
| SUPER_ADMIN (`admin@tuproperties.co.ke`, no `organizationId`) | 201 | unaffected — the exemption is structural (no org to check), not a special case |

The login path rejects with an audited `LOGIN_REFUSED_SUSPENDED_ORG`; the JWT strategy repeats the check per request so a suspended organization's tokens stop working rather than lingering until expiry. `usersService.findOne` already loaded the `organization`, so this is a flag that was being read nowhere turned into one that is read at the two points every tenant passage crosses: the front door (`validateUser`) and the hallway (every request, `JwtStrategy.validate`).

### Verified live, 2026-10-07 (org-list control)

`GET /organizations` lists **both** demo organizations (Rohi, Westhill) for a SUPER_ADMIN — its useful purpose for platform operations — and is **403** for a Westhill admin attempting to create, list, or read a foreign org across the board. The enforcement is the controller's class-level `@Roles(SUPER_ADMIN)`.

## Module Goal
Manage TU Properties itself as a multi-tenant SaaS business: onboarding orgs, subscriptions, billing, usage, and support.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No platform-admin tables or pages reported as existing.

## Scope / Sub-modules
- Tenant Management: create organizations, suspend account, subscription plans, storage limits
- Billing: monthly subscriptions, annual plans, invoices, coupons, trials
- Usage: active users, API usage, storage usage, SMS usage
- Support: tickets, knowledge base, live chat, impersonate customer

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): SaaS Administration (NOT tenant-scoped — see `01-DATABASE-SCHEMA.md` note)

## Tasks Checklist
- [ ] Add `SubscriptionPlan`, `Subscription`, `PlatformInvoice`, `SupportTicket` models per `01-DATABASE-SCHEMA.md`
- [ ] Build a Super Admin-only route group + guard, structurally separate from tenant-scoped endpoints (never share a controller with tenant endpoints — see Master doc Section 2)
- [ ] Build organization onboarding flow (create org + first admin user + trial subscription)
- [ ] Build organization suspension (blocks login for all users in that org except platform Super Admin) — **done 2026-10-07 — suspension was a no-op before today.** `Organization.isActive` existed and `usersService.findOne` already loaded the relation, but neither `auth.service.validateUser` nor `JwtStrategy.validate` read it. Verified live by deactivating Westhill and watching its admin log in 201 and its token return 200. Now: `validateUser` rejects a deactivated org's users with 403 + an audited `LOGIN_REFUSED_SUSPENDED_ORG`, and the JWT strategy re-checks on every request so existing sessions terminate rather than ride out to expiry. SUPER_ADMIN is exempt by construction (it has no `organizationId`). The column is now a claim the code keeps. **Corresponding row in `01-DATABASE-SCHEMA.md` / issue: any statement that `isActive` gates access was aspirational until today** — the honest first version of this feature. The *endpoint* to toggle a company's active state is still missing; today it is a direct DB edit (see the live check above), which is why the demo seed's organizations start `isActive: true` and nothing yet changes it through the API. That toggle is part of Phase B.
- [ ] Build usage tracking (start simple: count active users, storage used via Document sizes; API usage metering can be v2)
- [ ] Build 'impersonate customer' carefully: must be heavily audited (log every impersonation session to AuditLog with a special action type), time-limited, and visibly indicated to any staff using it
- [ ] Support ticket CRUD; knowledge base and live chat are reasonable to defer to v2 or a third-party embed

## Backend: NestJS Notes
- New module: `backend/src/platform-admin/`, entirely separate guard chain from tenant modules.
- Impersonation is a security-sensitive feature — implement it as issuing a short-lived, clearly-scoped token, not just switching session context silently.

## Frontend: Next.js Notes
- Consider a fully separate route group/subdomain for platform admin vs. the tenant dashboard, to reduce risk of UI confusion between the two contexts.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- A new organization can be onboarded end-to-end by a Super Admin and its users can immediately log in
- Suspending an organization blocks its users from logging in
- Every impersonation session is fully audited

## Dependencies on Other Modules
- Depends on: Core Platform (Organization/User model)
- Conceptually sits above all tenant modules

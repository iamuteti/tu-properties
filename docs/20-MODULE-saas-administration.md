# Module 19: SaaS Administration (Platform-Level)

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint

**Phase A (suspension) and Phase B (platform surface) are complete and verified live as of 2026-10-07.**

The live repo now has:
- A platform-admin route group at `/platform/organizations` with class-level `@Roles(SUPER_ADMIN)` — structurally separate from tenant endpoints per Master doc §2
- Organization onboarding flow: `POST /platform/organizations` creates org + first admin + `TRIALING` subscription (trialEndsAt +14d) in one transaction
- Public trial signup 2026-10-11: `POST /platform/signup` (`@Public`, 5/IP/hour) creates a STARTER 14-day trial with a server-derived slug (name \u2192 slugify, suffix retry on clash); lives on its own controller, not under the SUPER_ADMIN-guarded one. The marketing site's trial form posts here and routes to login on success. Same run fixed a real defect this surfaced: Prisma 7 P2002 `meta` has no `target` (fields nest under `driverAdapterError.cause.constraint`), so every onboard conflict misreported as "admin email" \u2014 `p2002Fields()` reads both shapes, the 409 names the field, and the `cause` carries it machine-readably for the retry.
- Organization suspension: `PATCH /platform/organizations/:id/suspend` sets `Organization.isActive=false`, `Subscription.status=SUSPENDED`, revokes all sessions, audits `ORGANIZATION_SUSPENDED`
- Organization reactivation: `PATCH /platform/organizations/:id/activate` restores `isActive=true`, returns subscription to `TRIALING` (if trial open) or `ACTIVE`, audits `ORGANIZATION_REACTIVATED`
- Platform list/read: `GET /platform/organizations` and `GET /platform/organizations/:id` with subscription + counts
- `Subscription` model + migration `20261007112858_module19_subscriptions` applied; `SubscriptionStatus` enum (TRIALING/ACTIVE/SUSPENDED/CANCELLED); `plan` kept as plain string (no `SubscriptionPlan` table — deferred to billing)
- Suspension enforced at both `auth.service.validateUser` (login 403 + audited `LOGIN_REFUSED_SUSPENDED_ORG`) and `jwt.strategy.validate` (every request 401); SUPER_ADMIN exempt by construction (no organizationId)
- Owner notifications: `OWNER_STATEMENT_READY` and `PAYOUT_PAID` fire to `landlordId` (EMAIL+SMS only, deliberately not IN_APP — no owner login yet)

The original audit's two findings are resolved:
1. **Suspension was a no-op** — now enforced at login and per-request (Phase A, committed 1ad8fbd)
2. **Org-list "latent leak"** — corrected: the controller has class-level `@Roles(SUPER_ADMIN)` so it is structurally guarded, not a live leak. The platform surface is a *new* controller, not the tenant one.

## What is actually there (audit, 2026-10-07)

| Piece | State | Evidence |
|---|---|---|
| `Organization` platform fields | ✅ present, inert | `slug`, `subdomain`, `customDomain`, `plan`, `maxUsers`, `maxProperties`, `isActive`, `logoUrl`, `primaryColor`, `contactEmail`, `contactPhone`, `legalName`, `taxId` in `schema.prisma`; `plan`/`maxUsers`/`maxProperties` only ever set in `demo-data.ts` |
| `organizations.view/create/update/delete` permissions | ⚠️ no role holds any of them | `roles-seed.ts`: zero roles with an `organizations` module — issue 121 inverted |
| `GET /organizations` as SUPER_ADMIN | ✅ platform-wide, all 2 | live: returns Rohi + Westhill; as a tenant admin it is 403 only because of the vacuous permission |
| `POST /organizations/me` self-service profile | ✅ works, whitelisted | `organizations.service.updateProfile` — plan, limits, subdomain and custom domain stay platform-managed |
| `Organization.isActive` suspending users | ✅ **enforced 2026-10-07** | Phase A: `validateUser` (login 403 + `LOGIN_REFUSED_SUSPENDED_ORG`) + `JwtStrategy.validate` (every request 401); SUPER_ADMIN exempt |
| `plan`/`maxUsers`/`maxProperties` enforced | ❌ never read | only `demo-data.ts` mentions them |
| Per-tenant filter on org CRUD | ❌ absent from code | `findAll/findOne/update/remove` have no `organizationId` where-clause |
| Onboarding flow (org + first admin + trial) | ✅ **done 2026-10-07 Phase B** | `POST /platform/organizations` → org + admin + `TRIALING` subscription in one tx; verified live: onboard → org + TRIALING subscription (trialEndsAt +14d) + admin → admin logs in 201 |
| Platform-admin route group / guard | ✅ **done 2026-10-07 Phase B** | `PlatformModule` at `/platform/organizations` with class-level `@Roles(SUPER_ADMIN)` |
| `Subscription` table | ✅ **done 2026-10-07 Phase B** | migration `20261007112858_module19_subscriptions` applied; `SubscriptionStatus` enum (TRIALING/ACTIVE/SUSPENDED/CANCELLED); `plan` string (no `SubscriptionPlan` table — deferred) |
| `SubscriptionPlan` / `PlatformInvoice` / `SupportTicket` tables | ❌ absent | deferred to billing/support modules |
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
- [x] Add `Subscription` model per `01-DATABASE-SCHEMA.md` — **done 2026-10-07 Phase B**: migration `20261007112858_module19_subscriptions` applied; `SubscriptionStatus` enum (TRIALING/ACTIVE/SUSPENDED/CANCELLED); `plan` kept as plain string (no `SubscriptionPlan` table — deferred to billing)
- [x] Build a Super Admin-only route group + guard, structurally separate from tenant-scoped endpoints — **done 2026-10-07 Phase B**: `PlatformModule` at `/platform/organizations` with class-level `@Roles(SUPER_ADMIN)`
- [x] Build organization onboarding flow (create org + first admin user + trial subscription) — **done 2026-10-07 Phase B**: `POST /platform/organizations` in one transaction; verified live. **Public self-serve 2026-10-11**: `POST /platform/signup` (STARTER, 14d, server-derived slug) wired to the marketing site's trial form
- [x] Build organization suspension (blocks login for all users in that org except platform Super Admin) — **done 2026-10-07 Phase A**: `Organization.isActive` read at `validateUser` (login 403) and `JwtStrategy.validate` (every request 401); **Phase B**: endpoint `PATCH /platform/organizations/:id/suspend` + `activate` that toggles `isActive`, revokes sessions, updates `Subscription.status`, audits
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

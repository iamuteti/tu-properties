# Module 19: SaaS Administration (Platform-Level)

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Not started per owner description. This is for the platform owner, not tenant organizations.

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
- [ ] Build organization suspension (blocks login for all users in that org except platform Super Admin)
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

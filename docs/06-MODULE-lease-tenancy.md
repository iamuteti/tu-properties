# Module 5: Lease & Tenancy

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Basic CRUD only, audit-verified — no lease templates, no e-signature, no guided renewal flow, no move-in/out inspections, and the tenant portal is confirmed absent entirely.

## Module Goal
Manage the full tenant lifecycle: leases, renewals, tenant self-service portal, occupancy history — currently this is record-keeping, not a lifecycle system.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- Tenants and emergency contacts — implemented as CRUD (`tenants/new` form is 430 lines).
- Rental agreements and leases — implemented as CRUD (`rental-agreements/new` form is 339 lines); the leases list page has a broken detail link (`frontend/app/(dashboard)/leases/page.tsx:268`).
- Move-out requests and deposit refunds — implemented as CRUD.
- Frontend list + create pages for tenants, leases, move-outs, rental agreements exist — but no detail/edit pages, confirmed by audit.
- Tenant Portal — confirmed **absent**, a major benchmark gap vs. every competitor product reviewed.
- No lease templates, no e-signature, no structured move-in/out inspection workflow — confirmed absent.

## Scope / Sub-modules
- Lease Management: creation, renewal, extension, early termination, expiry reminders
- Lease Details: tenant, unit, rent, deposit, billing cycle, start/end date, notice period
- Tenant Portal: view invoices, pay rent, download receipts, report maintenance, view lease documents
- Occupancy Tracking: current/previous tenant, move in/out history, vacancy duration

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Leasing

## Tasks Checklist
- [ ] Fix the broken leases detail link (`frontend/app/(dashboard)/leases/page.tsx:268`) — part of Module 0 Stabilization but re-flagged here since it's this module's page
- [ ] Audit existing Tenant/RentalAgreement/MoveOutRequest models against `01-DATABASE-SCHEMA.md`; reconcile gaps
- [ ] Build real lease renewal/extension/early-termination flows as explicit guided actions (confirmed currently CRUD-only, no workflow)
- [ ] Add lease templates and evaluate e-signature (likely a third-party embed, coordinate with Module Core Platform's Document Center decision)
- [ ] Build move-in/out inspection workflow (checklist, photo capture, condition report) — confirmed entirely absent
- [ ] Add expiry reminder logic once Notifications module exists; stub as a scheduled query in the meantime
- [ ] Build the Tenant Portal from scratch — confirmed absent, high-value gap: needs a TENANT-scoped auth context, invoice/lease view, and payment initiation, built as a genuinely separate experience from the staff dashboard (see SaaS Administration module notes on route separation for a similar pattern)
- [ ] Build occupancy history tracking as a queryable view (previous tenants, vacancy duration), not just implicit in RentalAgreement date ranges
- [ ] 'Report Maintenance' from tenant portal depends on Maintenance module existing — build together or stub with a simple ticket record
- [ ] Build detail/edit pages for tenants, leases, move-outs per `00-UX-CROSS-CUTTING-STANDARDS.md` — currently list+create only

## Backend: NestJS Notes
- Likely at `backend/src/tenants/`, `backend/src/leases/`, `backend/src/move-outs/` — check actual names.
- Tenant Portal endpoints need role-scoped access (a Tenant should only see their own lease/invoices, not the whole org's).

## Frontend: Next.js Notes
- Tenant-facing portal may need a different layout/route group than the staff dashboard — check if one exists or if tenants currently use the same dashboard shell.

## Acceptance Criteria
- A lease can be created, renewed, and terminated with correct occupancy status side-effects on the Unit
- A logged-in tenant can view only their own invoices/lease documents
- Move-out request produces a deposit refund calculation that's auditable

## Dependencies on Other Modules
- Depends on: Property Management (units), CRM/Contacts (optional tenant linkage)
- Feeds: Finance & Accounting (rent invoices), Notifications (expiry reminders)

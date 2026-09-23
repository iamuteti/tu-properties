# Module 3: CRM (Customers)

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Not started per owner description.

## Module Goal
Capture and manage leads through to conversion, and maintain a shared contacts database used across leasing and sales.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No CRM-specific tables or pages reported as existing yet.

## Scope / Sub-modules
- Leads: capture from website inquiries, Facebook leads, walk-ins, referrals
- Lead Pipeline: New → Contacted → Viewing scheduled → Negotiation → Won/Lost
- Contacts: buyers, tenants, landlords, investors, agents, lawyers
- Communication: email history, SMS history, WhatsApp log, notes, call log, meeting scheduling

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): CRM

## Tasks Checklist
- [ ] Add `Lead`, `Contact`, `CommunicationLog` models per `01-DATABASE-SCHEMA.md`
- [ ] Build lead capture endpoint(s) — consider a public-facing webhook endpoint for website/Facebook lead sources (secured separately from the main authenticated API)
- [ ] Build lead pipeline board UI (kanban-style) in frontend
- [ ] Build contacts CRUD, with type filtering (buyer/tenant/landlord/investor/agent/lawyer)
- [ ] Build communication log UI (timeline view per contact)
- [ ] Wire lead-to-contact conversion (Won lead creates/links a Contact)
- [ ] Decide and document: is Tenant (Lease module) a separate table from Contact, or should they be unified/linked? Recommend keeping them separate but linkable via a `contactId` reference to avoid destabilizing the existing Tenant table.

## Backend: NestJS Notes
- New module: `backend/src/crm/` (leads, contacts, communications) — create fresh, following existing module conventions in the repo.
- If integrating real Facebook Lead Ads or WhatsApp Business API, treat as a separate integration task — start with a generic webhook + manual entry first.

## Frontend: Next.js Notes
- New routes under `(dashboard)/crm/leads`, `(dashboard)/crm/contacts`.
- Kanban board: consider a lightweight custom implementation over pulling in a new heavy dependency, given existing frontend stack (React 19, Tailwind 4).
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- A lead can be created, moved through pipeline stages, and converted to a Contact
- Contacts can be filtered by type and viewed with their communication history

## Dependencies on Other Modules
- Feeds into: Sales Management (leads become sale transactions), Lease & Tenancy (contacts become tenants)

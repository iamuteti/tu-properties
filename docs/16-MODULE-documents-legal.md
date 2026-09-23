# Module 15: Documents & Legal

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Partially built — Document Center may exist under Core Platform; Contract tracking likely missing.

## Module Goal
Track contracts and legal compliance documents with expiry/renewal visibility.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- Document storage likely exists as part of Core Platform (verify) — this module adds Contract-specific tracking on top.

## Scope / Sub-modules
- Contracts: lease agreements, sale agreements, vendor contracts, management agreements
- Legal Tracking: expiry dates, renewals, compliance documents

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Legal (uses Document model from Identity & Organization domain)

## Tasks Checklist
- [ ] Add `Contract` model per `01-DATABASE-SCHEMA.md`, linking to a Document and a polymorphic related entity
- [ ] Build contract list with expiry-date sorting/filtering
- [ ] Wire expiry reminders to Notifications module
- [ ] Frontend: contracts list with status (active/expiring soon/expired) and quick access to the underlying document

## Backend: NestJS Notes
- Likely a thin module: `backend/src/contracts/`, reusing the Document Center for actual file storage.

## Frontend: Next.js Notes
- New routes under `(dashboard)/legal/` or integrated into existing entity detail pages.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- Contracts nearing expiry are visibly flagged

## Dependencies on Other Modules
- Depends on: Core Platform (Document Center)
- Feeds: Notifications

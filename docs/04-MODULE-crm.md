# Module 3: CRM (Customers)

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**Complete (backend + frontend).** Leads, the pipeline board, the shared contacts directory, the communication
timeline, lead→contact conversion and the public lead-capture webhook all exist and are verified against a live
API. Remaining work is delivery (WhatsApp/e-mail sending) and reporting, both owned by later modules.

## Module Goal
Capture and manage leads through to conversion, and maintain a shared contacts database used across leasing and sales.

## Existing Coverage in TU Properties (verified 2026-10-03)
- **No CRM tables existed at all.** `grep` for `Lead`/`Contact`/`Pipeline` models in `schema.prisma` found only
  `Tenant`/`TenantEmergencyContact`. Everything below is new.
- No CRM pages, hooks, API client entries or sidebar navigation existed.

## Scope / Sub-modules
- Leads: capture from website inquiries, Facebook leads, walk-ins, referrals
- Lead Pipeline: New → Contacted → Viewing scheduled → Negotiation → Won/Lost
- Contacts: buyers, tenants, landlords, investors, agents, lawyers
- Communication: email history, SMS history, WhatsApp log, notes, call log, meeting scheduling

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): CRM — now `leads`, `contacts`, `communication_logs` (plus
`tenants.contactId`).

## Tasks Checklist
- [x] Add `Lead`, `Contact`, `CommunicationLog` models per `01-DATABASE-SCHEMA.md`
- [x] Build lead capture endpoint(s) — consider a public-facing webhook endpoint for website/Facebook lead sources (secured separately from the main authenticated API)
- [x] Build lead pipeline board UI (kanban-style) in frontend
- [x] Build contacts CRUD, with type filtering (buyer/tenant/landlord/investor/agent/lawyer)
- [x] Build communication log UI (timeline view per contact)
- [x] Wire lead-to-contact conversion (Won lead creates/links a Contact)
- [x] Decide and document: is Tenant (Lease module) a separate table from Contact, or should they be unified/linked? → **Decided and documented below.**

## The Tenant ↔ Contact decision (task 7)

**Recommendation taken: keep `Tenant` separate, link them.** `Tenant.contactId` (unique, nullable,
`onDelete: SetNull`).

Reasoning, since this is the one structural question in the module:

- A `Tenant` is a **lease party**: it carries `accountNumber`, `code`, `taxPin`, `idNoRegNo`, status, rent
  receipts and `rentalAgreements`. It is referenced by invoices, receipts and move-out requests with
  `onDelete: Restrict`. Merging it into `Contact` would put lease-identity fields on every buyer/investor/lawyer
  row and would force a migration of every existing financial FK.
- A `Contact` is a **person we talk to**: shared by leasing and sales, free of lease state, deletable without
  touching finance.
- One-to-one (`contactId @unique`) keeps the constraint meaningful — a person is at most one tenant — while
  letting an existing tenant be linked later (the seed links three of them) and letting a contact exist with no
  tenant at all (the normal case for a buyer or a lawyer).

Cost accepted: two places to edit a name/phone. Mitigations in place — the contact detail page shows the linked
tenant and the tenant row carries `contactId`, and Module 5 (Lease & Tenancy) owns any future merge.

## What Was Built

### Schema (`backend/src/prisma/schema.prisma`)
| Model / change | Notes |
| --- | --- |
| `Lead` | `firstName`/`lastName`/`email`/`phone`/`message` (the target sketch had only `source`/`status` — a lead with no contact details cannot be worked), `source`, `sourceDetail`, `stage`, `lostReason`, `interestedPropertyId`→`Property`, `branchId`→`Branch`, `assignedAgentId`→`User`, `contactId`/`convertedAt` set on conversion. Tenant-scoped with `organizationId` (required, cascade). |
| `Contact` | `type` (BUYER/TENANT/LANDLORD/INVESTOR/AGENT/LAWYER), name, email, phone, company, notes, `isActive`. |
| `CommunicationLog` | `channel` (EMAIL/SMS/WHISAPP/CALL/NOTE/MEETING), `direction`, `subject`, `content`, `outcome`, `occurredAt`, `loggedById`. Belongs to a contact **or** a lead, so history exists before conversion. |
| `Tenant.contactId` | Unique, nullable, `SetNull` — the link described above. |
| Enums | `LeadSource` (+`WHATSAPP`), `LeadStage`, `ContactType`, `CommChannel`, `CommDirection`. |

Migration `20261003145000_module3_crm` (applied; `migrate status` clean).

### Backend (`backend/src/modules/crm/`)
- **`lead-pipeline.ts`** — pure transition rules, unit-tested: forwards/skip-ahead/backwards moves are allowed,
  `WON`/`LOST` are terminal, and **WON requires a contact** (`checkStageChange`). The board and the API only
  offer what these return.
- **`leads.service.ts`** — CRUD, filters (`stage`, `source`, `propertyId`, `branchId`, `assignedAgentId`,
  `unassigned`), search, pipeline feed (open leads only, capped at 500), CSV export.
  - `setStage` is the **only** way `stage` changes — `PATCH /crm/leads/:id` does not accept it. LOST requires a reason (400); an illegal move is a 409 with the rule's reason.
  - `convert` creates a contact from the enquiry (or links an existing one), copies the enquiry onto the contact's timeline, marks the lead WON with `convertedAt`, and can create the `Tenant` in the same step. A second conversion is refused rather than duplicating.
  - Every property/branch/agent id is tenant-checked before use (`assertReachable`).
- **`leads.controller.ts`** — `GET/POST/PATCH/DELETE /crm/leads`, `GET /crm/leads/pipeline`,
  `GET /crm/leads/export`, `PATCH /crm/leads/:id/stage`, `POST /crm/leads/:id/convert`.
- **Public webhook** — `POST /crm/public/leads` is `@Public()` and guarded by `CrmWebhookGuard`, which compares
  an `x-webhook-secret` header against `CRM_WEBHOOK_SECRET` with `timingSafeEqual`, **fails closed** when unset,
  and takes the organization from `CRM_WEBHOOK_ORGANIZATION_ID` (never from the payload). `GET /crm/public/leads`
  is a config-free liveness probe for a marketing site.
- **`contacts.service.ts` / `.controller.ts`** — CRUD, `type` filter, `engaged` filter, `GET /:id/timeline`,
  communication create/list/delete, CSV export. Linking a tenant releases any previous link first, so the
  one-to-one rule holds.
- **DTOs** with `class-validator` for every body; the global `ValidationPipe` (Module 2) strips undeclared fields.
- **RBAC** — two new permission modules `crm_leads` / `crm_contacts` in `roles-seed.ts`, granted to Super
  Admin (all), Company Admin, Property Manager, Leasing Officer (both full) and Sales Agent (leads full,
  contacts read/write). Conversion requires `crm_leads.update` **and** `crm_contacts.create`.

### Frontend
- `/crm/leads` — list **and** pipeline board (toggle), filters (stage/source/property/agent/unassigned),
  row actions, CSV export.
- `components/crm/pipeline-board.tsx` — six-column board with native HTML5 drag-and-drop; a drop calls the same
  stage endpoint, so an illegal move shows the API's refusal instead of silently reverting.
- `/crm/leads/[id]` — enquiry, stage actions, communication timeline, convert action; `/crm/leads/[id]/edit`
  and `/crm/leads/new` share one form component (single-screen on purpose: a lead is captured hot).
- `/crm/contacts` — list with type filter + "engaged only", row actions, CSV export.
- `/crm/contacts/[id]` — details, leads that produced the contact, linked tenant, full timeline;
  `/crm/contacts/new` and `/crm/contacts/[id]/edit` share `contact-form.tsx`.
- `components/crm/` — `lead-stage-actions.tsx`, `convert-lead-dialog.tsx` (new vs existing contact, optional
  tenant creation), `communication-timeline.tsx` (inline logging), `lead-stage-badge.tsx`, `pipeline-board.tsx`.
- Sidebar gained a **CRM** group (Leads & pipeline, Contacts).
- `hooks/use-leads.ts` (list + `useLeadPipeline`), `hooks/use-contacts.ts`, `hooks/use-users.ts` (assignment picker).
- Types: `Lead`, `Contact`, `Communication`, `LeadStage`, `LeadSource`, `ContactType`, `CommChannel`,
  `CommDirection`, `CreateLeadData`, `ConvertLeadData`, `LogCommunicationData`.

### Demo data
`demo-data.ts` now seeds six realistic leads — one per pipeline stage including a **won** lead that has been
converted to a contact with a call in its timeline, and a **lost** lead with a reason — plus three contacts and
three communication entries, and links three seeded tenants into the directory. Cleanup order was updated to
delete CRM rows before tenants/properties.

## Verification Performed
- `npx tsc --noEmit` clean (backend and frontend); `next build` succeeds; `npx jest` — **165/165** across 11 suites
  (was 105), including `lead-pipeline.spec.ts` (transition matrix) and `leads`/`contacts` service specs.
- New CRM source files add no lint errors on top of the documented `no-unsafe-*` baseline.
- Live API (both demo tenants): lead create → stage moves → WON refused before conversion → LOST refused without
  a reason → convert (contact **and** tenant created) → second convert refused → contact detail with timeline →
  communication log → orphan log entry refused → pipeline feed → both CSV exports → webhook accepted, wrong
  secret 401, missing secret 401.
- Cross-tenant: lead read, lead stage change and contact read all return 404 from the other organization.
- All nine new frontend routes return 200 in dev with no runtime errors.
- `npm run db:seed:demo` re-runs cleanly with the CRM section and the pipeline board renders seeded stages.

## Known Gaps / Follow-ups (not blocking)
- **Nothing is sent.** `CommunicationLog` is a record, not delivery. Module 18 (Notifications) plus the
  WhatsApp/e-mail integrations own sending; the timeline is the log they will write to.
- **One webhook secret, one organization.** Multi-tenant public capture needs per-tenant secrets
  (a `crmWebhookSecret` column on `Organization`); the current design is deliberately simple and fails closed.
- **No bulk import** for leads/contacts. Not on this module's checklist, but a lead list is usually seeded by
  pasting a spreadsheet — `common/csv.ts` already does the parsing.
- **No lead deduplication**: the same person can arrive from the website and Facebook as two leads.
  A unique constraint on `(organizationId, email)` (nullable) plus a merge flow is the fix.
- **No assignment notifications** or round-robin assignment — needs Module 18.
- **No pipeline forecast / conversion-rate report** — belongs with Module 17 (Reports & Analytics).
- **Lost leads cannot be reopened** from the UI: the rules treat WON/LOST as terminal. Reopening is a
  deliberate follow-up, not an oversight.

## Backend: NestJS Notes
- New module at `backend/src/modules/crm/` (`leads`, `contacts`), registered in `app.module.ts`.
- Facebook Lead Ads / WhatsApp Business API integration is deliberately **not** attempted here: the generic
  webhook plus manual entry is the documented starting point.

## Frontend: Next.js Notes
- Routes under `(dashboard)/crm/leads` and `(dashboard)/crm/contacts`, wired into the sidebar.
- The board is a hand-rolled HTML5 drag-and-drop — no new dependency, six static columns, no need for
  virtualisation.

## Acceptance Criteria
- [x] A lead can be created, moved through pipeline stages, and converted to a Contact
- [x] Contacts can be filtered by type and viewed with their communication history

## Dependencies on Other Modules
- Feeds into: Sales Management (leads become sale transactions), Lease & Tenancy (contacts become tenants)
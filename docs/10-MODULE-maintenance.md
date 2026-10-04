# Module 9: Maintenance Management

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Built and verified 2026-10-04. Work orders, the asset register, preventive maintenance (with a daily idempotent sweep), the resident portal report flow and a `WORK_ORDER` approval policy through the Module 18 engine. See `00-MASTER-ARCHITECTURE.md` § 4 for the module table.

## Module Goal
Manage maintenance requests end-to-end from tenant report to technician completion, plus asset tracking and preventive maintenance.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No maintenance-specific tables or pages reported as existing. Tenant portal 'report maintenance' feature (Lease & Tenancy module) depends on this.

## Scope / Sub-modules
- Work Orders: plumbing, electrical, cleaning, painting, security
- Workflow: Request → Inspection → Approval → Assignment → In progress → Completed → Closed
- Assets: elevators, generators, HVAC, water pumps, CCTV
- Preventive Maintenance: schedules, checklists, recurring tasks, technician assignments

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Maintenance

## Tasks Checklist
- [x] Add `WorkOrder`, `Asset`, `PreventiveMaintenanceSchedule` models per `01-DATABASE-SCHEMA.md`
- [x] Build work order CRUD + status transition workflow (validate legal transitions, not free-form status changes)
- [x] Build technician assignment (link to User with Technician role)
- [x] Build tenant-facing 'report an issue' flow (creates a WorkOrder with status REQUESTED)
- [x] Build asset registry per property
- [x] Build preventive maintenance scheduling (recurring due-date generation from frequencyDays)
- [x] Frontend: work order board (by status), work order detail, asset list, PM schedule calendar

## Backend: NestJS Notes
- Module lives at `backend/src/modules/maintenance/` (alongside the other modules, not `backend/src/maintenance/`).
- The daily sweep is `@Cron('0 30 2 * * *')` on `PreventiveMaintenanceService.runForAllOrganizations()`, mirroring the billing and reminder jobs. It is also exposed as `POST /maintenance/pm-schedules/run-due` so a missed day is recoverable by hand — which is safe because the unique `(pmScheduleId, pmDueOn)` constraint, not the job's memory, is what prevents a second service being raised for one period.

## Frontend: Next.js Notes
- Routes under `(dashboard)/maintenance/`: `work-orders`, `work-orders/board`, `work-orders/new`, `work-orders/[id]`, `work-orders/[id]/edit`, `assets`, `assets/new`, `assets/[id]`, `assets/[id]/edit`, `schedules`. Plus `app/(portal)/portal/maintenance` for the resident.
- Shared pieces: `components/maintenance/work-order-action-dialog.tsx` (one dialog for every transition, because each action asks for exactly what it needs), `work-order-form.tsx`, `asset-form.tsx`, `components/portal/maintenance-panel.tsx`, and `hooks/use-maintenance.ts`.
- The board uses the existing generic `KanbanBoard`. A drop calls the matching transition endpoint; four of the seven drops open the action dialog instead, because approving, assigning, inspecting and completing all need a value the board cannot invent.

## Decisions Taken (read before changing them)
- **`CANCELLED` was added to the documented pipeline.** The spec's chain has no terminal state for "this is not our problem". Without it, a duplicate or a tenancy dispute has to be *completed* with a resolution note saying nothing happened — which is a lie in the one field a resident reads.
- **Approval and assignment are one action** (`POST /:id/approve` takes a `technicianId`). An APPROVED work order nobody is assigned to is the classic way a job dies: it is off the technician's screen and in nobody's mental queue. Where an organization has configured a `WORK_ORDER` approval policy the engine runs first (`POST /:id/request-approval`) and the work order lands in APPROVED for assignment afterwards.
- **Emergency fast-track.** An `EMERGENCY` work order can be assigned from `REQUESTED` without inspection or approval. A burst pipe cannot wait for two levels of sign-off, and this is the only documented shortcut out of the ordered pipeline. Every other priority goes through the gates.
- **The response window is derived, not stored.** `RESPONSE_HOURS` per priority (24h / 72h / 7d / 30d) lives in `work-order-lifecycle.ts`; `overdue` and `hoursRemaining` are computed on read. A stored `dueAt` is a second thing to keep in step, and the version anybody would edit by hand is the one they disagree with.
- **`availableActions` vs what will succeed.** `offerableWorkOrderActions()` assumes the inputs an action carries with it (the technician, the note, the reason) and enforces only conditions about the record itself (`openTasks`). The buttons therefore appear where you would attempt the action, and the server's refusal — "2 checklist items are still open" — is shown in the dialog instead of being hidden behind a missing button.
- **`Unit`/`Property`/`Tenant`/`Asset`/`User` references are all tenant-verified before connect** (master doc issue 26 was exactly this bug in units).
- **`UserRole` gained `MAINTENANCE_MANAGER` and `TECHNICIAN`.** The seeded roles already existed with permissions nobody could hold, and a work order with nobody to assign it to is the same hole Module 5 found for the leasing role (issues 51/54).
- **Approving a `MAINTENANT` tenant request now files a work order** (`TenantRequestsService` delegates to `WorkOrdersService`) instead of recording `RECORDED_ONLY`.

## Acceptance Criteria
- [x] A tenant-reported issue becomes a WorkOrder visible to Maintenance Manager, assignable to a Technician, and progresses through all statuses to Closed — verified live against the demo data (portal report → `REQUESTED` → `INSPECT` → `APPROVE`+assign → `START` → `COMPLETE` → `CLOSE`), including the refusals for every illegal shortcut.
- [x] Preventive maintenance schedules generate due work orders automatically — daily sweep plus a by-hand `run`; a duplicate period is reported as skipped, and a retired asset is never serviced.

## Not Included (deliberate, for a follow-up module)
- No link to `SupplierBill`/Accounts Payable: actual costs are recorded as a figure, and turning a repair into a supplier bill is Finance's job. The work order's `actualCost` is the handoff.
- No resident-side photo upload, appointment booking, or per-unit `UnitStatus → MAINTENANCE` coupling. The units module already exposes a status endpoint; the work order is deliberately not a second way to set it.
- No recurrence expansion (a weekly job rolling out into eight dated visits) — `frequencyDays` + `nextDueAt` is the whole model, and the sweep rolls it forward one period at a time.

## Dependencies on Other Modules
- Depends on: Property Management (units/properties), Core Platform (technician role)
- Feeds: Reports & Analytics

# Module 9: Maintenance Management

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Not started per owner description.

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
- [ ] Add `WorkOrder`, `Asset`, `PreventiveMaintenanceSchedule` models per `01-DATABASE-SCHEMA.md`
- [ ] Build work order CRUD + status transition workflow (validate legal transitions, not free-form status changes)
- [ ] Build technician assignment (link to User with Technician role)
- [ ] Build tenant-facing 'report an issue' flow (creates a WorkOrder with status REQUESTED)
- [ ] Build asset registry per property
- [ ] Build preventive maintenance scheduling (recurring due-date generation from frequencyDays)
- [ ] Frontend: work order board (by status), work order detail, asset list, PM schedule calendar

## Backend: NestJS Notes
- New module: `backend/src/maintenance/`.
- Consider a scheduled job to auto-create WorkOrders from due PreventiveMaintenanceSchedule entries.

## Frontend: Next.js Notes
- New routes under `(dashboard)/maintenance/`.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- A tenant-reported issue becomes a WorkOrder visible to Maintenance Manager, assignable to a Technician, and progresses through all statuses to Closed
- Preventive maintenance schedules generate due work orders automatically

## Dependencies on Other Modules
- Depends on: Property Management (units/properties), Core Platform (technician role)
- Feeds: Reports & Analytics

# Module 12: HR & Payroll

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Not started per owner description. Consider scope carefully (see notes).

## Module Goal
Manage internal staff records, attendance/leave, and payroll.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No HR-specific tables or pages reported as existing.

## Scope / Sub-modules
- Employees: staff profiles, departments, contracts
- Attendance: check-in/out, leave, holidays
- Payroll: salary, allowances, deductions, payslips

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): HR & Payroll

## Tasks Checklist
- [ ] Build in-house payroll with configurable statutory rules engine: statutory deduction rules (tax brackets, contribution rates, etc.) managed via admin panel per country/jurisdiction — not hardcoded. Basic payslip model (gross, deductions, net) in v1 with calculation driven by configured rules. Kenya (PAYE, NSSF, NHIF/SHIF, Housing Levy) as default baseline configuration; additional countries added via configuration.
- [ ] Add `Employee`, `LeaveRequest`, `Payslip` models per `01-DATABASE-SCHEMA.md`
- [ ] Build employee CRUD, optionally linked to an existing User record
- [ ] Build leave request + approval flow
- [ ] Build basic payslip creation (manual entry of gross/deductions/net for v1, with calculation driven by configurable statutory rules — automated statutory calculation per jurisdiction)
- [ ] Frontend: employee list, leave calendar, payslip history

## Backend: NestJS Notes
- New module: `backend/src/hr/`.

## Frontend: Next.js Notes
- New routes under `(dashboard)/hr/`.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- An employee record can be created and linked to leave requests and payslips
- Leave requests follow an approve/reject flow

## Dependencies on Other Modules
- Depends on: Core Platform (User linkage)

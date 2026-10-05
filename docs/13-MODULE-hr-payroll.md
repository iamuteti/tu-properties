# Module 12: HR & Payroll

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint

✅ **COMPLETE 2026-10-05** (backend 2026-10-05, frontend closed 2026-10-05). **This line said "Not started" until 2026-10-05 and was wrong** — see *Docs that were stale* at the bottom for the whole story, because it is the reason this module sat undone while a complete backend sat in the tree.

## Module Goal
Manage internal staff records, attendance/leave, and payroll.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No HR-specific tables or pages reported as existing.

> Superseded. Everything below this line was built from scratch; nothing was inherited.

## Scope / Sub-modules
- Employees: staff profiles, departments, contracts
- Attendance: check-in/out, leave, holidays
- Payroll: salary, allowances, deductions, payslips

**Attendance is the one sub-module deliberately not built.** Check-in/out is a clock, and a clock is not payroll: it needs a terminal story (web app? badge reader? phone?), a rounding policy, and an overtime rule, none of which this repo can decide for you. Leave carries the `OFF_DUTY` and `COMPENSATORY` types that a time-off-in-lieu arrangement actually needs, and the `workingDays` figure on every request is computed from the calendar rather than from a clock. Recorded as issue 91 below.

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): HR & Payroll.

## Tasks Checklist
- [x] Build in-house payroll with configurable statutory rules engine: statutory deduction rules (tax brackets, contribution rates, etc.) managed via admin panel per country/jurisdiction — not hardcoded. Basic payslip model (gross, deductions, net) in v1 with calculation driven by configured rules. Kenya (PAYE, NSSF, NHIF/SHIF, Housing Levy) as default baseline configuration; additional countries added via configuration. — **done**: `PayrollRule` + `PayrollCalculationBase` / `PayrollBearer` / `PayrollPeriodMode` / `PayrollRuleType` / `PayrollDeductionKind` enums, `backend/src/prisma/payroll-rules-seed.ts` for the Kenya baseline, `/hr/settings/payroll-rules` as the admin panel (coverage warning, rule table, create/edit/retire, and a `preview` that runs a hypothetical salary through the engine for any ISO country — which is how a new country is planned rather than guessed at)
- [x] Add `Employee`, `LeaveRequest`, `Payslip` models per `01-DATABASE-SCHEMA.md` — **done, and deliberately wider than the sketch**: see *What was built* below
- [x] Build employee CRUD, optionally linked to an existing User record — **done**: `/hr/employees` list + detail + create/edit, `link-user`, `terminate`
- [x] Build leave request + approval flow — **done**: request → workflow engine (`LEAVE_REQUEST`) or direct approve/reject, balances derived from the calendar
- [x] Build basic payslip creation, calculation driven by configurable statutory rules — **done**: payroll runs, `calculate → approve → post → pay → void`, the run posted as one journal entry through Module 7
- [x] Frontend: employee list, leave calendar, payslip history — **done**: all three, plus payroll runs, payslip detail and the statutory-rules panel

## What was built

**Backend** — `backend/src/modules/hr/` (registered in `app.module.ts`):

| File | What it holds |
|---|---|
| `employees.service.ts` | The directory split: `DIRECTORY_SELECT` physically cannot include compensation, `findOne` requires `employees.compensation`. Also leave balance and termination. |
| `leave.service.ts` / `leave-policy.ts` | The request flow and the pure policy arithmetic (working days, balances, clashes, notice). |
| `payroll-calc.ts` | The engine: 100% pure, integer cents, unit-tested. |
| `payroll-rules.service.ts` | Rule CRUD, `coverageFor`, `preview`, CSV. |
| `payroll-runs.service.ts` | The run lifecycle and payslip reads, including the self-service ones. |
| `hr-self-service.controller.ts` | `/hr/me/*`. **Not one route takes an employee id** — the caller is resolved from the login and an `employeeId` in the body is discarded with a message saying so. |
| `hr-roles.ts` | The three role tiers in one file, because four controllers each declaring their own list is how "who can see a salary?" stops having an answer. |

**Migrations** — `20261005075659_module12_hr_payroll`, `…_payroll_rule_sort_order`, `…_payroll_rule_amount`, `…_payroll_journal_source`, `20261005103406_module12_hr_manager_role`.

**Frontend** — `/hr/employees` (list, detail, new, edit), `/hr/leave` (list, detail, new, balances, calendar), `/hr/payroll` (list, detail), `/hr/payslips/[id]`, `/hr/settings/payroll-rules`, `/hr/me` (account), `/hr/me/leave` (list, new), `/hr/me/payslips/[id]`.

## Backend: NestJS Notes
- New module: `backend/src/modules/hr/` (not `backend/src/hr/` as the original note said — every other module lives under `modules/`).
- Every state change is a **named action**, never a `PATCH` with a `status` field: `leave/:id/approve|reject|cancel`, `payroll-runs/:id/calculate|approve|post|pay|void`. `PUT /hr/payroll-runs/:id` does not exist, so no client can skip past the ledger posting.
- `status` is in no update DTO.
- `payroll.pay` is a separate permission from `payroll.approve`: the person who signs off the figures and the person who releases the money are two acts, and collapsing them is how a payroll gets approved by whoever built it.

## Frontend: Next.js Notes
- Routes under `(dashboard)/hr/` — bare `/hr/...`, **no `/dashboard` prefix** (route groups do not contribute to URLs; master doc §3.3).
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md`: every page here has a detail page, an edit path or a real action set, row actions, a CSV export and shared loading/empty/error states. Payroll status transitions are the `PAYROLL_RUN_SEQUENCE` buttons, not a status dropdown.
- Sidebar role lists are copied from `hr-roles.ts`, and a group's children are **role-filtered** (this was not true before 2026-10-05 — see issue 92).

## Acceptance Criteria
- ✅ An employee record can be created and linked to leave requests and payslips
- ✅ Leave requests follow an approve/reject flow

## Dependencies on Other Modules
- Depends on: Core Platform (User linkage)
- Depends on: Finance & Accounting (a run posts as **one journal entry** through `AccountingService.postEntry`; `PayrollRule.ledgerAccountCode` must exist in the chart of accounts or the coverage report says so)
- Depends on: Workflow Engine (the `LEAVE_REQUEST` policy, with a direct approve as the no-policy fallback)
- Depends on: Notifications (approval decisions dispatch from the leave service)

## New issues found 2026-10-05 (Module 12 pass)

91. Open: **attendance does not exist.** The module's scope names "check-in/out" and there is no `Attendance` model, no timesheet, and no clock. Deliberate rather than forgotten — see *Scope* above for why a clock is a product decision and not a module — but it is the one checklist sub-module with nothing behind it, and it should not be described as delivered.

92. ✅ **the sidebar rendered a group's children without filtering them by role.** `renderNavItem` mapped `item.children` unconditionally while the top level was filtered, so every role list written on a child was decorative. This is the exact "hide a parent, leave the child reachable" inconsistency `00-UX-CROSS-CUTTING-STANDARDS.md` names, and it is why `/hr/payroll` was invisible to an accountant: nobody had written the route yet, so the only place to have found it was a nav item that the child filter would have removed. Children are filtered now, and the HR lists are the backend's three tiers rather than one invented list.

93. ✅ **the frontend did not compile.** 175 `tsc` errors, all of them in Module 12's own files, none of them pre-existing elsewhere: components used without importing them (`Card`, `Table*`, `StatusBadge`, `Span`), `@/components/ui/status-badge` which has never existed (`StatusBadge` lives in `entity-states.tsx`), untyped `useState(null)`/`useState([])` collapsing to `never` and `never[]`, `date-fns` imported in three files and not a dependency of this project, and `payslip-display.tsx` referencing `line.id` on a type with no `id` while importing nothing it rendered. `next build` was failing, so no HR page could have been reached in a browser at all. Fixed rather than worked around, and the lesson is the one from master doc issue 52: **a type-only or missing import on a rendered symbol is a build failure, not a rendering detail.**

94. ✅ **`EmployeeDetail` and `GET /hr/me` were modelled as the same shape, and they are not.** The directory read runs `directoryView` and returns `displayName`/`hasLogin`/`tenureYears`; the single-record read spreads the row and does not; the self read attaches neither payslips nor components. One type extended for all three, so a page could read a field that was never fetched and render `undefined` as though it were a value. Split into `EmployeeCore` / `EmployeeRow` / `EmployeeDetail` / `EmployeeSelf`, and `PayslipDetail.employee` is optional because the self-service read does not attach it.

95. ✅ **the employee form offered enum values the database rejects.** `BI-WEEKLY` and `CONTRACTOR` are not values of `PayFrequency` or `EmploymentType`; the enum has `FORTNIGHTLY` and `CONTRACT`. The dropdowns now read the shared constants, which mirror the Prisma enums. Worth keeping in mind for any module: a hand-written option list is an enum that will drift.

96. ✅ **the employee form sent `null` for every blank box.** The DTOs run `@CleanOptional()`, so an empty string becomes `undefined` and a `null` is a validation failure — the create form would have been refused for the difference of one character on any optional field. The form's state is `string | undefined` throughout and omits blanks rather than sending them.

97. ✅ **the shared leave form filed through the manager endpoint with an empty `employeeId`,** then redirected to a route that did not exist. It is now one component with a `scope`: `self` posts to `POST /hr/me/leave` (no employee field exists to wire up by mistake) and `manager` posts to `POST /hr/leave` with a picker and a live `previewLeave`, so the working-day count and the balance are shown **before** the request is filed rather than after.

98. ✅ **the leave list's status and type filters did nothing.** They were rendered, and `rows` was filtered by `search` alone, so the screen looked filtered and was not. Both are now sent to the API. The employees list had the same class of bug in reverse: it filtered a free-text search client-side over three columns while the endpoint searches six, so the on-screen search and the CSV export disagreed.

99. ✅ **a "National ID" field rendered a masked salary.** `{'*'.repeat(basicSalary.length - 4)}{…padStart(4, '*')}` under a `<p>National ID</p>` label — so an employee with a 180,000 salary displayed as `************176` next to their real national ID, if they had one. It now reads `detail.nationalId`. This is the clearest argument in the module for the backend's `directoryView`/`findOne` split: the sensitive half is only ever fetched for a caller entitled to it, and a page that cannot assume those fields are present cannot mislabel them.

100. ✅ **`StatusBadge` had no colours for three payroll run states.** `CALCULATED`, `PAID` and `VOID` all fell through to the generic grey, so the one screen where reading a state wrong costs a company money rendered three of its five states identically. Added, with violet and emerald deliberately far apart in the scale — reading `APPROVED` as `PAID` is the mistake the ordering exists to make visually obvious.

## Docs that were stale (read this if you think a module is unstarted)

Until 2026-10-05 this file said "Not started per owner description" with all six checkboxes unticked, and `00-MASTER-ARCHITECTURE.md` row 12 said "Absent — confirmed by audit". Both were wrong: a complete backend had been written (18 files, 5 migrations, 886 passing tests including `payroll-calc.spec.ts` and `leave-policy.spec.ts`), and three of the module's own issues were already recorded in master doc §3.3 under "Module 12 items closed 2026-10-05" — issues 88, 89 and 90. The roadmap row and this file simply never got updated with them.

Two lessons, both about the docs rather than the code:

- **`00-MASTER-ARCHITECTURE.md` §5 requires the checklist here to be updated as work completes.** It was not, so a whole module read as unstarted while sitting finished in the working tree. A stale checklist is not a cosmetic problem: it is the thing that makes the next session either redo the work or skip it.
- **"Absent — confirmed by audit" was not re-verified before being trusted.** The master doc says agents must verify against the live repo every session; this row was carried forward from the 2026-10-03 audit snapshot and read as current. The audit predated the module by two days.
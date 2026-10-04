# Module 18: Workflow Engine

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**Implemented and verified.** Backend engine, policy administration UI, approvals inbox, and the refund retrofit all landed; verified live (see Verification log).

## Module Goal
Make multi-step approvals configurable rather than hardcoded per module.

## What Was Built

An approval engine that knows nothing about the things it approves. A module that
wants a process approved registers a completion handler and calls
`WorkflowsService.start`; the engine finds the organization's policy for that
entity type, materializes its levels, hands the request from one approver to the
next, records every decision, and calls the module's handler when the last level
agrees — **inside the same transaction as that decision**.

### Schema (`src/prisma/schema.prisma`)
| Model | Purpose |
|---|---|
| `WorkflowDefinition` | The policy. `organizationId = null` is a platform default available to everyone; org-specific shadows it. `steps Json` holds the ordered level templates; `priority` breaks ties. |
| `WorkflowInstance` | One request travelling through a policy. `context Json` is the caller's payload *and* what level conditions are read against. Keeps its own frozen `steps` copy, and `workflowDefinitionId` is nullable so retiring a policy cannot delete approvals in flight. |
| `WorkflowStep` | A materialized level of an instance. A table rather than JSON because the inbox has to answer "what is waiting on me", and delegation/escalation must survive a restart. |
| `WorkflowEvent` | The immutable trail (started / approved / rejected / escalated / withdrawn / auto-approved), with the acting user, who they acted for, and the comment. |
| `WorkflowDelegation` | "While I am away, this colleague decides what is waiting on me." |

Enums: `WorkflowInstanceStatus`, `WorkflowStepStatus`, `WorkflowApproverKind`,
`WorkflowEventType`. `NotificationType` gained `APPROVAL_DECIDED` and
`APPROVAL_ESCALATED` (it already had `APPROVAL_REQUESTED`).

### Rules (`src/modules/workflow/workflow-rules.ts`, 29 unit tests)
Pure, database-free, and unit-tested — this is where the decisions an auditor
would ask about live:
- `parseStepTemplates` refuses a level addressed to nobody or to a role that
  cannot exist. A policy that names nobody is rejected at save time rather than
  discovered the first time a real refund waits on it.
- `conditionApplies` — dotted paths into `context`, ops `eq/neq/gt/gte/lt/lte/in/contains/exists`.
  **A missing field never passes a threshold.**
- `canActOnStep` — nobody approves their own request (absolute, not even a super
  admin); the configured approver or their current delegate decides; an
  administrator may override and it is recorded as an override, never blended
  into the trail.
- `nextActionableIndex` / `firstActionableIndex` — advancing skips levels that no
  longer need a decision, including ones whose condition was false.

### Service (`workflows.service.ts`)
`start`, `act`, `cancel`, `inbox`, `listInstances`, definition CRUD,
`delegations`, `escalateInstance`. Notable choices:
- **No public "start a workflow" endpoint.** The caller supplies the `context` its
  own conditions are evaluated against, so a generic start endpoint would let
  anybody forge the threshold their approval depends on. Only the owning module
  starts its own requests.
- **No policy configured → the request is auto-approved and its handler still
  runs**, inside a transaction, with an `AUTO_APPROVED` event explaining why.
  Behaviour on day one is unchanged for anyone who has not configured a policy,
  and "it was approved because nobody set up a policy" is auditable rather than
  invisible.
- Cross-tenant guard: role *names* are global, so an actor from another
  organization would otherwise match a role level. Refused explicitly.
- Notifications are best-effort, as everywhere in this codebase: an approval
  nobody was notified about is still a real approval.

### Escalation (`workflow-escalation.service.ts`)
Hourly cron (`0 7 * * * *`). A level past its `dueAt` is escalated by being
**reassigned** to its `escalateToUserId` (not copied), so the inbox and the
authorization check need no special case for escalated work. With no escalation
target configured the level is flagged overdue and left with its approvers.
Idempotent by construction (`escalatedAt` guard).

### Retrofit: refunds (`finance/refunds`)
`POST /finance/refunds` no longer moves money. It raises a `REFUND` request via
`RefundApprovalsService`; the refund — credit note, GL entry, invoice
re-derivation — is issued by the completion hook when the last level approves,
inside the decision's transaction. `processedBy` stays the person who *asked*;
the trail answers "who agreed".
The request is validated as refundable *before* it is raised (fail fast, while
the requester is still looking at the payment) and again when it is executed.

**Consequence worth knowing:** with one accountant per organization the
requester can never be the approver, so the administrator is the approver via the
override path. That is the correct two-person outcome, and the demo organizations
now have `finance@rohi.co.ke` and `manager@rohi.co.ke` so it is demonstrable.

### Frontend
- `/approvals` — one inbox for every entity type. Two queues ("waiting on you",
  "requested by me"), a delegation panel, and reasons stated in the row
  (escalated / on somebody's behalf / administrator override / past its deadline).
- `/approvals/[id]` — what was requested, every level with who it was addressed
  to and who decided it, the full history, and the decision form.
- `/settings/workflows` — policy administration: ordered level editor with
  conditions, escalation targets, and a plain-English restatement of the policy
  ("Director sign-off: anyone holding Company Admin decides only when amount is
  greater than 50000"). Platform defaults are read-only and copyable.
- Sidebar entry with a live count; `/finance/refunds` now says "Request a refund"
  and lists what is awaiting approval instead of pretending nothing happened.
- Shared: `components/workflow/{approval-timeline,decision-form,level-editor}.tsx`.

### Permissions
New `workflows` module in `PERMISSION_MODULES`. Deciding is `workflows.update`,
reading is `workflows.view`, and rewriting the policy is create/update/delete —
decided under a policy and authoring a policy are different powers, so the split
follows the entity. Company Admin full; Property Manager, Maintenance Manager and
Procurement Officer view+update (they are approvers, not authors); Accountant
view; Leasing Officer view.

## Tasks Checklist
- [x] Add `WorkflowDefinition`, `WorkflowInstance` models per `01-DATABASE-SCHEMA.md`
- [x] Build a generic workflow service: given an entity type + org, find the applicable WorkflowDefinition, create a WorkflowInstance, advance on approve/reject actions
- [x] Build delegation (a user can delegate their pending approvals to another user) and escalation (auto-escalate after N days) — can be v2 if time-constrained
- [x] Retrofit at least one real approval flow — **refunds**, chosen over the suggested Procurement because that module does not exist and building it would have doubled the scope; refunds are the process where an approval is worth having
- [x] Frontend: generic 'My Approvals' inbox component, reusable across entity types
- [x] Unit tests for the rules; service-level tests for start/act/escalate
- [x] Seed: a platform default policy, an org policy, and three sample requests (waiting, rejected with a note, escalated)

## Backend: NestJS Notes
- The module lives at `backend/src/modules/workflow/` (matching the existing
  `modules/<domain>` layout, not the `backend/src/workflow/` path originally guessed here).
- `WorkflowHooksRegistry` is exported so consumers can register a handler; the
  dependency only ever points that way — the engine never imports refunds,
  purchases or work orders.
- `actorFrom(req)` resolves roles, administrator status and active-ness once, so
  every check in a request agrees on who the actor is.

## Frontend: Next.js Notes
- One reusable inbox, one reusable decision form, one reusable level timeline —
  no per-module forks.
- The `Select` component in this codebase is a custom div, not a native `<select>`,
  so it takes `aria-label` rather than a `<label htmlFor>`.

## Acceptance Criteria
- [x] At least one real business process routes through the engine for multi-level approval, correctly advancing/rejecting/escalating — verified live against the running stack; see Verification log.

## Verification log

`npx tsc --noEmit` clean; `npx jest` 571 passed / 40 suites; frontend `npx tsc --noEmit` clean and `npm run build` compiled; `prisma migrate status` up to date (no drift).

Live against the running backend (Rohi + Westhill, three roles):

| Check | Result |
|---|---|
| Finance inbox shows only its own level | 1 pending (the Accountant level) |
| Admin inbox shows the escalated level as addressed to them | 1 `ESCALATED`, not an override |
| `POST /finance/refunds` raises a request, no money moves | `IN_PROGRESS`, refund count still 0 |
| Requester approves own request | 403 "You cannot approve a request you raised yourself." |
| Rejection with no note | 400 |
| Other organization's admin reads / decides | 404 both times |
| Admin approves (requester could not) | `APPROVED`, effect `{refundId, creditNoteNumber: RFD-202610-3033, amount: 500}` |
| Second decision on a decided request | 409 "already been approved" |
| Delegation → delegate acts on the delegator's level | `REJECTED`, event records `onBehalfOf=Rohi`, step records `actedViaDelegationId` |
| Withdrawing the delegation revokes the authority | refused immediately after |
| Conditional level under the platform default | 300 → Director `SKIPPED`; 60,000 → Director `PENDING` |
| Policy addressed to a non-existent role | 400 listing the roles that do exist |
| Platform default edited from an org | 403 "Copy it into your organization" |
| Delete refused while requests are in flight | 409 suggesting deactivate |

## Decisions & deviations from the original spec
1. **Refunds instead of Purchase Requests** for the retrofit (Procurement does not exist).
2. **Three extra tables beyond the spec's two.** `WorkflowStep` and `WorkflowEvent`
   exist because the inbox, delegation and escalation need rows to query and a
   trail to read; `WorkflowDelegation` for out-of-office cover. `WorkflowInstance`
   additionally keeps a frozen copy of the levels so editing a policy cannot
   rewrite approvals already raised under it.
3. **Auto-approve when no policy applies** (documented, audited) rather than
   failing closed, so adopting the engine is not a behaviour change.
4. **No public start endpoint** (security, see above).
5. `WORKFLOW_CONDITION_OPS` etc. live in `workflow-rules.ts` so the frontend's
   constants and the backend's validation cannot drift apart silently.

## Known issues / follow-ups
- **Only refunds route through the engine.** Procurement, maintenance work
  orders, expenses and lease approvals should each register a handler and call
  `start()` — that is now a ~20-line addition per module.
- **Who may request a refund is still finance-only.** A property manager cannot
  raise one, because they have no `payments.view` and so cannot pick a payment.
  Widening that is a permissions decision, not an engine one.
- **The escalation sweep is hourly and silent about failures** (logs only).
  A level with no escalation target is flagged but never chases anybody.
- **Inbox queries load up to 200 open steps and filter in JS** so role matching
  stays in one place. Fine at property-management volume; worth an index and a
  SQL-side path if it ever is not.
- `refunds.create` now returns an approval instance rather than a
  `PaymentRefund`. Any other consumer of that endpoint needs updating.

## Dependencies on Other Modules
- Consumed by (next): Procurement, Finance (expense approval), Maintenance (work order approval), Lease & Tenancy (lease approval)
- Depends on: Core Platform (Role/User model for approver assignment), Notifications (approval nudges), Finance (the one consumer implemented today)

## Module log
| Date | Change |
|---|---|
| 2026-10-04 | Initial implementation: engine, rules + tests, escalation sweep, delegation, inbox + policy admin UI, refund retrofit, seed data. Fixed a pre-existing boot failure in Module 17's notification providers (`import()` constructor types and defaulted params erased DI metadata — see `00-MASTER-ARCHITECTURE.md` issue). |
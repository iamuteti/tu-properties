# Module 18: Workflow Engine

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Not started per owner description.

## Module Goal
Make multi-step approvals configurable rather than hardcoded per module.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No workflow engine reported as existing — approvals so far (if any) are likely hardcoded per module.

## Scope / Sub-modules
- Examples: lease approval, purchase approval, expense approval, refund approval, work order approval
- Features: multi-level approval, conditional rules, delegation, escalation

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Workflow Engine

## Tasks Checklist
- [ ] Add `WorkflowDefinition`, `WorkflowInstance` models per `01-DATABASE-SCHEMA.md`
- [ ] Build a generic workflow service: given an entity type + org, find the applicable WorkflowDefinition, create a WorkflowInstance, advance on approve/reject actions
- [ ] Build delegation (a user can delegate their pending approvals to another user) and escalation (auto-escalate after N days) — can be v2 if time-constrained
- [ ] Retrofit at least one real approval flow (recommend: Purchase Request approval from Procurement module, since that module doesn't exist yet either — build them together) to prove the engine works end-to-end
- [ ] Frontend: generic 'My Approvals' inbox component, reusable across entity types

## Backend: NestJS Notes
- New module: `backend/src/workflow/`.
- Keep this generic — do not let it become tightly coupled to one specific entity type.

## Frontend: Next.js Notes
- A single reusable approvals inbox UI, not one per module.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- At least one real business process routes through the engine for multi-level approval, correctly advancing/rejecting/escalating

## Dependencies on Other Modules
- Consumed by: Procurement, Finance (expense approval), Maintenance (work order approval), Lease & Tenancy (lease approval)
- Depends on: Core Platform (Role/User model for approver assignment)

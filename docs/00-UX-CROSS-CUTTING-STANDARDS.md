# UX Cross-Cutting Standards (applies to every module's frontend work)

> Read `00-MASTER-ARCHITECTURE.md` first. This doc exists because a full codebase audit found the **same set of gaps repeated across nearly every existing page** in TU Properties: list + create pages exist, but detail/edit, row actions, bulk operations, exports, and consistent state handling do not. Rather than repeat this checklist in all 20 module docs, it lives here once. Every module doc's "Frontend Notes" section references this file — treat it as a binding standard for any page you build or touch, not optional polish.

## Why this matters

The current app has 24 frontend routes, but almost all of them are list + create only. There are no detail/edit pages, no row-action menus, no bulk operations beyond delete, no exports, no saved views, no inline editing, and no status-transition UI anywhere. Forms are large static field dumps (several are 400–800+ lines) with no guided workflow, conditional logic, autosave, or import support. This is the single biggest gap between "CRUD scaffolding" and "usable product," and it's cheaper to fix by adopting a standard pattern now than to retrofit 20 more modules with the same gap.

## Required for every entity's UI (properties, units, tenants, leases, invoices, etc.)

1. **List page** — already the norm in this app; keep server-side pagination/filtering where it exists.
2. **Detail page** — every entity that has a list page needs a `/{entity}/[id]` detail page. This is currently missing almost everywhere (e.g. the Invoices list links to a detail page that doesn't exist — `frontend/app/(dashboard)/finance/invoices/page.tsx:21`). Do not ship a new list page without its matching detail page.
3. **Edit page or inline edit** — a way to modify an existing record without recreating it. Reuse the create form's field layout where practical rather than building a second, divergent form.
4. **Row actions** — a menu (or inline buttons) on each table row for the actions relevant to that entity: view, edit, delete, and any status transition (e.g. approve, close, mark paid). Don't hide these only inside the detail page if a quick action from the list is a common operation.
5. **Bulk operations** — beyond bulk delete (which exists in places), support bulk status changes or bulk export where the module has a plausible bulk use case (e.g. marking multiple invoices as sent, exporting selected tenants).
6. **Status transitions as a first-class UI concept** — wherever a model has a status enum (lease status, invoice status, work order status, etc.), the UI should present valid next-states as explicit actions, not a free-form dropdown that allows invalid transitions.
7. **Exports** — CSV/PDF export on list pages where the underlying data is something a property manager would plausibly hand to someone else (tenant lists, invoice registers, owner statements).
8. **Consistent empty / loading / error states** — every list and detail page needs a real empty state (not a blank table), a loading skeleton (not a layout jump), and a real error state (not a silent failure or unstyled stack trace). Audit found this inconsistent across existing pages — standardize on one shared pattern/component rather than each page inventing its own.

## Forms

- Break large static forms into logical steps/sections (tabs are acceptable if already in use, but pair them with validation-before-advancing rather than a single giant submit at the end).
- Add autosave-as-draft for any form long enough to plausibly be abandoned mid-fill (property creation, lease creation, invoice creation).
- Never ship a form that only logs to console on submit — this exact bug already exists once (rent-receipt creation, `frontend/app/(dashboard)/finance/rent-receipts/new/page.tsx:96-107`) and must not be repeated. Every submit handler must call a real mutation with loading and error UI, and either redirect or confirm success visibly.
- Where a TODO stub exists in place of real logic (e.g. receipt invoice selection, `frontend/app/(dashboard)/finance/receipts/new/page.tsx:342`), treat completing it as part of that module's stabilization work, not a separate backlog item to defer indefinitely.
- Bulk import (CSV/Excel) is expected for high-volume entry entities: properties, units, tenants. Not required for every entity, but flag it explicitly if a module doc's task list doesn't already call for it and the entity is high-volume.

## Navigation

- Every sidebar link must resolve to a real page. Audit already found several broken links (missing `/dashboard` prefix in places, a leases link, a receipts link) — before adding a new nav item, confirm its target route exists and is correct.
- Role-based nav visibility must be consistent between parent and child items — don't hide a parent nav item from a role while leaving its child route reachable (this exact inconsistency exists today for the Accountant role and Properties).

## Accessibility & responsive

- Sidebar currently hides entirely on mobile (`md:flex` with no mobile fallback) — every module's pages must work on a small screen, not just deprioritize it; at minimum provide a usable mobile nav pattern (drawer/hamburger) rather than none at all.
- Modals need keyboard focus trapping and return-focus-on-close.
- Dynamic regions (loading states, live-updating tables, toasts) need appropriate ARIA live regions/roles.
- Forms need proper label association and visible focus states — don't rely on placeholder text as a label substitute.

## Definition of done for any new module's frontend work

A module's frontend is not "done" if it only has list + create pages. Before marking a module's UI complete in its task checklist, confirm: detail page ✅, edit capability ✅, row actions ✅, appropriate bulk ops ✅, empty/loading/error states ✅, mobile-usable ✅, and — if the entity has a status field — status transitions are explicit UI actions, not a raw dropdown.

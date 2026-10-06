-- Module 14: drop `utility_charges_invoiced_has_invoice`, which was wrong.
--
-- The constraint was
--
--     CHECK ("status" <> 'INVOICED' OR "invoiceId" IS NOT NULL)
--
-- written on the reasoning that a status must never claim something the row does not
-- have. The intent was right and the implementation was not, because
-- `UtilityCharge.invoiceId` is declared `ON DELETE SET NULL` - so deleting an invoice
-- that a charge points at nulls the id while leaving `status = 'INVOICED'`, and the
-- CHECK rejects that update.
--
-- Which means the constraint did not enforce the invariant it described; it made
-- **deleting an invoice that a utility charge bills impossible**. Found when the demo
-- seed re-ran: its cleanup deletes `invoices` before `utility_charges`, so a second
-- `npm run db:seed` died on the FK's own cascade.
--
-- The state the CHECK forbids is legitimate, not corrupt. The consumption happened
-- and was charged; the *document* has since been deleted. That is a real thing that
-- can be true, and a constraint must not make it unrepresentable. Finance owns invoice
-- deletion and its consequences - the module's own guarantee, which is what actually
-- protects the resident, is `@@unique([meterId, unitId, billingPeriod])` stopping the
-- same consumption being billed twice, and that is untouched.
--
-- `utility_charges_void_explains_itself` from the previous migration stays: a void is
-- set only by this module, its columns are plain values rather than relations, so
-- nothing can null them out from under it, and the invariant genuinely holds.

ALTER TABLE "utility_charges"
    DROP CONSTRAINT "utility_charges_invoiced_has_invoice";
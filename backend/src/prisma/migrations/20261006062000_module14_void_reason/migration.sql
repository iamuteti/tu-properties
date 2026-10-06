-- Module 14 - Utilities: keep the reason a charge was voided.
--
-- `POST /utilities/charges/:id/void` requires a reason of at least ten characters,
-- and validation that demands a sentence and then throws it away is worse than not
-- asking: the caller believes the explanation was recorded, and three months later
-- an unexplained write-off is indistinguishable from a bug.
--
-- Three columns rather than one. `voidedByUserId` is the same provenance argument the
-- rest of the schema makes for readings (`MeterReading.recordedByUserId`) and charges
-- (`UtilityCharge.createdByUserId`): "who reversed this" is a different question from
-- "who raised it", and after the fact only one of them has an obvious answer.
--
-- `status` already existed as an enum; this is deliberately not a `VOIDED` reason
-- table. The charge row stays, so the period still explains itself after a reversal,
-- and a second table would only be a way for the reason to end up orphaned.

ALTER TABLE "utility_charges"
    ADD COLUMN "voidReason" TEXT,
    ADD COLUMN "voidedAt" TIMESTAMP(3),
    ADD COLUMN "voidedByUserId" TEXT;

ALTER TABLE "utility_charges"
    ADD CONSTRAINT "utility_charges_voidedByUserId_fkey"
    FOREIGN KEY ("voidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A void has to say why and say who and say when. The same "the status and the fact
-- must agree" rule as `utility_charges_invoiced_has_invoice`, and for the same reason:
-- a status that can claim something the row does not have is a status that lies on
-- exactly the screen somebody reads when they are chasing money.
ALTER TABLE "utility_charges"
    ADD CONSTRAINT "utility_charges_void_explains_itself"
    CHECK (
        CASE
            WHEN "status" = 'VOID' THEN
                "voidReason" IS NOT NULL
                AND "voidedAt" IS NOT NULL
                AND "voidedByUserId" IS NOT NULL
            ELSE true
        END
    );

-- Reusing the CASE ... ELSE false form from
-- `20261006061000_module14_utilities_nullsafe_checks`: a plain OR-chain over nullable
-- columns evaluates to NULL for a half-populated row, and NULL passes a CHECK.
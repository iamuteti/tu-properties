-- Module 14: drop `Unit`'s four utility-number columns, now that `UtilityMeter` exists.
--
-- `Unit.electricityAcno`, `waterAcno`, `electricityMeethno` and `waterMeethno` were the
-- original attempt at this module's job: somewhere to write the utility company's
-- account number and the meter's own number for a flat. They held zero rows across all
-- 2522 units, which is why the module could be designed from scratch rather than
-- reconciled against them.
--
-- `UtilityMeter` is their replacement and answers strictly more. Four nullable columns
-- named after two specific utilities could not say:
--
--   - which utility a number belongs to (a column named `waterAcno` asserts it, so a
--     gas or sewerage number had nowhere to go and a fifth utility needed a migration);
--   - which unit the meter serves, or that it serves a whole building;
--   - whether it is a bulk meter whose consumption is divided;
--   - what it has ever read.
--
-- Verified immediately before this migration ran: all four columns NULL across all
-- units, and the sole code reference was four optional fields on the frontend `Unit`
-- type, which are removed in the same commit. Nothing could lose data from this.
--
-- Had any value been present the right move would have been a backfill into
-- `utility_meters` rather than a drop, since the numbers would be real identifiers a
-- utility company still bills against.

ALTER TABLE "units"
    DROP COLUMN "electricityAcno",
    DROP COLUMN "waterAcno",
    DROP COLUMN "electricityMeethno",
    DROP COLUMN "waterMeethno";
-- Module 14 - Utilities: estimated-reading provenance, and a vacancy policy.
--
-- Two additions, both closing a place where the schema recorded *that* something was
-- true but not enough to act on it.

-- ── Estimated readings ─────────────────────────────────────────────────────
--
-- `MeterReading.source = 'ESTIMATED'` already existed, and on its own it is not
-- auditable: it says a figure was not measured without saying who produced it or on
-- what basis. An un-auditable estimate on a resident's bill is worse than an obvious
-- fudge, because nothing about it invites a question.
--
-- `estimatedFromReadingId` is what makes the number defensible rather than merely
-- declared. "We assumed last month's usage" is a checkable claim; "we assumed" is
-- not. `estimationMethod` names the basis in words for cases the reference cannot
-- express ("average of the last three months", "engineering estimate after a burst
-- pipe"), and `estimatedByUserId` answers the question an auditor actually asks.
--
-- Deliberately NOT enforced by a CHECK that these are set when source = ESTIMATED.
-- A constraint here would fire on `SMART` rows that legitimately need none of them,
-- and would push the module toward inventing values to satisfy a shape rather than
-- recording what actually happened. The service warns at read time instead.

ALTER TABLE "meter_readings"
    ADD COLUMN "estimatedFromReadingId" TEXT,
    ADD COLUMN "estimationMethod" TEXT,
    ADD COLUMN "estimatedByUserId" TEXT;

ALTER TABLE "meter_readings"
    ADD CONSTRAINT "meter_readings_estimatedFromReadingId_fkey"
    FOREIGN KEY ("estimatedFromReadingId") REFERENCES "meter_readings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "meter_readings"
    ADD CONSTRAINT "meter_readings_estimatedByUserId_fkey"
    FOREIGN KEY ("estimatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An estimate that is measured from *itself* is not an estimate of anything.
ALTER TABLE "meter_readings"
    ADD CONSTRAINT "meter_readings_estimate_is_not_its_own_source"
    CHECK ("estimatedFromReadingId" IS NULL OR "estimatedFromReadingId" <> "id");

-- ── Vacancy policy ─────────────────────────────────────────────────────────
--
-- Water keeps arriving whether or not anybody is home to use it, and on a bulk meter
-- that cost has to land somewhere. Every answer is a trade-off - absorb it, re-rate it
-- across the occupied units, or don't bill it - and which one is right belongs to the
-- landlord, not to this module. So it is a stored decision with three named options.
--
-- On `Organization` rather than the meter or the property: it is a commercial policy,
-- and an organization running several estates wants it uniform.
--
-- NULL means RECORD_ONLY. That default is chosen rather than neutral: it makes a real
-- cost visible without inventing a payer, which is the failure the other two options
-- are choosing to accept on purpose. Kept as NULL rather than a `default('RECORD_ONLY')`
-- so that "nobody has decided" stays distinguishable from "decided to record only".

CREATE TYPE "VacancyPolicy" AS ENUM ('RECORD_ONLY', 'SKIP', 'REDISTRIBUTE');

ALTER TABLE "organizations"
    ADD COLUMN "vacancyPolicy" "VacancyPolicy";
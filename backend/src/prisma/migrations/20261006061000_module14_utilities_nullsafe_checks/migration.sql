-- Module 14 - Utilities: make the meter CHECK constraints NULL-proof.
--
-- The first version of `utility_meters_rollover_consistent` was
--
--     CHECK (("digits" IS NULL AND "digitWrapAt" IS NULL)
--            OR ("digits" > 0 AND "digitWrapAt" = power(10::numeric, "digits"::numeric)))
--
-- which reads as "digits implies a wrap point of exactly 10 ** digits". It does not
-- enforce that, and a SQL probe on the applied migration proved it: inserting
-- `digits = 5` with `digitWrapAt = NULL` was **accepted**.
--
-- The reason is three-valued logic. For that row the predicate is
--
--     (false AND true) OR (true AND NULL = 100000)   ->   false OR NULL   ->   NULL
--
-- and a CHECK constraint rejects a row only when it evaluates to FALSE. NULL is not
-- FALSE, so the row passes. This is the oldest trap in SQL and it is worth writing
-- down because the constraint that is supposed to make rollover arithmetic safe is
-- precisely the one that cannot be allowed to be quietly absent - a meter configured
-- with a digit count and no wrap point makes `consumptionBetween` divide by nothing.
--
-- The fix is to make the predicate a CASE with an `ELSE false`, so the expression is
-- always a real boolean and can never evaluate to NULL.
--
-- The same latent weakness is corrected on the other two nullable-column CHECKs for
-- the same reason, even where the hole was not reachable today: a constraint whose
-- strength depends on which column happens to be null today is a constraint that
-- silently weakens the first time a column becomes optional.

-- Correctness, not decoration: a meter that declares its digit count but no wrap
-- point is the configuration that breaks consumption arithmetic.
ALTER TABLE "utility_meters"
    DROP CONSTRAINT "utility_meters_rollover_consistent";

ALTER TABLE "utility_meters"
    ADD CONSTRAINT "utility_meters_rollover_consistent"
    CHECK (
        CASE
            WHEN "digits" IS NULL AND "digitWrapAt" IS NULL THEN true
            WHEN "digits" IS NOT NULL
             AND "digitWrapAt" IS NOT NULL
             AND "digits" > 0
             AND "digitWrapAt" = power(10::numeric, "digits"::numeric) THEN true
            ELSE false
        END
    );

ALTER TABLE "utility_meters"
    DROP CONSTRAINT "utility_meters_manual_needs_weights";

ALTER TABLE "utility_meters"
    ADD CONSTRAINT "utility_meters_manual_needs_weights"
    CHECK (
        CASE
            WHEN "apportionmentMethod" = 'MANUAL' THEN "apportionmentWeights" IS NOT NULL
            ELSE true
        END
    );

-- Kept explicit for the same reason. `scope` is NOT NULL today, so this one could
-- not evaluate to NULL, but the form below says what it means instead of relying on
-- a column's nullability that a future edit could change.
ALTER TABLE "utility_meters"
    DROP CONSTRAINT "utility_meters_bulk_needs_method";

ALTER TABLE "utility_meters"
    ADD CONSTRAINT "utility_meters_bulk_needs_method"
    CHECK (
        CASE
            WHEN "scope" = 'BULK' THEN
                "unitId" IS NULL AND "apportionmentMethod" IS NOT NULL
            WHEN "scope" = 'SUBMETER' THEN
                "apportionmentMethod" IS NULL
            ELSE false
        END
    );
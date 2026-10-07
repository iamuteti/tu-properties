-- Module 17: address a notification to a landlord.
--
-- `OWNER_STATEMENT_READY` and `PAYOUT_PAID` have existed in the enum since Module 6
-- and nothing has ever sent them, because `notifications` could only be addressed to
-- a `User` or a `Tenant` and a `Landlord` is neither -- there is no owner login until
-- the Phase 2 owner portal. All 120 demo landlords have an email and a phone, so the
-- contact details were never the obstacle; the *recipient model* was.
--
-- The alternative considered and rejected: mailing `Landlord.email` straight from the
-- landlords module. It needs no migration and loses three things this table exists for
-- -- the audit trail (nothing records that anything was sent), the `dedupeKey` (the
-- sweep would repeat itself), and the read state the owner's next notification needs
-- once the portal lands. A notification that is not a row is not a notification.

ALTER TABLE "notifications" ADD COLUMN "landlordId" TEXT;

-- CASCADE matches `userId` and `tenantId`: a recipient that no longer exists should
-- not leave notification rows pointing at nothing. (Deleting a landlord that owns
-- properties is already refused by the property FK, so this is a clean-up path.)
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_landlordId_fkey"
  FOREIGN KEY ("landlordId") REFERENCES "landlords"(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Mirrors `notifications_userId_readAt_idx` / `notifications_tenantId_readAt_idx`, so
-- "this owner's unread messages" is the same query as the other two recipients'.
CREATE INDEX "notifications_landlordId_readAt_idx" ON "notifications"("landlordId", "readAt");

-- Enforce what `NotificationsService.notify()` has always enforced in code: a
-- notification has a recipient. It is a CHECK rather than application logic because
-- three nullable columns with no constraint is how a row becomes an orphan nobody can
-- find or delete - the same trap as Module 14's `utility_meters_rollover_consistent`,
-- where a predicate evaluating to NULL passed a constraint that was supposed to
-- prevent the state.
--
-- `num_nonnulls(...) >= 1` and not an equality test: a row may legitimately carry more
-- than one recipient once the owner portal lands and a landlord *is* a user. Written as
-- `>= 1` deliberately so that transition does not need a second migration.
--
-- Verified against existing data before adding: 2,924 rows, 0 with a NULL
-- `organizationId`, 0 with no recipient at all, so this cannot fail on data already
-- in the table.
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_one_recipient"
  CHECK (num_nonnulls("userId", "tenantId", "landlordId") >= 1);

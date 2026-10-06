-- Module 15: the notification type for contract reminders.
--
-- PostgreSQL cannot add an enum value inside a transaction, so `ALTER TYPE ... ADD
-- VALUE` is the entire migration. It cannot be rolled back, which is worth knowing
-- before anyone tries to `migrate reset` expecting the old set back.
--
-- `CONTRACT_EXPIRING` is added rather than reusing `LEASE_EXPIRING` for a substantive
-- reason: the two are addressed to different people. `LEASE_EXPIRING` goes to the
-- resident (`recipient.tenantId`); a contract reminder goes to the staff who can still
-- act on it (`recipient.userId`), because a contract that has passed its notice
-- deadline is a commitment nobody can undo and the person who has to know is the one
-- holding the register.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTRACT_EXPIRING';
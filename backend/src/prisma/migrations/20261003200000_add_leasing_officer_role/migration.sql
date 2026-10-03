-- Module 5: the seeded "Leasing Officer" role had no UserRole counterpart, so it
-- could be granted permissions but never held by a user. ALTER TYPE ... ADD VALUE
-- cannot run inside a transaction on PostgreSQL < 12 and Prisma runs migrations in
-- one, so this migration is intentionally transaction-free.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'LEASING_OFFICER';

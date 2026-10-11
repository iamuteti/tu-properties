-- Contact inquiries from the marketing site (no account, no organization).

-- CreateEnum
CREATE TYPE "ContactInquiryStatus" AS ENUM ('NEW', 'READ', 'REPLIED');

-- CreateTable
CREATE TABLE "contact_inquiries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ContactInquiryStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_inquiries_status_createdAt_idx" ON "contact_inquiries"("status", "createdAt");

-- Re-assert the two hand-maintained indexes that Prisma's schema diff cannot
-- see and a `migrate dev` run therefore drops (observed 2026-10-11: the
-- support-tickets migration removed both, silently disarming the notification
-- dedupe read path and the bulk-billing uniqueness guard; both restored by
-- hand the same day with no violating rows found). `IF NOT EXISTS` so this
-- migration is a no-op repair on a healthy database and a healing one on a
-- database that lost them.
CREATE INDEX IF NOT EXISTS "notifications_landlordId_readAt_idx" ON "notifications"("landlordId", "readAt");
CREATE UNIQUE INDEX IF NOT EXISTS "utility_charges_no_double_bill_bulk"
    ON "utility_charges" ("meterId", "billingPeriod")
    WHERE "unitId" IS NULL;

-- Module 2: Property Management — property lifecycle status, branch link, and
-- structured amenities.
--
-- Note: the `AuditLog.userId` / `Document.uploadedById` FK relaxations below
-- were applied to the development database with `prisma db push` during Module 1
-- (Core Platform) and were therefore never recorded in migration history. They
-- are included here (idempotently) so a database built by replaying the
-- migration history ends up identical to one migrated from scratch.

-- AlterEnum
CREATE TYPE "PropertyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "documents" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- CreateTable
CREATE TABLE "property_amenities" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_amenities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_amenities_propertyId_idx" ON "property_amenities"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "property_amenities_propertyId_name_key" ON "property_amenities"("propertyId", "name");

-- CreateIndex
CREATE INDEX "properties_branchId_idx" ON "properties"("branchId");

-- CreateIndex
CREATE INDEX "properties_status_idx" ON "properties"("status");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
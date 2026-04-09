-- AlterTable
ALTER TABLE "move_out_requests" ADD COLUMN     "organizationId" TEXT;

-- CreateIndex
CREATE INDEX "move_out_requests_organizationId_idx" ON "move_out_requests"("organizationId");

-- AddForeignKey
ALTER TABLE "move_out_requests" ADD CONSTRAINT "move_out_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

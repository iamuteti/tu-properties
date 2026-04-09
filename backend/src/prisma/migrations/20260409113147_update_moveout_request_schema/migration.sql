/*
  Warnings:

  - You are about to drop the column `noticePeriodMonths` on the `move_out_requests` table. All the data in the column will be lost.
  - You are about to drop the column `requestDate` on the `move_out_requests` table. All the data in the column will be lost.
  - Added the required column `moveoutDate` to the `move_out_requests` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "move_out_requests" DROP COLUMN "noticePeriodMonths",
DROP COLUMN "requestDate",
ADD COLUMN     "moveoutDate" TIMESTAMP(3) NOT NULL;

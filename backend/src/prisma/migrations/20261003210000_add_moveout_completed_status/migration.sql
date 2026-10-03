-- Module 5: a move-out whose deposit refund has been paid is COMPLETED, not just
-- APPROVED. See master doc issue 49.
ALTER TYPE "MoveOutStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

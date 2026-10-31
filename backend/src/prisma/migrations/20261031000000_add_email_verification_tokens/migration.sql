-- Add email verification tokens to User.
--
-- A fresh account (public trial signup) is created with `emailVerified = false`
-- and a single-use, time-bound token stored as `verifyEmailToken` / 
-- `verifyEmailExpires`. The address owner confirms by clicking the link in the
-- verification email, which clears the token and flips the flag. Until then the
-- JWT strategy refuses to issue a session for the account.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "verifyEmailToken" TEXT;
ALTER TABLE "users" ADD COLUMN "verifyEmailExpires" TIMESTAMP(3);

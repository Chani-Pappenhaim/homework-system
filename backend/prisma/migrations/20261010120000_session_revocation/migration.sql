-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifyExpiresAt" TIMESTAMP(3),
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "AiPaidFallback" AS ENUM ('DAILY_QUOTA', 'ANY_LIMIT', 'NEVER');

-- AlterTable: every existing assignment keeps the AI review it has today.
ALTER TABLE "Assignment" ADD COLUMN     "aiReviewEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'app',
    "aiPaidFallback" "AiPaidFallback" NOT NULL DEFAULT 'DAILY_QUOTA',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

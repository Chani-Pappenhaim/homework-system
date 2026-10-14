-- CreateEnum
CREATE TYPE "AiTier" AS ENUM ('FREE', 'PAID');

-- AlterTable: every call logged so far ran on the free tier.
ALTER TABLE "AiUsageLog" ADD COLUMN "tier" "AiTier" NOT NULL DEFAULT 'FREE';

-- costUsd now holds the amount billed. The free tier bills nothing, so the
-- list-price estimates stored until now are cleared.
UPDATE "AiUsageLog" SET "costUsd" = 0;

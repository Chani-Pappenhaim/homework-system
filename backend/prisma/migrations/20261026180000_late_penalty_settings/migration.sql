-- The teacher's late penalty: points off for each day late, up to a maximum.
ALTER TABLE "AppSettings" ADD COLUMN "latePenaltyPerDay" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "latePenaltyMax" INTEGER NOT NULL DEFAULT 20;

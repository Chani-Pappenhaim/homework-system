-- Quiet hours for student notification emails, in minutes past midnight Israel time.
ALTER TABLE "AppSettings" ADD COLUMN "quietStartMinute" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "releaseMinute" INTEGER NOT NULL DEFAULT 600;

-- When each user was last seen signed in; the dashboard counts students online.
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

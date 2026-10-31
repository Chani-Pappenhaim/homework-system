-- An assignment kept from students, and an assignment that is not mandatory.
ALTER TABLE "Assignment" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "optional" BOOLEAN NOT NULL DEFAULT false;

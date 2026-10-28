-- A large exercise: the AI review reads more and larger code files.
ALTER TABLE "Assignment" ADD COLUMN "aiReviewLarge" BOOLEAN NOT NULL DEFAULT false;

-- An exercise given in parts: the AI review reads a repo at a tag, and the changes since another.
ALTER TABLE "Assignment" ADD COLUMN "aiGitFromTag" TEXT,
ADD COLUMN "aiGitToTag" TEXT;

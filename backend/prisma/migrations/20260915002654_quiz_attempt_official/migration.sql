-- DropIndex
DROP INDEX "QuizAttempt_quizId_studentId_key";

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "contentApproved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "QuizAttempt" ADD COLUMN     "isOfficial" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "QuizAttempt_quizId_studentId_idx" ON "QuizAttempt"("quizId", "studentId");

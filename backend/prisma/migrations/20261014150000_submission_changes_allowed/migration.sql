-- AlterTable: a submission the teacher already checked stays locked until she allows changes.
ALTER TABLE "Submission" ADD COLUMN     "changesAllowed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AiReviewCarryover" (
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "aiReviewCount" INTEGER NOT NULL,
    "aiExtraAllowed" BOOLEAN NOT NULL,

    CONSTRAINT "AiReviewCarryover_pkey" PRIMARY KEY ("assignmentId","studentId")
);

-- AddForeignKey
ALTER TABLE "AiReviewCarryover" ADD CONSTRAINT "AiReviewCarryover_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReviewCarryover" ADD CONSTRAINT "AiReviewCarryover_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


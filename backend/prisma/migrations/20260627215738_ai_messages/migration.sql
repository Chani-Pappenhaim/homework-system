-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "aiInstructions" TEXT;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "aiApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiCodeReview" TEXT,
ADD COLUMN     "aiExtraAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiReviewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "aiScore" DOUBLE PRECISION,
ADD COLUMN     "aiStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "aiVerbalReview" TEXT;

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tokensInput" INTEGER NOT NULL,
    "tokensOutput" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherMessage" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherMessage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TeacherMessage" ADD CONSTRAINT "TeacherMessage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

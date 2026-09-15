-- AlterTable
ALTER TABLE "LessonFile" ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LessonFileView" (
    "studentId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonFileView_pkey" PRIMARY KEY ("studentId","fileId")
);

-- AddForeignKey
ALTER TABLE "LessonFileView" ADD CONSTRAINT "LessonFileView_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonFileView" ADD CONSTRAINT "LessonFileView_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "LessonFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

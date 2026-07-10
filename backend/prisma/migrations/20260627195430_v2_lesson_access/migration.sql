/*
  Warnings:

  - You are about to drop the `CourseAccess` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CourseAccess" DROP CONSTRAINT "CourseAccess_courseId_fkey";

-- DropForeignKey
ALTER TABLE "CourseAccess" DROP CONSTRAINT "CourseAccess_studentId_fkey";

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "githubUsername" TEXT;

-- DropTable
DROP TABLE "CourseAccess";

-- CreateTable
CREATE TABLE "LessonAccess" (
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,

    CONSTRAINT "LessonAccess_pkey" PRIMARY KEY ("studentId","lessonId")
);

-- AddForeignKey
ALTER TABLE "LessonAccess" ADD CONSTRAINT "LessonAccess_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAccess" ADD CONSTRAINT "LessonAccess_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

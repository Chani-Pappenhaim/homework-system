-- DropForeignKey
ALTER TABLE "Grade" DROP CONSTRAINT "Grade_gradedById_fkey";

-- AlterTable
ALTER TABLE "Grade" ALTER COLUMN "gradedById" DROP NOT NULL,
ALTER COLUMN "submissionScore" SET DEFAULT 100;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "checklist" JSONB;

-- AlterTable
ALTER TABLE "TeacherMessage" ADD COLUMN     "assignmentId" TEXT;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The lesson files each assignment's AI review relies on, as the teacher picked them.
-- CreateTable
CREATE TABLE "_AssignmentAiReferenceFiles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AssignmentAiReferenceFiles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_AssignmentAiReferenceFiles_B_index" ON "_AssignmentAiReferenceFiles"("B");

-- AddForeignKey
ALTER TABLE "_AssignmentAiReferenceFiles" ADD CONSTRAINT "_AssignmentAiReferenceFiles_A_fkey" FOREIGN KEY ("A") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssignmentAiReferenceFiles" ADD CONSTRAINT "_AssignmentAiReferenceFiles_B_fkey" FOREIGN KEY ("B") REFERENCES "LessonFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


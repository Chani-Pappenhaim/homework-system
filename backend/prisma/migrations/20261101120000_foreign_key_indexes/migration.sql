-- Indexes on foreign keys that no composite key covers, so lookups by the second column stop scanning the table.

-- CreateIndex
CREATE INDEX "StudentGroup_groupId_idx" ON "StudentGroup"("groupId");

-- CreateIndex
CREATE INDEX "Course_groupId_idx" ON "Course"("groupId");

-- CreateIndex
CREATE INDEX "CourseLink_courseId_idx" ON "CourseLink"("courseId");

-- CreateIndex
CREATE INDEX "CourseFile_courseId_idx" ON "CourseFile"("courseId");

-- CreateIndex
CREATE INDEX "Lesson_courseId_idx" ON "Lesson"("courseId");

-- CreateIndex
CREATE INDEX "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");

-- CreateIndex
CREATE INDEX "LessonAccess_lessonId_idx" ON "LessonAccess"("lessonId");

-- CreateIndex
CREATE INDEX "CourseAccess_courseId_idx" ON "CourseAccess"("courseId");

-- CreateIndex
CREATE INDEX "LessonFile_lessonId_idx" ON "LessonFile"("lessonId");

-- CreateIndex
CREATE INDEX "LessonFileView_fileId_idx" ON "LessonFileView"("fileId");

-- CreateIndex
CREATE INDEX "Assignment_lessonId_idx" ON "Assignment"("lessonId");

-- CreateIndex
CREATE INDEX "Submission_studentId_idx" ON "Submission"("studentId");

-- CreateIndex
CREATE INDEX "AiReviewCarryover_studentId_idx" ON "AiReviewCarryover"("studentId");

-- CreateIndex

-- CreateIndex
CREATE INDEX "QuizAttempt_studentId_idx" ON "QuizAttempt"("studentId");

-- CreateIndex
CREATE INDEX "AttendanceSession_lessonId_idx" ON "AttendanceSession"("lessonId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_studentId_idx" ON "AttendanceRecord"("studentId");

-- CreateIndex
CREATE INDEX "ExtraHomework_sessionId_idx" ON "ExtraHomework"("sessionId");

-- CreateIndex
CREATE INDEX "HomeworkMark_studentId_idx" ON "HomeworkMark"("studentId");

-- CreateIndex
CREATE INDEX "AttendanceExclusion_studentId_idx" ON "AttendanceExclusion"("studentId");

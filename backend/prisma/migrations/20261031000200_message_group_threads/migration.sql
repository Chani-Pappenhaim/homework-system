-- A conversation becomes a thread with participants: one student (DIRECT) or a
-- whole group (GROUP_VISIBLE / GROUP_BCC). Every existing conversation becomes
-- a DIRECT thread whose one participant is its student, keeping its id, its
-- entries and both sides' read state.

-- CreateEnum
CREATE TYPE "ThreadAudience" AS ENUM ('DIRECT', 'GROUP_VISIBLE', 'GROUP_BCC');

-- AlterTable: the thread's kind, optional subject and the group it went to
ALTER TABLE "TeacherMessage" ADD COLUMN "audience" "ThreadAudience" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN "groupId" TEXT,
ADD COLUMN "subject" TEXT;

-- CreateTable
CREATE TABLE "ThreadParticipant" (
    "threadId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadParticipant_pkey" PRIMARY KEY ("threadId","studentId")
);

-- CreateTable
CREATE TABLE "EntryReaction" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "reactorId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryReaction_pkey" PRIMARY KEY ("id")
);

-- AlterTable: who wrote each entry, and who may see it
ALTER TABLE "MessageEntry" ADD COLUMN "authorId" TEXT,
ADD COLUMN "privateToStudentId" TEXT;

-- DataMigration: each conversation's student becomes its one participant. She
-- has read everything up to just before the oldest teacher entry she had not
-- seen yet, so exactly those entries stay unread for her; with nothing unread,
-- she has read it all.
INSERT INTO "ThreadParticipant" ("threadId", "studentId", "lastReadAt", "createdAt")
SELECT m."id",
       m."studentId",
       COALESCE(
         (SELECT MIN(e."createdAt") FROM "MessageEntry" e
           WHERE e."messageId" = m."id" AND e."fromTeacher" = true AND e."isRead" = false)
           - INTERVAL '1 millisecond',
         CURRENT_TIMESTAMP
       ),
       m."createdAt"
FROM "TeacherMessage" m
ON CONFLICT ("threadId", "studentId") DO NOTHING;

-- DataMigration: an entry the student wrote is authored by the conversation's student
UPDATE "MessageEntry" e
SET "authorId" = m."studentId"
FROM "TeacherMessage" m
WHERE e."messageId" = m."id" AND e."fromTeacher" = false;

-- DataMigration: "isRead" now only means "the teacher has seen it"; the
-- teacher's own entries have nothing for her to read
UPDATE "MessageEntry" SET "isRead" = true WHERE "fromTeacher" = true;

ALTER TABLE "MessageEntry" RENAME COLUMN "isRead" TO "readByTeacher";

-- AlterTable: authorship and the student are now carried by authorId and ThreadParticipant
ALTER TABLE "MessageEntry" DROP COLUMN "fromTeacher";

-- DropForeignKey
ALTER TABLE "TeacherMessage" DROP CONSTRAINT "TeacherMessage_studentId_fkey";

-- AlterTable
ALTER TABLE "TeacherMessage" DROP COLUMN "studentId";

-- CreateIndex
CREATE INDEX "ThreadParticipant_studentId_idx" ON "ThreadParticipant"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "EntryReaction_entryId_reactorId_emoji_key" ON "EntryReaction"("entryId", "reactorId", "emoji");

-- AddForeignKey
ALTER TABLE "TeacherMessage" ADD CONSTRAINT "TeacherMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadParticipant" ADD CONSTRAINT "ThreadParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "TeacherMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadParticipant" ADD CONSTRAINT "ThreadParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageEntry" ADD CONSTRAINT "MessageEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageEntry" ADD CONSTRAINT "MessageEntry_privateToStudentId_fkey" FOREIGN KEY ("privateToStudentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryReaction" ADD CONSTRAINT "EntryReaction_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MessageEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryReaction" ADD CONSTRAINT "EntryReaction_reactorId_fkey" FOREIGN KEY ("reactorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

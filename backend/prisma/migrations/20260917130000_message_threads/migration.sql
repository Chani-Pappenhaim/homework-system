-- CreateTable
CREATE TABLE "MessageEntry" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromTeacher" BOOLEAN NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageEntry_messageId_idx" ON "MessageEntry"("messageId");

-- AddForeignKey
ALTER TABLE "MessageEntry" ADD CONSTRAINT "MessageEntry_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TeacherMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: the original message becomes the conversation's first entry
INSERT INTO "MessageEntry" ("id", "messageId", "fromTeacher", "content", "isRead", "createdAt")
SELECT gen_random_uuid(), "id", "fromTeacher", "content", "isRead", "createdAt"
FROM "TeacherMessage";

-- DataMigration: an existing single reply becomes the second entry, authored by the other side
INSERT INTO "MessageEntry" ("id", "messageId", "fromTeacher", "content", "isRead", "createdAt")
SELECT gen_random_uuid(), "id", NOT "fromTeacher", "replyContent", COALESCE("replySeen", false), COALESCE("repliedAt", "createdAt")
FROM "TeacherMessage"
WHERE "replyContent" IS NOT NULL;

-- AlterTable: the single message/reply columns are now represented by MessageEntry rows
ALTER TABLE "TeacherMessage" DROP COLUMN "content";
ALTER TABLE "TeacherMessage" DROP COLUMN "fromTeacher";
ALTER TABLE "TeacherMessage" DROP COLUMN "isRead";
ALTER TABLE "TeacherMessage" DROP COLUMN "replyContent";
ALTER TABLE "TeacherMessage" DROP COLUMN "repliedAt";
ALTER TABLE "TeacherMessage" DROP COLUMN "replySeen";

-- Whether the author of an entry has seen a reaction someone else put on it.
-- Existing reactions count as seen so nobody gets a burst of old "unread" marks.
ALTER TABLE "EntryReaction" ADD COLUMN "seenByAuthor" BOOLEAN NOT NULL DEFAULT true;

import { enqueueEmail } from '../infrastructure/queues/enqueue-email';
import { enqueueStudentEmail } from './student-notifications.service';
import { entryAudience } from './messaging-policy';

export interface NotifiableParticipant {
  id: string;
  name: string;
  email: string;
}

export interface NotifiableEntry {
  authorId: string | null; // null = the teacher
  privateToStudentId: string | null;
  content: string;
}

/**
 * The one place that decides who is told about a new thread entry. Each
 * student it is for is emailed once; a private entry reaches only its
 * audience; a student's entry is mailed to the teacher alone (the other
 * participants of a visible group thread see it as unread in their inbox).
 * `opening` is the thread's first public message, or null when this entry is
 * itself the opening one.
 */
export async function notifyNewEntry(args: {
  threadId: string;
  participants: NotifiableParticipant[];
  entry: NotifiableEntry;
  opening: string | null;
}): Promise<void> {
  const { threadId, participants, entry, opening } = args;

  if (entry.authorId !== null) {
    const author = participants.find((p) => p.id === entry.authorId);
    if (!author) return;
    if (opening === null) {
      await enqueueEmail('student-message', {
        messageId: threadId, studentName: author.name, studentEmail: author.email, content: entry.content,
      });
    } else {
      await enqueueEmail('student-reply', {
        messageId: threadId, studentName: author.name, studentEmail: author.email,
        originalContent: opening, replyContent: entry.content,
      });
    }
    return;
  }

  const audience = new Set(entryAudience({ participantIds: participants.map((p) => p.id) }, entry));
  for (const student of participants.filter((p) => audience.has(p.id))) {
    if (opening === null) {
      await enqueueStudentEmail('teacher-message', {
        messageId: threadId, studentName: student.name, studentEmail: student.email, content: entry.content,
      });
    } else {
      await enqueueStudentEmail('teacher-reply', {
        messageId: threadId, studentName: student.name, studentEmail: student.email,
        originalContent: opening, replyContent: entry.content,
      });
    }
  }
}

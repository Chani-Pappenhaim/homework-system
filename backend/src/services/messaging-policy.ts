import type { Prisma, ThreadAudience } from '@prisma/client';
import { AppError } from '../utils/errors';

/**
 * Every messaging permission in one place: who may start which kind of
 * thread, who may see a thread, an entry, the other participants or a
 * reaction, and to whom a reply goes. The services only ask; letting students
 * start group threads, for instance, is a change here alone.
 */

/** Whoever is acting on the messages: the teacher (any admin) or one student. */
export type Viewer = { role: 'TEACHER'; userId: string } | { role: 'STUDENT'; userId: string };

/** Who a new entry is for. The teacher always sees every entry. */
export type ReplyScope =
  | { to: 'ALL' } // every participant
  | { to: 'TEACHER' } // a student writing to the teacher alone
  | { to: 'STUDENT'; studentId: string }; // the teacher writing to one participant alone

interface ThreadShape {
  audience: ThreadAudience;
  participantIds: string[];
}

const isTeacher = (viewer: Viewer) => viewer.role === 'TEACHER';

export const isGroupAudience = (audience: ThreadAudience) => audience !== 'DIRECT';

/** The teacher may start any thread; a student only a direct one with the teacher. */
export function canStartThread(viewer: Viewer, audience: ThreadAudience): boolean {
  return isTeacher(viewer) || audience === 'DIRECT';
}

export function assertCanStartThread(viewer: Viewer, audience: ThreadAudience): void {
  if (!canStartThread(viewer, audience)) {
    throw new AppError('Students cannot start group threads', 'אין אפשרות לשלוח הודעה לקבוצה', 403);
  }
}

/** The teacher sees every thread; a student only those she takes part in. */
export function canAccessThread(viewer: Viewer, thread: Pick<ThreadShape, 'participantIds'>): boolean {
  return isTeacher(viewer) || thread.participantIds.includes(viewer.userId);
}

/** A private entry is seen only by the teacher and the one student it is private to. */
export function canSeeEntry(viewer: Viewer, entry: { privateToStudentId: string | null }): boolean {
  return isTeacher(viewer) || entry.privateToStudentId === null || entry.privateToStudentId === viewer.userId;
}

/** The same rule as `canSeeEntry`, as a database filter. */
export function visibleEntriesWhere(viewer: Viewer): Prisma.MessageEntryWhereInput {
  if (isTeacher(viewer)) return {};
  return { OR: [{ privateToStudentId: null }, { privateToStudentId: viewer.userId }] };
}

/** Entries someone else wrote, as a database filter: what can be unread for the viewer. */
export function othersEntriesWhere(viewer: Viewer): Prisma.MessageEntryWhereInput {
  if (isTeacher(viewer)) return { authorId: { not: null } };
  return { OR: [{ authorId: null }, { authorId: { not: viewer.userId } }] };
}

/** Who else got the thread: the teacher always knows; a student only in a visible group thread. */
export function canSeeParticipants(viewer: Viewer, audience: ThreadAudience): boolean {
  return isTeacher(viewer) || audience === 'GROUP_VISIBLE';
}

/** Students' emails are the teacher's to see, never another student's. */
export function canSeeParticipantEmails(viewer: Viewer): boolean {
  return isTeacher(viewer);
}

/**
 * Reactions follow the entry, except that in a hidden-copy thread a student
 * never learns about the other students: she sees only her own and the teacher's.
 */
export function canSeeReaction(
  viewer: Viewer,
  audience: ThreadAudience,
  reactor: { id: string; isTeacher: boolean },
): boolean {
  if (isTeacher(viewer) || audience !== 'GROUP_BCC') return true;
  return reactor.isTeacher || reactor.id === viewer.userId;
}

/**
 * Whom a new entry is private to (null = every participant), for the scope its
 * writer asked for. In a direct thread everything is shared; in a hidden-copy
 * thread a student's reply is always between her and the teacher; in a visible
 * one she chooses. The teacher may write to everyone or to one participant.
 */
export function resolveEntryPrivacy(viewer: Viewer, thread: ThreadShape, scope: ReplyScope): string | null {
  if (thread.audience === 'DIRECT') return null;

  if (isTeacher(viewer)) {
    if (scope.to === 'ALL') return null;
    if (scope.to === 'STUDENT' && thread.participantIds.includes(scope.studentId)) return scope.studentId;
    throw new AppError('Invalid reply scope', 'יש לבחור למי לשלוח את התגובה', 400);
  }

  if (thread.audience === 'GROUP_BCC') return viewer.userId;
  if (scope.to === 'ALL') return null;
  if (scope.to === 'TEACHER') return viewer.userId;
  throw new AppError('Students cannot write privately to another student', 'אין אפשרות לשלוח הודעה פרטית לתלמידה אחרת', 403);
}

/** The participants a new entry is for, apart from its own writer. */
export function entryAudience(
  thread: Pick<ThreadShape, 'participantIds'>,
  entry: { authorId: string | null; privateToStudentId: string | null },
): string[] {
  const readers = entry.privateToStudentId ? [entry.privateToStudentId] : thread.participantIds;
  return readers.filter((id) => id !== entry.authorId);
}

/**
 * What a student's "delete" does: a direct thread is hers, so it is deleted;
 * a group thread is only removed from her own inbox.
 */
export function studentRemoval(audience: ThreadAudience): 'DELETE_THREAD' | 'HIDE_FOR_HER' {
  return isGroupAudience(audience) ? 'HIDE_FOR_HER' : 'DELETE_THREAD';
}

/**
 * The teacher may take back one of her own entries until anything was written
 * after it that its readers also see — a reply would otherwise answer nothing.
 */
export function canUnsendEntry(
  entry: { authorId: string | null; privateToStudentId: string | null; createdAt: Date },
  threadEntries: { privateToStudentId: string | null; createdAt: Date }[],
): boolean {
  if (entry.authorId !== null) return false;
  return !threadEntries.some((other) =>
    other.createdAt > entry.createdAt &&
    (entry.privateToStudentId === null ||
      other.privateToStudentId === null ||
      other.privateToStudentId === entry.privateToStudentId));
}

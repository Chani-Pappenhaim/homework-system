import type { Prisma, ThreadAudience } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { groupNameSelect } from '../utils/group-name';
import { isAllowedReaction } from '../utils/message-reactions';
import { notifyNewEntry } from './message-notifications';
import { aggregateReactions, toThreadDetail, toThreadSummary, type EntryRow } from './message-view';
import {
  assertCanStartThread,
  canAccessThread,
  canSeeEntry,
  canUnsendEntry,
  othersEntriesWhere,
  resolveEntryPrivacy,
  studentRemoval,
  visibleEntriesWhere,
  type ReplyScope,
  type Viewer,
} from './messaging-policy';

export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_SUBJECT_LENGTH = 120;

// One check for every entry point that writes a message entry, so a huge paste
// can't bloat the inbox (and the email built from it).
function messageText(content: unknown): string {
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) throw new AppError('Message content is required', 'תוכן ההודעה נדרש', 400);
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new AppError('Message too long', `ההודעה ארוכה מדי (עד ${MAX_MESSAGE_LENGTH} תווים)`, 400);
  }
  return trimmed;
}

/** The optional subject of a thread: trimmed, and null when left empty. */
export function threadSubject(subject: unknown): string | null {
  if (subject === undefined || subject === null) return null;
  if (typeof subject !== 'string') throw new AppError('Invalid subject', 'הנושא אינו תקין', 400);
  const trimmed = subject.trim();
  if (trimmed.length > MAX_SUBJECT_LENGTH) {
    throw new AppError('Subject too long', `הנושא ארוך מדי (עד ${MAX_SUBJECT_LENGTH} תווים)`, 400);
  }
  return trimmed || null;
}

const personSelect = { id: true, name: true, email: true } as const;
const authorSelect = { select: { id: true, name: true } } as const;
const reactionsInclude = { include: { reactor: { select: { id: true, name: true, role: true } } } } as const;
const teacherViewer = (userId: string): Viewer => ({ role: 'TEACHER', userId });
const studentViewer = (userId: string): Viewer => ({ role: 'STUDENT', userId });

function notFound(): AppError {
  return new AppError('Message not found', 'ההודעה לא נמצאה', 404);
}

// ---------------------------------------------------------------------------
// Starting threads
// ---------------------------------------------------------------------------

export interface NewThread {
  audience: ThreadAudience;
  participantIds: string[];
  content: unknown;
  subject?: unknown;
  groupId?: string | null;
  assignmentId?: unknown;
}

/**
 * Opens a thread with its first entry. The one door every new conversation
 * goes through, so the policy decides who may open which kind.
 */
export async function startThread(viewer: Viewer, input: NewThread) {
  assertCanStartThread(viewer, input.audience);
  const content = messageText(input.content);
  const subject = threadSubject(input.subject);
  if (input.participantIds.length === 0) throw new AppError('No participants', 'אין נמענות להודעה', 400);
  if (input.audience === 'DIRECT' && input.participantIds.length !== 1) {
    throw new AppError('A direct thread has one student', 'שיחה ישירה היא עם תלמידה אחת', 400);
  }

  const authorId = viewer.role === 'STUDENT' ? viewer.userId : null;
  const thread = await prisma.messageThread.create({
    data: {
      audience: input.audience,
      subject,
      groupId: input.groupId ?? null,
      assignmentId: typeof input.assignmentId === 'string' && input.assignmentId ? input.assignmentId : null,
      participants: { create: input.participantIds.map((studentId) => ({ studentId })) },
      entries: { create: { authorId, content, readByTeacher: authorId === null } },
    },
    include: { participants: { include: { student: { select: personSelect } } } },
  });

  await notifyNewEntry({
    threadId: thread.id,
    participants: thread.participants.map((p) => p.student),
    entry: { authorId, privateToStudentId: null, content },
    opening: null,
  });
  return thread;
}

/** A student writes to the teacher, optionally as a late-submission request. */
export function sendMessage(studentId: string, content: string, options: { assignmentId?: string; subject?: unknown } = {}) {
  return startThread(studentViewer(studentId), {
    audience: 'DIRECT', participantIds: [studentId], content, ...options,
  });
}

/** Lets the teacher start a new conversation with a student, instead of only ever replying to one the student started. */
export function sendTeacherMessage(
  teacherId: string,
  studentId: string,
  content: string,
  options: { assignmentId?: string; subject?: unknown } = {},
) {
  return startThread(teacherViewer(teacherId), {
    audience: 'DIRECT', participantIds: [studentId], content, ...options,
  });
}

/**
 * One message to every student of a group, as a single thread: visible to all
 * of them, or as hidden copies where each sees only her own exchange with the
 * teacher.
 */
export async function sendGroupMessage(
  teacherId: string,
  groupId: string,
  content: unknown,
  options: { audience: 'GROUP_VISIBLE' | 'GROUP_BCC'; subject?: unknown },
) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { students: { select: { studentId: true } } },
  });
  if (!group) throw new AppError('Group not found', 'הקבוצה לא נמצאה', 404);
  if (group.students.length === 0) throw new AppError('Group has no students', 'אין תלמידות בקבוצה הזו', 400);
  const thread = await startThread(teacherViewer(teacherId), {
    audience: options.audience,
    participantIds: group.students.map((s) => s.studentId),
    groupId,
    content,
    subject: options.subject,
  });
  return { id: thread.id, sent: group.students.length };
}

// ---------------------------------------------------------------------------
// Reading threads
// ---------------------------------------------------------------------------

/** When the thread last had a message: its newest entry, or its creation. */
function lastActivity(m: { createdAt: Date; lastEntry: { createdAt: Date } | null }): number {
  return (m.lastEntry?.createdAt ?? m.createdAt).getTime();
}

/**
 * Newest activity first: a conversation that just got a reply moves to the top,
 * where its new message is seen, rather than staying where it was started.
 */
function latestFirst<T extends { createdAt: Date; lastEntry: { createdAt: Date } | null }>(threads: T[]): T[] {
  return [...threads].sort((a, b) => lastActivity(b) - lastActivity(a));
}

/** Entry count and newest entry date per thread, for the entries matching `where`, in one grouped query. */
async function entryStatsByThread(threadIds: string[], ...where: Prisma.MessageEntryWhereInput[]) {
  const rows = await prisma.messageEntry.groupBy({
    by: ['threadId'],
    where: { AND: [{ threadId: { in: threadIds } }, ...where] },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  return new Map(rows.map((r) => [r.threadId, { count: r._count._all, latest: r._max.createdAt }]));
}

const summaryInclude = (viewer: Viewer) => ({
  group: { select: groupNameSelect },
  _count: { select: { participants: true } },
  entries: { where: visibleEntriesWhere(viewer), orderBy: { createdAt: 'desc' as const }, take: 1, include: { author: authorSelect } },
});

/** The teacher's inbox: one row per thread, however many students it went to. */
export async function getAllMessages(teacherId = '') {
  const viewer = teacherViewer(teacherId);
  const threads = await prisma.messageThread.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      ...summaryInclude(viewer),
      participants: { take: 1, include: { student: { select: personSelect } } },
    },
  });
  const ids = threads.map((t) => t.id);
  const [totals, unread] = await Promise.all([
    entryStatsByThread(ids),
    entryStatsByThread(ids, { authorId: { not: null }, readByTeacher: false }),
  ]);
  return latestFirst(threads.map((t) => toThreadSummary(
    viewer, t, t.participants, t._count.participants, t.entries[0],
    { total: totals.get(t.id)?.count ?? 0, unreadCount: unread.get(t.id)?.count ?? 0 },
  )));
}

/** A student's inbox: the threads she takes part in, minus those she removed and nothing newer arrived in. */
export async function getMyMessages(studentId: string) {
  const viewer = studentViewer(studentId);
  const threads = await prisma.messageThread.findMany({
    where: { participants: { some: { studentId } } },
    orderBy: { createdAt: 'desc' },
    include: { ...summaryInclude(viewer), participants: { where: { studentId } } },
  });
  const shown = threads.filter((t) => {
    const hiddenAt = t.participants[0]?.hiddenAt;
    const newest = t.entries[0]?.createdAt;
    return !hiddenAt || (newest !== undefined && newest > hiddenAt);
  });
  const ids = shown.map((t) => t.id);
  const visible = visibleEntriesWhere(viewer);
  const [totals, fromOthers] = await Promise.all([
    entryStatsByThread(ids, visible),
    entryStatsByThread(ids, visible, othersEntriesWhere(viewer)),
  ]);
  return latestFirst(shown.map((t) => {
    const readAt = t.participants[0]?.lastReadAt ?? null;
    const latestOther = fromOthers.get(t.id)?.latest ?? null;
    const unread = latestOther !== null && (readAt === null || latestOther > readAt);
    return toThreadSummary(
      viewer, t, t.participants, t._count.participants, t.entries[0],
      { total: totals.get(t.id)?.count ?? 0, unreadCount: unread ? 1 : 0 },
    );
  }));
}

/** One thread with all its entries, as far as this viewer may see it. */
export async function getThread(viewer: Viewer, threadId: string) {
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: {
      group: { select: groupNameSelect },
      participants: { include: { student: { select: personSelect } } },
      entries: {
        where: visibleEntriesWhere(viewer),
        orderBy: { createdAt: 'asc' },
        include: { author: authorSelect, reactions: reactionsInclude },
      },
    },
  });
  if (!thread || !canAccessThread(viewer, { participantIds: thread.participants.map((p) => p.studentId) })) {
    throw notFound();
  }
  return toThreadDetail(viewer, thread, thread.participants, thread.entries as EntryRow[]);
}

// ---------------------------------------------------------------------------
// Replying
// ---------------------------------------------------------------------------

/** A thread loaded with what is needed to add an entry to it. */
async function loadForReply(threadId: string) {
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: {
      participants: { include: { student: { select: personSelect } } },
      // The opening public message, which reply emails quote.
      entries: { where: { privateToStudentId: null }, orderBy: { createdAt: 'asc' }, take: 1, select: { content: true } },
    },
  });
  if (!thread) throw notFound();
  return thread;
}

async function addEntry(viewer: Viewer, threadId: string, content: unknown, scope: ReplyScope) {
  const thread = await loadForReply(threadId);
  const participantIds = thread.participants.map((p) => p.studentId);
  if (!canAccessThread(viewer, { participantIds })) throw notFound();

  const text = messageText(content);
  const privateToStudentId = resolveEntryPrivacy(viewer, { audience: thread.audience, participantIds }, scope);
  const authorId = viewer.role === 'STUDENT' ? viewer.userId : null;
  await prisma.messageEntry.create({
    data: { threadId, authorId, privateToStudentId, content: text, readByTeacher: authorId === null },
  });

  await notifyNewEntry({
    threadId,
    participants: thread.participants.map((p) => p.student),
    entry: { authorId, privateToStudentId, content: text },
    opening: thread.entries[0]?.content ?? '',
  });
  return getThread(viewer, threadId);
}

// The teacher adds another entry to a thread — works whether it's brand new or
// already has back-and-forth history, so the exchange never "locks".
export function replyMessage(teacherId: string, threadId: string, content: string, scope: ReplyScope = { to: 'ALL' }) {
  return addEntry(teacherViewer(teacherId), threadId, content, scope);
}

// The student adds another entry to a thread she takes part in — whether she
// started it or the teacher did, and however many entries already exist.
export function studentReplyMessage(
  threadId: string,
  studentId: string,
  content: string,
  scope: ReplyScope = { to: 'ALL' },
) {
  return addEntry(studentViewer(studentId), threadId, content, scope);
}

// ---------------------------------------------------------------------------
// Read state
// ---------------------------------------------------------------------------

// Restricted to entries students wrote: the teacher only "reads" content students wrote.
export async function markRead(threadId: string) {
  await prisma.messageEntry.updateMany({
    where: { threadId, authorId: { not: null } },
    data: { readByTeacher: true },
  });
}

/** Sets the teacher's read state back so the newest student entry is unread again. */
export async function markUnread(threadId: string) {
  const newest = await prisma.messageEntry.findFirst({
    where: { threadId, authorId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (newest) await prisma.messageEntry.update({ where: { id: newest.id }, data: { readByTeacher: false } });
}

// The teacher's inbox badge: every entry a student wrote that the teacher hasn't seen yet.
export async function getUnreadCount() {
  return prisma.messageEntry.count({ where: { authorId: { not: null }, readByTeacher: false } });
}

// Marks everything in the thread as seen by this student only.
export async function markMineRead(threadId: string, studentId: string) {
  await prisma.threadParticipant.updateMany({
    where: { threadId, studentId },
    data: { lastReadAt: new Date() },
  });
}

/** Sets this student's read state back to just before the newest entry she can see from someone else. */
export async function markMineUnread(threadId: string, studentId: string) {
  const viewer = studentViewer(studentId);
  const newest = await prisma.messageEntry.findFirst({
    where: { AND: [{ threadId }, visibleEntriesWhere(viewer), othersEntriesWhere(viewer)] },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!newest) return;
  await prisma.threadParticipant.updateMany({
    where: { threadId, studentId },
    data: { lastReadAt: new Date(newest.createdAt.getTime() - 1) },
  });
}

// The student's inbox badge: every entry from others she can see and hasn't seen yet.
export async function getUnreadReplyCount(studentId: string) {
  const viewer = studentViewer(studentId);
  const participations = await prisma.threadParticipant.findMany({
    where: { studentId },
    select: { threadId: true, lastReadAt: true, hiddenAt: true },
  });
  if (participations.length === 0) return 0;
  const perThread = participations.map(({ threadId, lastReadAt, hiddenAt }) => {
    const since = [lastReadAt, hiddenAt].filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0];
    return since ? { threadId, createdAt: { gt: since } } : { threadId };
  });
  return prisma.messageEntry.count({
    where: { AND: [visibleEntriesWhere(viewer), othersEntriesWhere(viewer), { OR: perThread }] },
  });
}

// ---------------------------------------------------------------------------
// Deleting
// ---------------------------------------------------------------------------

export async function deleteMessage(threadId: string) {
  await prisma.messageThread.delete({ where: { id: threadId } });
}

// Unsends the teacher's most recent entry in a thread, leaving everything before it intact.
export async function deleteLastTeacherEntry(teacherId: string, threadId: string) {
  const entries = await prisma.messageEntry.findMany({
    where: { threadId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, authorId: true, privateToStudentId: true, createdAt: true },
  });
  const last = entries.filter((e) => e.authorId === null).at(-1);
  if (last && canUnsendEntry(last, entries)) await prisma.messageEntry.delete({ where: { id: last.id } });
  return getThread(teacherViewer(teacherId), threadId);
}

/** A direct thread is hers to delete; a group thread is only removed from her own inbox. */
export async function deleteMyMessage(threadId: string, studentId: string) {
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    select: { audience: true, participants: { select: { studentId: true } } },
  });
  if (!thread || !canAccessThread(studentViewer(studentId), { participantIds: thread.participants.map((p) => p.studentId) })) {
    throw new AppError('Message not found', 'הודעה לא נמצאה', 404);
  }
  if (studentRemoval(thread.audience) === 'DELETE_THREAD') {
    await prisma.messageThread.delete({ where: { id: threadId } });
  } else {
    await prisma.threadParticipant.updateMany({ where: { threadId, studentId }, data: { hiddenAt: new Date() } });
  }
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

/** Puts the viewer's emoji on an entry she can see, or takes it off if it is already there. */
export async function toggleReaction(viewer: Viewer, threadId: string, entryId: string, emoji: unknown) {
  if (!isAllowedReaction(emoji)) throw new AppError('Reaction not allowed', 'האימוג׳י הזה אינו זמין', 400);

  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    select: {
      audience: true,
      participants: { select: { studentId: true } },
      entries: { where: { id: entryId }, select: { privateToStudentId: true } },
    },
  });
  const entry = thread?.entries[0];
  if (
    !thread || !entry ||
    !canAccessThread(viewer, { participantIds: thread.participants.map((p) => p.studentId) }) ||
    !canSeeEntry(viewer, entry)
  ) {
    throw notFound();
  }

  const key = { entryId, reactorId: viewer.userId, emoji };
  const existing = await prisma.entryReaction.findUnique({ where: { entryId_reactorId_emoji: key } });
  if (existing) await prisma.entryReaction.delete({ where: { id: existing.id } });
  else await prisma.entryReaction.create({ data: key });

  const rows = await prisma.entryReaction.findMany({ where: { entryId }, ...reactionsInclude });
  return aggregateReactions(viewer, thread.audience, rows);
}

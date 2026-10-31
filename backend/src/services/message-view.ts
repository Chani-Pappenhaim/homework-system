import type { ThreadAudience } from '@prisma/client';
import { groupDisplayName } from '../utils/group-name';
import { REACTION_EMOJIS } from '../utils/message-reactions';
import { canSeeParticipantEmails, canSeeParticipants, canSeeReaction, type Viewer } from './messaging-policy';
import { avatarLink } from '../utils/storage';

/**
 * Turns stored threads into what one particular viewer may see of them. All
 * the "who sees what" decisions come from the messaging policy; this module
 * only shapes the result.
 */

type Role = 'ADMIN' | 'STUDENT';

export interface ReactionRow {
  emoji: string;
  reactor: { id: string; name: string; role: Role };
}

export interface EntryRow {
  id: string;
  authorId: string | null;
  author: { id: string; name: string; avatarUrl?: string | null } | null;
  privateToStudentId: string | null;
  content: string;
  readByTeacher: boolean;
  createdAt: Date;
  reactions?: ReactionRow[];
}

export interface ParticipantRow {
  studentId: string;
  lastReadAt: Date | null;
  student?: { id: string; name: string; email: string };
}

export interface ThreadRow {
  id: string;
  audience: ThreadAudience;
  subject: string | null;
  groupId: string | null;
  group: { name: string; seminar: string | null; year: string | null } | null;
  assignmentId: string | null;
  createdAt: Date;
}

export interface ReactionDTO {
  emoji: string;
  count: number;
  mine: boolean;
  names: string[];
}

export interface EntryDTO {
  id: string;
  fromTeacher: boolean;
  mine: boolean;
  authorName: string | null;
  authorAvatarUrl: string | null; // only for an author the viewer may see named
  isPrivate: boolean;
  privateToStudentId: string | null; // only the teacher is told which student
  content: string;
  isRead: boolean;
  createdAt: Date;
  reactions: ReactionDTO[];
}

const isTeacher = (viewer: Viewer) => viewer.role === 'TEACHER';

/** Reactions grouped per emoji, counting only the ones this viewer may see. */
export function aggregateReactions(viewer: Viewer, audience: ThreadAudience, rows: ReactionRow[]): ReactionDTO[] {
  const visible = rows.filter((r) =>
    canSeeReaction(viewer, audience, { id: r.reactor.id, isTeacher: r.reactor.role === 'ADMIN' }));
  const order = (emoji: string) => {
    const i = (REACTION_EMOJIS as readonly string[]).indexOf(emoji);
    return i === -1 ? REACTION_EMOJIS.length : i;
  };
  return [...new Set(visible.map((r) => r.emoji))]
    .sort((a, b) => order(a) - order(b))
    .map((emoji) => {
      const ofEmoji = visible.filter((r) => r.emoji === emoji);
      return {
        emoji,
        count: ofEmoji.length,
        mine: ofEmoji.some((r) => r.reactor.id === viewer.userId),
        names: ofEmoji.map((r) =>
          r.reactor.id === viewer.userId ? 'אני' : r.reactor.role === 'ADMIN' ? 'המורה' : r.reactor.name),
      };
    });
}

export function toEntryDTO(
  viewer: Viewer,
  thread: Pick<ThreadRow, 'audience'>,
  lastReadAt: Date | null,
  entry: EntryRow,
): EntryDTO {
  const fromTeacher = entry.authorId === null;
  const mine = isTeacher(viewer) ? fromTeacher : entry.authorId === viewer.userId;
  const isRead = isTeacher(viewer)
    ? fromTeacher || entry.readByTeacher
    : mine || (lastReadAt !== null && entry.createdAt <= lastReadAt);
  const namesAuthor = isTeacher(viewer) || canSeeParticipants(viewer, thread.audience);
  return {
    id: entry.id,
    fromTeacher,
    mine,
    authorName: !fromTeacher && namesAuthor ? entry.author?.name ?? null : null,
    authorAvatarUrl:
      !fromTeacher && namesAuthor && entry.author?.avatarUrl ? avatarLink({ id: entry.author.id, avatarUrl: entry.author.avatarUrl }, viewer.userId) : null,
    isPrivate: entry.privateToStudentId !== null,
    privateToStudentId: isTeacher(viewer) ? entry.privateToStudentId : null,
    content: entry.content,
    isRead,
    createdAt: entry.createdAt,
    reactions: aggregateReactions(viewer, thread.audience, entry.reactions ?? []),
  };
}

function threadHeader(thread: ThreadRow, participantCount: number) {
  return {
    id: thread.id,
    audience: thread.audience,
    subject: thread.subject,
    groupId: thread.groupId,
    groupName: thread.group ? groupDisplayName(thread.group) : null,
    assignmentId: thread.assignmentId,
    createdAt: thread.createdAt,
    participantCount,
  };
}

/** The teacher's view of a direct thread names its one student. */
function directStudent(viewer: Viewer, thread: ThreadRow, participants: ParticipantRow[]) {
  const only = participants[0]?.student;
  return isTeacher(viewer) && thread.audience === 'DIRECT' && only ? only : undefined;
}

export interface ThreadStats {
  total: number; // entries this viewer can see
  unreadCount: number;
}

/** A row of the inbox list: the header, how many replies, whether it is unread, and the newest entry. */
export function toThreadSummary(
  viewer: Viewer,
  thread: ThreadRow,
  participants: ParticipantRow[],
  participantCount: number,
  lastEntry: EntryRow | undefined,
  stats: ThreadStats,
) {
  const own = participants.find((p) => p.studentId === viewer.userId);
  return {
    ...threadHeader(thread, participantCount),
    student: directStudent(viewer, thread, participants),
    // The opening message is not a reply.
    replyCount: Math.max(0, stats.total - 1),
    unreadCount: stats.unreadCount,
    unread: stats.unreadCount > 0,
    lastEntry: lastEntry ? toEntryDTO(viewer, thread, own?.lastReadAt ?? null, lastEntry) : null,
  };
}

/** The whole thread, as far as this viewer may see it. */
export function toThreadDetail(viewer: Viewer, thread: ThreadRow, participants: ParticipantRow[], entries: EntryRow[]) {
  const own = participants.find((p) => p.studentId === viewer.userId);
  const dtos = entries.map((e) => toEntryDTO(viewer, thread, own?.lastReadAt ?? null, e));
  return {
    ...threadHeader(thread, participants.length),
    student: directStudent(viewer, thread, participants),
    participants: canSeeParticipants(viewer, thread.audience)
      ? participants.map((p) => ({
          id: p.studentId,
          name: p.student?.name ?? '',
          ...(canSeeParticipantEmails(viewer) ? { email: p.student?.email ?? '' } : {}),
        }))
      : null,
    replyCount: Math.max(0, dtos.length - 1),
    unread: dtos.some((e) => !e.isRead),
    entries: dtos,
  };
}

import type { MessageDetailDTO, MessageDTO, MessageEntryDTO } from '@/types';

/** An entry of a thread as the API returns it, with the fields a test does not care about filled in. */
export function entry(over: Partial<MessageEntryDTO> & { id: string }): MessageEntryDTO {
  return {
    fromTeacher: false,
    mine: false,
    authorName: null,
    isPrivate: false,
    privateToStudentId: null,
    content: `תוכן ${over.id}`,
    isRead: true,
    createdAt: '2026-07-01T09:00:00Z',
    reactions: [],
    ...over,
  };
}

/** A row of the message list. */
export function listRow(over: Partial<MessageDTO> & { id: string }): MessageDTO {
  return {
    audience: 'DIRECT',
    subject: null,
    groupId: null,
    groupName: null,
    assignmentId: null,
    createdAt: '2026-07-01T09:00:00Z',
    participantCount: 1,
    student: { id: 's1', name: 'דנה', email: 'dana@x.com' },
    replyCount: 0,
    unreadCount: 0,
    unread: false,
    lastEntry: null,
    ...over,
  } as MessageDTO;
}

/** An open thread. */
export function detail(over: Partial<MessageDetailDTO> & { id: string }, entries: MessageEntryDTO[]): MessageDetailDTO {
  return {
    audience: 'DIRECT',
    subject: null,
    groupId: null,
    groupName: null,
    assignmentId: null,
    createdAt: '2026-07-01T09:00:00Z',
    participantCount: 1,
    student: { id: 's1', name: 'דנה', email: 'dana@x.com' },
    participants: null,
    replyCount: Math.max(0, entries.length - 1),
    unread: false,
    entries,
    ...over,
  } as MessageDetailDTO;
}

/** The axios envelope the pages unwrap. */
export const wrap = <T,>(data: T) => ({ data: { data } });

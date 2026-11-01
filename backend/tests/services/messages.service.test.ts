import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    messageThread: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    messageEntry: {
      create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), count: vi.fn(), update: vi.fn(),
      updateMany: vi.fn(), delete: vi.fn(),
    },
    threadParticipant: { findMany: vi.fn(), updateMany: vi.fn() },
    entryReaction: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    group: { findUnique: vi.fn() },
  },
}));
vi.mock('../../src/infrastructure/queues/enqueue-email', () => ({ enqueueEmail: vi.fn() }));
// Student emails go through the quiet-hours wrapper; here it just forwards to the mocked queue.
vi.mock('../../src/services/student-notifications.service', async () => {
  const { enqueueEmail } = await import('../../src/infrastructure/queues/enqueue-email');
  return { enqueueStudentEmail: (name: string, data: unknown) => (enqueueEmail as any)(name, data) };
});

import { prisma } from '../../src/config/prisma';
import { enqueueEmail } from '../../src/infrastructure/queues/enqueue-email';
import {
  sendMessage, sendTeacherMessage, sendGroupMessage, replyMessage, studentReplyMessage, startThread,
  MAX_MESSAGE_LENGTH, MAX_SUBJECT_LENGTH, threadSubject, getAllMessages, getMyMessages, getThread,
  markMineUnread, markUnread, markRead, getUnreadCount, markMineRead, getUnreadReplyCount, deleteMyMessage, deleteMessage,
  deleteLastTeacherEntry, toggleReaction,
} from '../../src/services/messages.service';

const p = prisma as any;
const email = enqueueEmail as any;
const tooLong = 'א'.repeat(MAX_MESSAGE_LENGTH + 1);
const at = (d: number, h = 10) => new Date(Date.UTC(2026, 9, d, h));
const T = { role: 'TEACHER', userId: 't1' } as const;
const S1 = { role: 'STUDENT', userId: 's1' } as const;
const person = (id: string) => ({ id, name: `name-${id}`, email: `${id}@x.com` });

/** A thread as `create` / `findUnique` return it, with the given students. */
const threadOf = (audience: string, ids: string[], extra: object = {}) => ({
  id: 'th1', audience, subject: null, groupId: null, group: null, assignmentId: null, createdAt: at(1),
  participants: ids.map((id) => ({ studentId: id, lastReadAt: null, hiddenAt: null, student: person(id) })),
  entries: [],
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  p.messageThread.create.mockImplementation(async ({ data }: any) =>
    threadOf(data.audience, data.participants.create.map((x: any) => x.studentId)));
  p.entryReaction.findMany.mockResolvedValue([]);
  p.entryReaction.count.mockResolvedValue(0);
});

describe('content and subject limits', () => {
  it('rejects an over-long message on every entry point', async () => {
    p.messageThread.findUnique.mockResolvedValue(threadOf('DIRECT', ['s1']));
    await expect(sendMessage('s1', tooLong)).rejects.toMatchObject({ status: 400 });
    await expect(sendTeacherMessage('t1', 's1', tooLong)).rejects.toMatchObject({ status: 400 });
    await expect(replyMessage('t1', 'th1', tooLong)).rejects.toMatchObject({ status: 400 });
    await expect(studentReplyMessage('th1', 's1', tooLong)).rejects.toMatchObject({ status: 400 });
    expect(p.messageThread.create).not.toHaveBeenCalled();
    expect(p.messageEntry.create).not.toHaveBeenCalled();
  });

  it('rejects an empty or non-text reply', async () => {
    p.messageThread.findUnique.mockResolvedValue(threadOf('DIRECT', ['s1']));
    await expect(replyMessage('t1', 'th1', '   ')).rejects.toMatchObject({ status: 400 });
    await expect(studentReplyMessage('th1', 's1', 42 as any)).rejects.toMatchObject({ status: 400 });
  });

  it('stores a message at the limit, trimmed', async () => {
    await sendMessage('s1', `  ${'א'.repeat(MAX_MESSAGE_LENGTH)}  `);
    const content = p.messageThread.create.mock.calls[0][0].data.entries.create.content;
    expect(content).toHaveLength(MAX_MESSAGE_LENGTH);
  });

  it('validates the subject: trims it, turns empty into null, caps its length', () => {
    expect(threadSubject('  שאלה  ')).toBe('שאלה');
    expect(threadSubject('   ')).toBeNull();
    expect(threadSubject(undefined)).toBeNull();
    expect(threadSubject(null)).toBeNull();
    expect(threadSubject('א'.repeat(MAX_SUBJECT_LENGTH))).toHaveLength(MAX_SUBJECT_LENGTH);
    expect(() => threadSubject('א'.repeat(MAX_SUBJECT_LENGTH + 1))).toThrowError(expect.objectContaining({ status: 400 }));
    expect(() => threadSubject(7)).toThrowError(expect.objectContaining({ status: 400 }));
  });

  it('refuses an over-long subject before anything is stored', async () => {
    await expect(sendMessage('s1', 'hi', { subject: 'א'.repeat(MAX_SUBJECT_LENGTH + 1) })).rejects.toMatchObject({ status: 400 });
    expect(p.messageThread.create).not.toHaveBeenCalled();
  });

  it('stores the trimmed subject on the thread', async () => {
    await sendTeacherMessage('t1', 's1', 'hi', { subject: '  נושא  ' });
    expect(p.messageThread.create.mock.calls[0][0].data.subject).toBe('נושא');
  });
});

describe('starting direct threads', () => {
  it('opens one thread with one participant, the student as author, and tells the teacher', async () => {
    await sendMessage('s1', 'שלום', { assignmentId: 'a1' });
    const data = p.messageThread.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      audience: 'DIRECT', groupId: null, assignmentId: 'a1',
      participants: { create: [{ studentId: 's1' }] },
      entries: { create: { authorId: 's1', content: 'שלום', readByTeacher: false } },
    });
    expect(email).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledWith('student-message', expect.objectContaining({ messageId: 'th1', content: 'שלום' }));
  });

  it('lets the teacher write first and emails the student', async () => {
    await sendTeacherMessage('t1', 's1', 'שלום');
    expect(p.messageThread.create.mock.calls[0][0].data.entries.create).toMatchObject({ authorId: null, readByTeacher: true });
    expect(email).toHaveBeenCalledWith('teacher-message', expect.objectContaining({ studentEmail: 's1@x.com' }));
  });

  it('refuses a direct thread with several students', async () => {
    await expect(startThread(T, { audience: 'DIRECT', participantIds: ['s1', 's2'], content: 'x' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('never lets a student start a group thread', async () => {
    await expect(startThread(S1, { audience: 'GROUP_VISIBLE', participantIds: ['s1', 's2'], content: 'x' }))
      .rejects.toMatchObject({ status: 403 });
    await expect(startThread(S1, { audience: 'GROUP_BCC', participantIds: ['s1', 's2'], content: 'x' }))
      .rejects.toMatchObject({ status: 403 });
    expect(p.messageThread.create).not.toHaveBeenCalled();
  });
});

describe('sendGroupMessage', () => {
  beforeEach(() => {
    p.group.findUnique.mockResolvedValue({ students: [{ studentId: 's1' }, { studentId: 's2' }, { studentId: 's3' }] });
  });

  it.each(['GROUP_VISIBLE', 'GROUP_BCC'] as const)('creates ONE %s thread with every student as participant', async (audience) => {
    const r = await sendGroupMessage('t1', 'g1', '  שיעור מחר מבוטל  ', { audience, subject: 'עדכון' });
    expect(r).toEqual({ id: 'th1', sent: 3 });
    expect(p.messageThread.create).toHaveBeenCalledTimes(1);
    expect(p.messageThread.create.mock.calls[0][0].data).toMatchObject({
      audience, groupId: 'g1', subject: 'עדכון',
      participants: { create: [{ studentId: 's1' }, { studentId: 's2' }, { studentId: 's3' }] },
      entries: { create: { authorId: null, content: 'שיעור מחר מבוטל', readByTeacher: true } },
    });
  });

  it('emails each student of the group exactly once', async () => {
    await sendGroupMessage('t1', 'g1', 'שלום', { audience: 'GROUP_BCC' });
    expect(email.mock.calls.map(([type, d]: any) => [type, d.studentEmail])).toEqual([
      ['teacher-message', 's1@x.com'], ['teacher-message', 's2@x.com'], ['teacher-message', 's3@x.com'],
    ]);
  });

  it('refuses an empty group, an unknown group and an empty message', async () => {
    p.group.findUnique.mockResolvedValue({ students: [] });
    await expect(sendGroupMessage('t1', 'g1', 'שלום', { audience: 'GROUP_VISIBLE' })).rejects.toMatchObject({ status: 400 });
    p.group.findUnique.mockResolvedValue(null);
    await expect(sendGroupMessage('t1', 'nope', 'שלום', { audience: 'GROUP_VISIBLE' })).rejects.toMatchObject({ status: 404 });
    p.group.findUnique.mockResolvedValue({ students: [{ studentId: 's1' }] });
    await expect(sendGroupMessage('t1', 'g1', '   ', { audience: 'GROUP_VISIBLE' })).rejects.toMatchObject({ status: 400 });
    expect(p.messageThread.create).not.toHaveBeenCalled();
  });
});

describe('replying', () => {
  const load = (audience: string, ids = ['s1', 's2', 's3']) => {
    const t = threadOf(audience, ids, { entries: [{ content: 'opening' }] });
    p.messageThread.findUnique.mockResolvedValue(t);
    return t;
  };

  it('stores a student reply in a hidden-copy thread as private to her and emails only the teacher', async () => {
    load('GROUP_BCC');
    await studentReplyMessage('th1', 's1', 'שאלה', { to: 'ALL' });
    expect(p.messageEntry.create.mock.calls[0][0].data).toMatchObject({ authorId: 's1', privateToStudentId: 's1' });
    expect(email).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledWith('student-reply', expect.objectContaining({ originalContent: 'opening', replyContent: 'שאלה' }));
  });

  it('stores a student reply in a visible thread for everyone by default, or for the teacher alone', async () => {
    load('GROUP_VISIBLE');
    await studentReplyMessage('th1', 's1', 'לכולן');
    await studentReplyMessage('th1', 's1', 'למורה', { to: 'TEACHER' });
    expect(p.messageEntry.create.mock.calls.map(([a]: any) => a.data.privateToStudentId)).toEqual([null, 's1']);
  });

  it('emails every student when the teacher replies to everyone, but only one for a private reply', async () => {
    load('GROUP_BCC');
    await replyMessage('t1', 'th1', 'לכולן');
    expect(email).toHaveBeenCalledTimes(3);
    email.mockClear();
    await replyMessage('t1', 'th1', 'רק לך', { to: 'STUDENT', studentId: 's2' });
    expect(email).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledWith('teacher-reply', expect.objectContaining({ studentEmail: 's2@x.com' }));
    expect(p.messageEntry.create.mock.calls[1][0].data.privateToStudentId).toBe('s2');
  });

  it('hides a thread from a student who is not in it', async () => {
    load('GROUP_VISIBLE', ['s2']);
    await expect(studentReplyMessage('th1', 's1', 'x')).rejects.toMatchObject({ status: 404 });
    expect(p.messageEntry.create).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown thread', async () => {
    p.messageThread.findUnique.mockResolvedValue(null);
    await expect(replyMessage('t1', 'nope', 'x')).rejects.toMatchObject({ status: 404 });
  });
});

describe('inbox lists', () => {
  const summaryThread = (id: string, createdAt: Date, lastAt?: Date, extra: object = {}) => ({
    ...threadOf('DIRECT', ['s1']), id, createdAt,
    _count: { participants: 1 },
    entries: lastAt ? [{ id: `${id}-e`, authorId: null, author: null, privateToStudentId: null, content: 'c', readByTeacher: true, createdAt: lastAt }] : [],
    ...extra,
  });

  it('puts the thread with the newest message first, not the newest thread', async () => {
    p.messageThread.findMany.mockResolvedValue([
      summaryThread('new-quiet', at(20), at(20)),
      summaryThread('old-replied', at(10), at(24)),
      summaryThread('empty', at(15)),
    ]);
    p.messageEntry.groupBy.mockResolvedValue([]);
    expect((await getAllMessages('t1')).map((m: any) => m.id)).toEqual(['old-replied', 'new-quiet', 'empty']);
    expect((await getMyMessages('s1')).map((m: any) => m.id)).toEqual(['old-replied', 'new-quiet', 'empty']);
  });

  it('counts replies per thread from the grouped query, not from loaded entries', async () => {
    p.messageThread.findMany.mockResolvedValue([summaryThread('a', at(1), at(2)), summaryThread('b', at(3), at(3))]);
    p.messageEntry.groupBy
      .mockResolvedValueOnce([{ threadId: 'a', _count: { _all: 4 }, _max: { createdAt: at(2) } }, { threadId: 'b', _count: { _all: 1 }, _max: { createdAt: at(3) } }])
      .mockResolvedValueOnce([]);
    const rows: any[] = await getAllMessages('t1');
    expect(rows.find((r) => r.id === 'a').replyCount).toBe(3);
    expect(rows.find((r) => r.id === 'b').replyCount).toBe(0);
    expect(p.messageEntry.groupBy).toHaveBeenCalledTimes(2);
  });

  it('counts for a student only the entries she can see', async () => {
    p.messageThread.findMany.mockResolvedValue([summaryThread('a', at(1), at(2))]);
    p.messageEntry.groupBy.mockResolvedValue([]);
    await getMyMessages('s1');
    const visibleFilter = { OR: [{ privateToStudentId: null }, { privateToStudentId: 's1' }] };
    for (const [args] of p.messageEntry.groupBy.mock.calls) expect(args.where.AND).toContainEqual(visibleFilter);
    // The teacher's count has no visibility filter.
    p.messageEntry.groupBy.mockClear();
    await getAllMessages('t1');
    expect(p.messageEntry.groupBy.mock.calls[0][0].where.AND).toEqual([{ threadId: { in: ['a'] } }]);
  });

  it('marks a student thread unread when someone else wrote after her last read', async () => {
    p.messageThread.findMany.mockResolvedValue([
      summaryThread('read', at(1), at(2), { participants: [{ studentId: 's1', lastReadAt: at(3), hiddenAt: null }] }),
      summaryThread('unread', at(1), at(5), { participants: [{ studentId: 's1', lastReadAt: at(3), hiddenAt: null }] }),
      summaryThread('never', at(1), at(5), { participants: [{ studentId: 's1', lastReadAt: null, hiddenAt: null }] }),
    ]);
    p.messageEntry.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { threadId: 'read', _count: { _all: 1 }, _max: { createdAt: at(2) } },
        { threadId: 'unread', _count: { _all: 1 }, _max: { createdAt: at(5) } },
        { threadId: 'never', _count: { _all: 1 }, _max: { createdAt: at(5) } },
      ]);
    const rows: any[] = await getMyMessages('s1');
    expect(Object.fromEntries(rows.map((r) => [r.id, r.unread]))).toEqual({ read: false, unread: true, never: true });
  });

  it('leaves out a thread she removed unless something newer arrived', async () => {
    const hidden = (lastAt: Date) => summaryThread('g', at(1), lastAt, {
      audience: 'GROUP_VISIBLE', participants: [{ studentId: 's1', lastReadAt: null, hiddenAt: at(5) }],
    });
    p.messageEntry.groupBy.mockResolvedValue([]);
    p.messageThread.findMany.mockResolvedValue([hidden(at(4))]);
    expect(await getMyMessages('s1')).toEqual([]);
    p.messageThread.findMany.mockResolvedValue([hidden(at(6))]);
    expect(await getMyMessages('s1')).toHaveLength(1);
  });

  it('shows the teacher the unread count of student entries per thread', async () => {
    p.messageThread.findMany.mockResolvedValue([summaryThread('a', at(1), at(2))]);
    p.messageEntry.groupBy
      .mockResolvedValueOnce([{ threadId: 'a', _count: { _all: 3 }, _max: { createdAt: at(2) } }])
      .mockResolvedValueOnce([{ threadId: 'a', _count: { _all: 2 }, _max: { createdAt: at(2) } }]);
    const [row]: any[] = await getAllMessages('t1');
    expect(row).toMatchObject({ unreadCount: 2, unread: true, replyCount: 2 });
  });
});

describe('getThread', () => {
  it('returns only the entries the database filter lets through, and hides a thread from outsiders', async () => {
    p.messageThread.findUnique.mockResolvedValue(threadOf('GROUP_BCC', ['s2']));
    await expect(getThread(S1, 'th1')).rejects.toMatchObject({ status: 404 });
    p.messageThread.findUnique.mockResolvedValue(threadOf('GROUP_BCC', ['s1', 's2']));
    await getThread(S1, 'th1');
    expect(p.messageThread.findUnique.mock.calls[1][0].include.entries.where)
      .toEqual({ OR: [{ privateToStudentId: null }, { privateToStudentId: 's1' }] });
    await getThread(T, 'th1');
    expect(p.messageThread.findUnique.mock.calls[2][0].include.entries.where).toEqual({});
  });

  it('answers 404 for an unknown thread', async () => {
    p.messageThread.findUnique.mockResolvedValue(null);
    await expect(getThread(T, 'nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('unread reactions', () => {
  it('marks reactions on the teacher entries seen when the teacher opens the thread', async () => {
    await markRead('th1');
    expect(p.entryReaction.updateMany).toHaveBeenCalledWith({
      where: { seenByAuthor: false, entry: { threadId: 'th1', authorId: null } }, data: { seenByAuthor: true },
    });
  });

  it('marks reactions on her own entries seen when a student opens the thread', async () => {
    await markMineRead('th1', 's1');
    expect(p.entryReaction.updateMany).toHaveBeenCalledWith({
      where: { seenByAuthor: false, entry: { threadId: 'th1', authorId: 's1' } }, data: { seenByAuthor: true },
    });
  });

  it('adds unseen reactions to the teacher badge', async () => {
    p.messageEntry.count.mockResolvedValue(2);
    p.entryReaction.count.mockResolvedValue(3);
    expect(await getUnreadCount()).toBe(5);
  });

  it('adds unseen reactions to a student badge', async () => {
    p.threadParticipant.findMany.mockResolvedValue([{ threadId: 'th1', lastReadAt: null, hiddenAt: null }]);
    p.messageEntry.count.mockResolvedValue(1);
    p.entryReaction.count.mockResolvedValue(2);
    expect(await getUnreadReplyCount('s1')).toBe(3);
  });

  it('shows a thread as unread for a student whose entry got a reaction', async () => {
    p.messageThread.findMany.mockResolvedValue([{
      id: 'th1', audience: 'DIRECT', createdAt: at(1), entries: [], participants: [{ studentId: 's1', lastReadAt: at(9), hiddenAt: null }],
      _count: { participants: 1 }, group: null,
    }]);
    p.messageEntry.groupBy.mockResolvedValue([]);
    p.entryReaction.findMany.mockResolvedValue([{ entry: { threadId: 'th1' } }]);
    const rows: any[] = await getMyMessages('s1');
    expect(rows[0].unreadCount).toBe(1);
  });
});

describe('read state', () => {
  it('marks the teacher side read and unread (newest student entry only)', async () => {
    await markRead('th1');
    expect(p.messageEntry.updateMany).toHaveBeenCalledWith({ where: { threadId: 'th1', authorId: { not: null } }, data: { readByTeacher: true } });
    p.messageEntry.findFirst.mockResolvedValue({ id: 'e9' });
    await markUnread('th1');
    expect(p.messageEntry.update).toHaveBeenCalledWith({ where: { id: 'e9' }, data: { readByTeacher: false } });
  });

  it('does nothing when there is no student entry to mark unread', async () => {
    p.messageEntry.findFirst.mockResolvedValue(null);
    await markUnread('th1');
    expect(p.messageEntry.update).not.toHaveBeenCalled();
  });

  it('marks a thread read for one student only', async () => {
    await markMineRead('th1', 's1');
    expect(p.threadParticipant.updateMany).toHaveBeenCalledWith({
      where: { threadId: 'th1', studentId: 's1' }, data: { lastReadAt: expect.any(Date) },
    });
  });

  it('marks unread by setting her read time just before the newest entry she can see from others', async () => {
    p.messageEntry.findFirst.mockResolvedValue({ createdAt: at(5) });
    await markMineUnread('th1', 's1');
    const where = p.messageEntry.findFirst.mock.calls[0][0].where.AND;
    expect(where).toContainEqual({ OR: [{ privateToStudentId: null }, { privateToStudentId: 's1' }] });
    expect(where).toContainEqual({ OR: [{ authorId: null }, { authorId: { not: 's1' } }] });
    expect(p.threadParticipant.updateMany).toHaveBeenCalledWith({
      where: { threadId: 'th1', studentId: 's1' }, data: { lastReadAt: new Date(at(5).getTime() - 1) },
    });
  });

  it('leaves her read time alone when nobody else wrote', async () => {
    p.messageEntry.findFirst.mockResolvedValue(null);
    await markMineUnread('th1', 's1');
    expect(p.threadParticipant.updateMany).not.toHaveBeenCalled();
  });

  it('counts a student badge from entries newer than her read time or removal', async () => {
    p.threadParticipant.findMany.mockResolvedValue([
      { threadId: 'a', lastReadAt: at(3), hiddenAt: null },
      { threadId: 'b', lastReadAt: at(3), hiddenAt: at(6) },
      { threadId: 'c', lastReadAt: null, hiddenAt: null },
    ]);
    p.messageEntry.count.mockResolvedValue(4);
    expect(await getUnreadReplyCount('s1')).toBe(4);
    const clauses = p.messageEntry.count.mock.calls[0][0].where.AND;
    expect(clauses[2]).toEqual({ OR: [
      { threadId: 'a', createdAt: { gt: at(3) } },
      { threadId: 'b', createdAt: { gt: at(6) } },
      { threadId: 'c' },
    ] });
  });

  it('has no badge without participations', async () => {
    p.threadParticipant.findMany.mockResolvedValue([]);
    expect(await getUnreadReplyCount('s1')).toBe(0);
    expect(p.messageEntry.count).not.toHaveBeenCalled();
  });
});

describe('deleting', () => {
  it('deletes a direct thread for the student, but only hides a group thread', async () => {
    p.messageThread.findUnique.mockResolvedValue({ audience: 'DIRECT', participants: [{ studentId: 's1' }] });
    await deleteMyMessage('th1', 's1');
    expect(p.messageThread.delete).toHaveBeenCalledWith({ where: { id: 'th1' } });

    p.messageThread.delete.mockClear();
    p.messageThread.findUnique.mockResolvedValue({ audience: 'GROUP_BCC', participants: [{ studentId: 's1' }, { studentId: 's2' }] });
    await deleteMyMessage('th1', 's1');
    expect(p.messageThread.delete).not.toHaveBeenCalled();
    expect(p.threadParticipant.updateMany).toHaveBeenCalledWith({
      where: { threadId: 'th1', studentId: 's1' }, data: { hiddenAt: expect.any(Date) },
    });
  });

  it('answers 404 to a student who is not in the thread', async () => {
    p.messageThread.findUnique.mockResolvedValue({ audience: 'DIRECT', participants: [{ studentId: 's2' }] });
    await expect(deleteMyMessage('th1', 's1')).rejects.toMatchObject({ status: 404 });
    p.messageThread.findUnique.mockResolvedValue(null);
    await expect(deleteMyMessage('th1', 's1')).rejects.toMatchObject({ status: 404 });
  });

  it('lets the teacher delete a whole thread', async () => {
    await deleteMessage('th1');
    expect(p.messageThread.delete).toHaveBeenCalledWith({ where: { id: 'th1' } });
  });

  it('unsends the teacher latest entry only while nothing visible followed it', async () => {
    p.messageThread.findUnique.mockResolvedValue(threadOf('DIRECT', ['s1']));
    const mine = { id: 'e1', authorId: null, privateToStudentId: null, createdAt: at(1) };
    p.messageEntry.findMany.mockResolvedValue([mine]);
    await deleteLastTeacherEntry('t1', 'th1');
    expect(p.messageEntry.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });

    p.messageEntry.delete.mockClear();
    p.messageEntry.findMany.mockResolvedValue([mine, { id: 'e2', authorId: 's1', privateToStudentId: null, createdAt: at(2) }]);
    await deleteLastTeacherEntry('t1', 'th1');
    expect(p.messageEntry.delete).not.toHaveBeenCalled();
  });
});

describe('toggleReaction', () => {
  const thread = (privateTo: string | null = null, audience = 'GROUP_VISIBLE', authorId: string | null = 's2') => ({
    audience, participants: [{ studentId: 's1' }, { studentId: 's2' }], entries: [{ privateToStudentId: privateTo, authorId }],
  });

  it('adds the reaction when absent and removes it when present', async () => {
    p.messageThread.findUnique.mockResolvedValue(thread());
    p.entryReaction.findUnique.mockResolvedValueOnce(null);
    p.entryReaction.findMany.mockResolvedValue([{ emoji: '👍', reactor: { id: 's1', name: 'x', role: 'STUDENT' } }]);
    const added = await toggleReaction(S1, 'th1', 'e1', '👍');
    expect(p.entryReaction.create).toHaveBeenCalledWith({ data: { entryId: 'e1', reactorId: 's1', emoji: '👍', seenByAuthor: false } });
    expect(added).toEqual([{ emoji: '👍', count: 1, mine: true, names: ['אני'] }]);

    p.entryReaction.findUnique.mockResolvedValueOnce({ id: 'r1' });
    p.entryReaction.findMany.mockResolvedValue([]);
    const removed = await toggleReaction(S1, 'th1', 'e1', '👍');
    expect(p.entryReaction.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    expect(removed).toEqual([]);
  });

  it('refuses an emoji outside the whitelist before touching the database', async () => {
    await expect(toggleReaction(S1, 'th1', 'e1', '💩')).rejects.toMatchObject({ status: 400 });
    expect(p.messageThread.findUnique).not.toHaveBeenCalled();
  });

  it('answers 404 for an entry the student cannot see, one that does not exist, or a thread she is not in', async () => {
    p.messageThread.findUnique.mockResolvedValue(thread('s2'));
    await expect(toggleReaction(S1, 'th1', 'e1', '👍')).rejects.toMatchObject({ status: 404 });
    p.messageThread.findUnique.mockResolvedValue({ ...thread(), entries: [] });
    await expect(toggleReaction(S1, 'th1', 'e1', '👍')).rejects.toMatchObject({ status: 404 });
    p.messageThread.findUnique.mockResolvedValue({ ...thread(), participants: [{ studentId: 's2' }] });
    await expect(toggleReaction(S1, 'th1', 'e1', '👍')).rejects.toMatchObject({ status: 404 });
    expect(p.entryReaction.create).not.toHaveBeenCalled();
  });

  it('lets the teacher react to a private entry', async () => {
    p.messageThread.findUnique.mockResolvedValue(thread('s2', 'GROUP_BCC'));
    p.entryReaction.findUnique.mockResolvedValue(null);
    p.entryReaction.findMany.mockResolvedValue([]);
    await toggleReaction(T, 'th1', 'e1', '👏');
    expect(p.entryReaction.create).toHaveBeenCalledWith({ data: { entryId: 'e1', reactorId: 't1', emoji: '👏', seenByAuthor: false } });
  });

  it('counts a reaction on your own entry as already seen', async () => {
    p.entryReaction.findUnique.mockResolvedValue(null);
    p.messageThread.findUnique.mockResolvedValue(thread(null, 'GROUP_VISIBLE', 's1'));
    await toggleReaction(S1, 'th1', 'e1', '👍');
    p.messageThread.findUnique.mockResolvedValue(thread(null, 'GROUP_VISIBLE', null));
    await toggleReaction(T, 'th1', 'e2', '👍');
    expect(p.entryReaction.create).toHaveBeenNthCalledWith(1, { data: { entryId: 'e1', reactorId: 's1', emoji: '👍' } });
    expect(p.entryReaction.create).toHaveBeenNthCalledWith(2, { data: { entryId: 'e2', reactorId: 't1', emoji: '👍' } });
  });

  it('shows a student in a hidden-copy thread only her own and the teacher reactions afterwards', async () => {
    p.messageThread.findUnique.mockResolvedValue(thread(null, 'GROUP_BCC'));
    p.entryReaction.findUnique.mockResolvedValue(null);
    p.entryReaction.findMany.mockResolvedValue([
      { emoji: '👍', reactor: { id: 's2', name: 'רחל', role: 'STUDENT' } },
      { emoji: '👍', reactor: { id: 's1', name: 'דינה', role: 'STUDENT' } },
    ]);
    expect(await toggleReaction(S1, 'th1', 'e1', '👍')).toEqual([{ emoji: '👍', count: 1, mine: true, names: ['אני'] }]);
  });
});

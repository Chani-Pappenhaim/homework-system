import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    teacherMessage: { create: vi.fn(), findUnique: vi.fn() },
    messageEntry: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    group: { findUnique: vi.fn() },
  },
}));
vi.mock('../../src/infrastructure/queues/queues', () => ({ emailQueue: { add: vi.fn() } }));

import { prisma } from '../../src/config/prisma';
import {
  sendMessage, sendTeacherMessage, sendGroupMessage, replyMessage, studentReplyMessage, MAX_MESSAGE_LENGTH,
  getAllMessages, getMyMessages,
} from '../../src/services/messages.service';

const p = prisma as any;
const tooLong = 'א'.repeat(MAX_MESSAGE_LENGTH + 1);

beforeEach(() => {
  vi.clearAllMocks();
  p.teacherMessage.create.mockResolvedValue({ id: 'm1', student: { name: 'S', email: 's@x.com' } });
  p.teacherMessage.findUnique.mockResolvedValue({ id: 'm1', studentId: 's1', student: { name: 'S', email: 's@x.com' }, entries: [] });
});

describe('messages.service content limits', () => {
  it('rejects an over-long message on every entry point', async () => {
    await expect(sendMessage('s1', tooLong)).rejects.toMatchObject({ status: 400 });
    await expect(sendTeacherMessage('s1', tooLong)).rejects.toMatchObject({ status: 400 });
    await expect(replyMessage('m1', tooLong)).rejects.toMatchObject({ status: 400 });
    await expect(studentReplyMessage('m1', 's1', tooLong)).rejects.toMatchObject({ status: 400 });
    expect(p.teacherMessage.create).not.toHaveBeenCalled();
    expect(p.messageEntry.create).not.toHaveBeenCalled();
  });

  it('rejects an empty or non-text reply', async () => {
    await expect(replyMessage('m1', '   ')).rejects.toMatchObject({ status: 400 });
    await expect(studentReplyMessage('m1', 's1', 42 as any)).rejects.toMatchObject({ status: 400 });
  });

  it('stores a message at the limit, trimmed', async () => {
    await sendMessage('s1', `  ${'א'.repeat(MAX_MESSAGE_LENGTH)}  `);
    const content = p.teacherMessage.create.mock.calls[0][0].data.entries.create.content;
    expect(content).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});

describe('sendGroupMessage', () => {
  it('opens a conversation of her own with every student of the group, each emailed', async () => {
    p.group.findUnique.mockResolvedValue({ students: [{ studentId: 's1' }, { studentId: 's2' }] });
    const r = await sendGroupMessage('g1', '  שיעור מחר מבוטל  ');
    expect(r).toEqual({ sent: 2 });
    const calls = p.teacherMessage.create.mock.calls.map(([a]: any) => [a.data.studentId, a.data.entries.create]);
    expect(calls).toEqual([
      ['s1', { fromTeacher: true, content: 'שיעור מחר מבוטל' }],
      ['s2', { fromTeacher: true, content: 'שיעור מחר מבוטל' }],
    ]);
  });

  it('refuses an empty group, an unknown group and an empty message', async () => {
    p.group.findUnique.mockResolvedValue({ students: [] });
    await expect(sendGroupMessage('g1', 'שלום')).rejects.toMatchObject({ status: 400 });
    p.group.findUnique.mockResolvedValue(null);
    await expect(sendGroupMessage('nope', 'שלום')).rejects.toMatchObject({ status: 404 });
    await expect(sendGroupMessage('g1', '   ')).rejects.toMatchObject({ status: 400 });
    expect(p.teacherMessage.create).not.toHaveBeenCalled();
  });
});

describe('conversation order', () => {
  it('puts the conversation with the newest message first, not the newest conversation', async () => {
    const at = (d: string) => new Date(`2026-10-${d}T10:00:00Z`);
    p.teacherMessage.findMany = vi.fn().mockResolvedValue([
      { id: 'new-quiet', createdAt: at('20'), entries: [{ createdAt: at('20') }] },
      { id: 'old-replied', createdAt: at('10'), entries: [{ createdAt: at('10') }, { createdAt: at('24') }] },
      { id: 'empty', createdAt: at('15'), entries: [] },
    ]);
    expect((await getAllMessages()).map((m: any) => m.id)).toEqual(['old-replied', 'new-quiet', 'empty']);
    expect((await getMyMessages('s1')).map((m: any) => m.id)).toEqual(['old-replied', 'new-quiet', 'empty']);
  });
});

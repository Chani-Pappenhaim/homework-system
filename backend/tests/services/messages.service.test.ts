import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    teacherMessage: { create: vi.fn(), findUnique: vi.fn() },
    messageEntry: { create: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock('../../src/infrastructure/queues/queues', () => ({ emailQueue: { add: vi.fn() } }));

import { prisma } from '../../src/config/prisma';
import {
  sendMessage, sendTeacherMessage, replyMessage, studentReplyMessage, MAX_MESSAGE_LENGTH,
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

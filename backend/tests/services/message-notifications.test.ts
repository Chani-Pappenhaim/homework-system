import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/infrastructure/queues/enqueue-email', () => ({ enqueueEmail: vi.fn() }));

import { enqueueEmail } from '../../src/infrastructure/queues/enqueue-email';
import { notifyNewEntry } from '../../src/services/message-notifications';

const email = enqueueEmail as any;
const participants = ['s1', 's2', 's3'].map((id) => ({ id, name: `n-${id}`, email: `${id}@x.com` }));
const types = () => email.mock.calls.map(([type, d]: any) => [type, d.studentEmail]);

beforeEach(() => vi.clearAllMocks());

describe('notifyNewEntry', () => {
  it('emails every student once about the opening teacher message', async () => {
    await notifyNewEntry({ threadId: 'th', participants, entry: { authorId: null, privateToStudentId: null, content: 'hi' }, opening: null });
    expect(types()).toEqual([['teacher-message', 's1@x.com'], ['teacher-message', 's2@x.com'], ['teacher-message', 's3@x.com']]);
  });

  it('emails a teacher reply to everyone with the opening quoted', async () => {
    await notifyNewEntry({ threadId: 'th', participants, entry: { authorId: null, privateToStudentId: null, content: 'ans' }, opening: 'first' });
    expect(email).toHaveBeenCalledTimes(3);
    expect(email).toHaveBeenCalledWith('teacher-reply', expect.objectContaining({ originalContent: 'first', replyContent: 'ans' }));
  });

  it('emails a private teacher entry to its student only', async () => {
    await notifyNewEntry({ threadId: 'th', participants, entry: { authorId: null, privateToStudentId: 's2', content: 'x' }, opening: 'first' });
    expect(types()).toEqual([['teacher-reply', 's2@x.com']]);
  });

  it('emails a student entry to the teacher alone, never to the other students', async () => {
    const entry = { authorId: 's1', privateToStudentId: null, content: 'q' };
    await notifyNewEntry({ threadId: 'th', participants, entry, opening: null });
    await notifyNewEntry({ threadId: 'th', participants, entry, opening: 'first' });
    expect(email.mock.calls.map(([t]: any) => t)).toEqual(['student-message', 'student-reply']);
    expect(email.mock.calls[0][1]).toMatchObject({ studentName: 'n-s1', studentEmail: 's1@x.com' });
  });

  it('sends nothing for an author who is not a participant', async () => {
    await notifyNewEntry({ threadId: 'th', participants, entry: { authorId: 'ghost', privateToStudentId: null, content: 'q' }, opening: null });
    expect(email).not.toHaveBeenCalled();
  });
});

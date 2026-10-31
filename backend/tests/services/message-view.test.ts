import { describe, it, expect } from 'vitest';
import { aggregateReactions, toEntryDTO, toThreadDetail, toThreadSummary, type EntryRow, type ThreadRow } from '../../src/services/message-view';
import type { Viewer } from '../../src/services/messaging-policy';

const teacher: Viewer = { role: 'TEACHER', userId: 't1' };
const dina: Viewer = { role: 'STUDENT', userId: 's1' };
const at = (h: number) => new Date(`2026-10-01T${String(h).padStart(2, '0')}:00:00Z`);

const thread = (audience: ThreadRow['audience']): ThreadRow => ({
  id: 'th1', audience, subject: 'נושא', groupId: null, group: null, assignmentId: null, createdAt: at(8),
});
const entry = (over: Partial<EntryRow>): EntryRow => ({
  id: 'e1', authorId: null, author: null, privateToStudentId: null, content: 'c', readByTeacher: false, createdAt: at(9), ...over,
});
const reactor = (id: string, name: string, role: 'ADMIN' | 'STUDENT') => ({ id, name, role });

describe('aggregateReactions', () => {
  const rows = [
    { emoji: '❤️', reactor: reactor('s2', 'רחל', 'STUDENT') },
    { emoji: '👍', reactor: reactor('s1', 'דינה', 'STUDENT') },
    { emoji: '👍', reactor: reactor('t1', 'מורה', 'ADMIN') },
    { emoji: '👍', reactor: reactor('s2', 'רחל', 'STUDENT') },
  ];

  it('groups per emoji in the whitelist order, with counts, my flag and names', () => {
    const out = aggregateReactions(dina, 'GROUP_VISIBLE', rows);
    expect(out.map((r) => r.emoji)).toEqual(['👍', '❤️']);
    expect(out[0]).toEqual({ emoji: '👍', count: 3, mine: true, names: ['אני', 'המורה', 'רחל'] });
    expect(out[1]).toMatchObject({ count: 1, mine: false, names: ['רחל'] });
  });

  it('hides other students reactions from a student in a hidden-copy thread', () => {
    const out = aggregateReactions(dina, 'GROUP_BCC', rows);
    expect(out).toEqual([{ emoji: '👍', count: 2, mine: true, names: ['אני', 'המורה'] }]);
  });

  it('shows the teacher every reaction in a hidden-copy thread', () => {
    const out = aggregateReactions(teacher, 'GROUP_BCC', rows);
    expect(out.find((r) => r.emoji === '👍')?.count).toBe(3);
    expect(out.find((r) => r.emoji === '👍')?.mine).toBe(true);
  });
});

describe('toEntryDTO', () => {
  it('names a student author to the teacher but not to a student in a hidden-copy thread', () => {
    const e = entry({ authorId: 's2', author: { id: 's2', name: 'רחל' }, privateToStudentId: 's2' });
    expect(toEntryDTO(teacher, thread('GROUP_BCC'), null, e).authorName).toBe('רחל');
    expect(toEntryDTO(dina, thread('GROUP_VISIBLE'), null, { ...e, privateToStudentId: null }).authorName).toBe('רחל');
    expect(toEntryDTO(dina, thread('GROUP_BCC'), null, { ...e, privateToStudentId: null }).authorName).toBeNull();
  });

  it('tells only the teacher which student an entry is private to', () => {
    const e = entry({ privateToStudentId: 's1' });
    expect(toEntryDTO(teacher, thread('GROUP_BCC'), null, e)).toMatchObject({ isPrivate: true, privateToStudentId: 's1' });
    expect(toEntryDTO(dina, thread('GROUP_BCC'), null, e)).toMatchObject({ isPrivate: true, privateToStudentId: null });
  });

  it('computes read state per reader', () => {
    const fromStudent = entry({ authorId: 's1', author: { id: 's1', name: 'דינה' }, readByTeacher: false });
    expect(toEntryDTO(teacher, thread('DIRECT'), null, fromStudent)).toMatchObject({ mine: false, isRead: false });
    expect(toEntryDTO(teacher, thread('DIRECT'), null, { ...fromStudent, readByTeacher: true }).isRead).toBe(true);
    expect(toEntryDTO(dina, thread('DIRECT'), null, fromStudent)).toMatchObject({ mine: true, isRead: true });

    const fromTeacher = entry({ createdAt: at(10) });
    expect(toEntryDTO(dina, thread('DIRECT'), at(9), fromTeacher).isRead).toBe(false);
    expect(toEntryDTO(dina, thread('DIRECT'), at(10), fromTeacher).isRead).toBe(true);
    expect(toEntryDTO(dina, thread('DIRECT'), null, fromTeacher).isRead).toBe(false);
  });
});

describe('toThreadSummary reply count', () => {
  const summary = (total: number) =>
    toThreadSummary(dina, thread('DIRECT'), [], 1, undefined, { total, unreadCount: 0 });

  it('does not count the opening message as a reply', () => {
    expect(summary(0).replyCount).toBe(0);
    expect(summary(1).replyCount).toBe(0);
    expect(summary(4).replyCount).toBe(3);
  });

  it('carries the subject, the unread flag and the newest entry', () => {
    const s = toThreadSummary(dina, thread('DIRECT'), [{ studentId: 's1', lastReadAt: null }], 1, entry({}), { total: 2, unreadCount: 1 });
    expect(s).toMatchObject({ subject: 'נושא', unread: true, unreadCount: 1, participantCount: 1 });
    expect(s.lastEntry).toMatchObject({ content: 'c' });
  });

  it('names the student of a direct thread to the teacher only', () => {
    const p = [{ studentId: 's1', lastReadAt: null, student: { id: 's1', name: 'דינה', email: 'd@x' } }];
    expect(toThreadSummary(teacher, thread('DIRECT'), p, 1, undefined, { total: 1, unreadCount: 0 }).student).toMatchObject({ name: 'דינה' });
    expect(toThreadSummary(dina, thread('DIRECT'), p, 1, undefined, { total: 1, unreadCount: 0 }).student).toBeUndefined();
  });
});

describe('toThreadDetail participants', () => {
  const people = [
    { studentId: 's1', lastReadAt: null, student: { id: 's1', name: 'דינה', email: 'd@x' } },
    { studentId: 's2', lastReadAt: null, student: { id: 's2', name: 'רחל', email: 'r@x' } },
  ];

  it('gives the teacher names and emails', () => {
    const d = toThreadDetail(teacher, thread('GROUP_BCC'), people, []);
    expect(d.participants).toEqual([{ id: 's1', name: 'דינה', email: 'd@x' }, { id: 's2', name: 'רחל', email: 'r@x' }]);
  });

  it('gives a student names without emails in a visible thread, and nothing in a hidden-copy one', () => {
    expect(toThreadDetail(dina, thread('GROUP_VISIBLE'), people, []).participants).toEqual([
      { id: 's1', name: 'דינה' }, { id: 's2', name: 'רחל' },
    ]);
    expect(toThreadDetail(dina, thread('GROUP_BCC'), people, []).participants).toBeNull();
  });

  it('counts replies and unread from the entries given', () => {
    const d = toThreadDetail(dina, thread('DIRECT'), people, [entry({ id: 'a' }), entry({ id: 'b', createdAt: at(10) })]);
    expect(d).toMatchObject({ replyCount: 1, unread: true });
  });
});

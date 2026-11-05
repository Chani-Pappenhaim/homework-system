import { describe, it, expect } from 'vitest';
import {
  assertCanStartThread, canAccessThread, canSeeEntry, canSeeParticipantEmails, canSeeParticipants, canSeeReaction,
  canStartThread, canUnsendEntry, entryAudience, othersEntriesWhere, resolveEntryPrivacy, studentRemoval,
  visibleEntriesWhere, type Viewer,
} from '../../src/services/messaging-policy';
import { REACTION_EMOJIS, isAllowedReaction } from '../../src/utils/message-reactions';

const teacher: Viewer = { role: 'TEACHER', userId: 't1' };
const dina: Viewer = { role: 'STUDENT', userId: 's1' };
const participantIds = ['s1', 's2', 's3'];

describe('starting threads', () => {
  it('lets the teacher start any kind and a student only a direct one', () => {
    for (const a of ['DIRECT', 'GROUP_VISIBLE', 'GROUP_BCC'] as const) expect(canStartThread(teacher, a)).toBe(true);
    expect(canStartThread(dina, 'DIRECT')).toBe(true);
    expect(canStartThread(dina, 'GROUP_VISIBLE')).toBe(false);
    expect(canStartThread(dina, 'GROUP_BCC')).toBe(false);
  });

  it('throws 403 when a student tries to open a group thread', () => {
    expect(() => assertCanStartThread(dina, 'GROUP_VISIBLE')).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() => assertCanStartThread(dina, 'DIRECT')).not.toThrow();
  });
});

describe('thread and entry visibility', () => {
  it('lets the teacher into every thread and a student only into hers', () => {
    expect(canAccessThread(teacher, { participantIds })).toBe(true);
    expect(canAccessThread(dina, { participantIds })).toBe(true);
    expect(canAccessThread(dina, { participantIds: ['s2'] })).toBe(false);
  });

  it('hides an entry private to another student, but not from the teacher', () => {
    expect(canSeeEntry(dina, { privateToStudentId: null })).toBe(true);
    expect(canSeeEntry(dina, { privateToStudentId: 's1' })).toBe(true);
    expect(canSeeEntry(dina, { privateToStudentId: 's2' })).toBe(false);
    expect(canSeeEntry(teacher, { privateToStudentId: 's2' })).toBe(true);
  });

  it('expresses the same rule as database filters', () => {
    expect(visibleEntriesWhere(teacher)).toEqual({});
    expect(visibleEntriesWhere(dina)).toEqual({
      AND: [{ OR: [{ privateToStudentId: null }, { privateToStudentId: 's1' }] }, { createdAt: { lte: expect.any(Date) } }],
    });
    expect(othersEntriesWhere(teacher)).toEqual({ authorId: { not: null } });
    expect(othersEntriesWhere(dina)).toEqual({ OR: [{ authorId: null }, { authorId: { not: 's1' } }] });
  });

  it('shows the other participants to the teacher and in a visible thread only, emails to the teacher alone', () => {
    expect(canSeeParticipants(teacher, 'GROUP_BCC')).toBe(true);
    expect(canSeeParticipants(dina, 'GROUP_VISIBLE')).toBe(true);
    expect(canSeeParticipants(dina, 'GROUP_BCC')).toBe(false);
    expect(canSeeParticipantEmails(teacher)).toBe(true);
    expect(canSeeParticipantEmails(dina)).toBe(false);
  });
});

describe('reaction visibility', () => {
  it('shows a student only her own and the teacher reactions in a hidden-copy thread', () => {
    const other = { id: 's2', isTeacher: false };
    expect(canSeeReaction(dina, 'GROUP_BCC', other)).toBe(false);
    expect(canSeeReaction(dina, 'GROUP_BCC', { id: 's1', isTeacher: false })).toBe(true);
    expect(canSeeReaction(dina, 'GROUP_BCC', { id: 't1', isTeacher: true })).toBe(true);
    expect(canSeeReaction(teacher, 'GROUP_BCC', other)).toBe(true);
  });

  it('shows everyone to everyone in visible and direct threads', () => {
    const other = { id: 's2', isTeacher: false };
    expect(canSeeReaction(dina, 'GROUP_VISIBLE', other)).toBe(true);
    expect(canSeeReaction(dina, 'DIRECT', other)).toBe(true);
  });

  it('accepts only the whitelisted emoji', () => {
    for (const e of REACTION_EMOJIS) expect(isAllowedReaction(e)).toBe(true);
    expect(isAllowedReaction('💩')).toBe(false);
    expect(isAllowedReaction('')).toBe(false);
    expect(isAllowedReaction(undefined)).toBe(false);
    expect(isAllowedReaction(5)).toBe(false);
  });
});

describe('reply privacy', () => {
  const thread = (audience: 'DIRECT' | 'GROUP_VISIBLE' | 'GROUP_BCC') => ({ audience, participantIds });

  it('keeps everything shared in a direct thread', () => {
    expect(resolveEntryPrivacy(dina, thread('DIRECT'), { to: 'ALL' })).toBeNull();
    expect(resolveEntryPrivacy(dina, thread('DIRECT'), { to: 'TEACHER' })).toBeNull();
    expect(resolveEntryPrivacy(teacher, thread('DIRECT'), { to: 'ALL' })).toBeNull();
  });

  it('makes a student reply in a hidden-copy thread private to her, whatever she asked', () => {
    expect(resolveEntryPrivacy(dina, thread('GROUP_BCC'), { to: 'ALL' })).toBe('s1');
    expect(resolveEntryPrivacy(dina, thread('GROUP_BCC'), { to: 'TEACHER' })).toBe('s1');
  });

  it('lets a student choose everyone or the teacher in a visible thread', () => {
    expect(resolveEntryPrivacy(dina, thread('GROUP_VISIBLE'), { to: 'ALL' })).toBeNull();
    expect(resolveEntryPrivacy(dina, thread('GROUP_VISIBLE'), { to: 'TEACHER' })).toBe('s1');
  });

  it('never lets a student write privately to another student', () => {
    expect(() => resolveEntryPrivacy(dina, thread('GROUP_VISIBLE'), { to: 'STUDENT', studentId: 's2' }))
      .toThrowError(expect.objectContaining({ status: 403 }));
  });

  it('lets the teacher write to everyone or to one participant of the thread', () => {
    expect(resolveEntryPrivacy(teacher, thread('GROUP_BCC'), { to: 'ALL' })).toBeNull();
    expect(resolveEntryPrivacy(teacher, thread('GROUP_BCC'), { to: 'STUDENT', studentId: 's2' })).toBe('s2');
    expect(() => resolveEntryPrivacy(teacher, thread('GROUP_BCC'), { to: 'STUDENT', studentId: 'outsider' }))
      .toThrowError(expect.objectContaining({ status: 400 }));
    expect(() => resolveEntryPrivacy(teacher, thread('GROUP_BCC'), { to: 'TEACHER' }))
      .toThrowError(expect.objectContaining({ status: 400 }));
  });
});

describe('entry audience', () => {
  it('is every participant for a public entry, and the writer is left out', () => {
    expect(entryAudience({ participantIds }, { authorId: null, privateToStudentId: null })).toEqual(participantIds);
    expect(entryAudience({ participantIds }, { authorId: 's1', privateToStudentId: null })).toEqual(['s2', 's3']);
  });

  it('is the one student for a private entry', () => {
    expect(entryAudience({ participantIds }, { authorId: null, privateToStudentId: 's2' })).toEqual(['s2']);
    expect(entryAudience({ participantIds }, { authorId: 's1', privateToStudentId: 's1' })).toEqual([]);
  });
});

describe('student removal', () => {
  it('deletes a direct thread and only hides a group one', () => {
    expect(studentRemoval('DIRECT')).toBe('DELETE_THREAD');
    expect(studentRemoval('GROUP_VISIBLE')).toBe('HIDE_FOR_HER');
    expect(studentRemoval('GROUP_BCC')).toBe('HIDE_FOR_HER');
  });
});

describe('unsending', () => {
  const at = (n: number) => new Date(2026, 9, n);
  const mine = { authorId: null, privateToStudentId: null, createdAt: at(1) };

  it('is refused for a student entry', () => {
    expect(canUnsendEntry({ ...mine, authorId: 's1' }, [])).toBe(false);
  });

  it('is allowed while nothing newer exists, and refused after a visible reply', () => {
    expect(canUnsendEntry(mine, [mine])).toBe(true);
    expect(canUnsendEntry(mine, [mine, { privateToStudentId: null, createdAt: at(2) }])).toBe(false);
  });

  it('ignores newer entries private to a student a private teacher entry was not for', () => {
    const toS2 = { ...mine, privateToStudentId: 's2' };
    expect(canUnsendEntry(toS2, [toS2, { privateToStudentId: 's1', createdAt: at(2) }])).toBe(true);
    expect(canUnsendEntry(toS2, [toS2, { privateToStudentId: 's2', createdAt: at(2) }])).toBe(false);
  });
});

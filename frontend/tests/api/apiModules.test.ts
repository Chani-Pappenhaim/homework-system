import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the shared axios instance used by every api module.
vi.mock('@/api/axios', () => {
  const api = {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  };
  return { default: api };
});

import api from '@/api/axios';
import { authApi } from '@/api/auth.api';
import { groupsApi } from '@/api/groups.api';
import { coursesApi } from '@/api/courses.api';
import { lessonsApi } from '@/api/lessons.api';
import { assignmentsApi } from '@/api/assignments.api';
import { submissionsApi } from '@/api/submissions.api';
import { gradesApi } from '@/api/grades.api';
import { quizzesApi } from '@/api/quizzes.api';
import { messagesApi } from '@/api/messages.api';
import { aiUsageApi } from '@/api/aiUsage.api';

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const post = api.post as unknown as ReturnType<typeof vi.fn>;
const put = api.put as unknown as ReturnType<typeof vi.fn>;
const patch = api.patch as unknown as ReturnType<typeof vi.fn>;
const del = api.delete as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('authApi', () => {
  it('login posts credentials', () => {
    authApi.login('a@b.com', 'pw');
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'pw' });
  });
  it('logout posts', () => {
    authApi.logout();
    expect(post).toHaveBeenCalledWith('/auth/logout');
  });
  it('refresh posts', () => {
    authApi.refresh();
    expect(post).toHaveBeenCalledWith('/auth/refresh');
  });
  it('me gets', () => {
    authApi.me();
    expect(get).toHaveBeenCalledWith('/auth/me');
  });
  it('changePassword posts (the backend route is POST — PATCH used to 404)', () => {
    authApi.changePassword('old', 'new');
    expect(post).toHaveBeenCalledWith('/auth/change-password', { currentPassword: 'old', newPassword: 'new' });
  });
  it('returns the axios promise (data available to caller)', async () => {
    post.mockResolvedValueOnce({ data: { data: { accessToken: 't' } } });
    const res = await authApi.refresh();
    expect(res.data.data.accessToken).toBe('t');
  });
});

describe('groupsApi', () => {
  it('list gets /groups', () => { groupsApi.list(); expect(get).toHaveBeenCalledWith('/groups'); });
  it('get gets /groups/:id', () => { groupsApi.get('g1'); expect(get).toHaveBeenCalledWith('/groups/g1'); });
  it('create posts /groups', () => {
    groupsApi.create({ name: 'A', year: '2026' });
    expect(post).toHaveBeenCalledWith('/groups', { name: 'A', year: '2026' });
  });
  it('update puts /groups/:id', () => {
    groupsApi.update('g1', { name: 'B' });
    expect(put).toHaveBeenCalledWith('/groups/g1', { name: 'B' });
  });
  it('addStudent posts to nested students', () => {
    groupsApi.addStudent('g1', { name: 'N', email: 'e@x.com' });
    expect(post).toHaveBeenCalledWith('/groups/g1/students', { name: 'N', email: 'e@x.com' });
  });
  it('removeStudent deletes', () => {
    groupsApi.removeStudent('g1', 's1');
    expect(del).toHaveBeenCalledWith('/groups/g1/students/s1');
  });
  it('importStudents posts FormData', () => {
    groupsApi.importStudents('g1', new File(['x'], 'a.xlsx'));
    expect(post).toHaveBeenCalledWith('/groups/g1/import', expect.any(FormData));
  });
  it('resetPassword posts', () => {
    groupsApi.resetPassword('g1', 's1');
    expect(post).toHaveBeenCalledWith('/groups/g1/reset-password/s1');
  });
});

describe('coursesApi', () => {
  it('list gets /courses', () => { coursesApi.list(); expect(get).toHaveBeenCalledWith('/courses'); });
  it('get gets /courses/:id', () => { coursesApi.get('c1'); expect(get).toHaveBeenCalledWith('/courses/c1'); });
  it('create posts /courses', () => {
    coursesApi.create({ name: 'C', groupId: 'g1' });
    expect(post).toHaveBeenCalledWith('/courses', { name: 'C', groupId: 'g1' });
  });
  it('update puts /courses/:id', () => {
    coursesApi.update('c1', { hidden: true });
    expect(put).toHaveBeenCalledWith('/courses/c1', { hidden: true });
  });
  it('copy posts targetGroupId', () => {
    coursesApi.copy('c1', 'g2');
    expect(post).toHaveBeenCalledWith('/courses/c1/copy', { targetGroupId: 'g2' });
  });
  it('grantAccess / revokeAccess', () => {
    coursesApi.grantAccess('c1', 's1');
    expect(post).toHaveBeenCalledWith('/courses/c1/access', { studentId: 's1' });
    coursesApi.revokeAccess('c1', 's1');
    expect(del).toHaveBeenCalledWith('/courses/c1/access/s1');
  });
  it('addLink / deleteLink', () => {
    coursesApi.addLink('c1', { label: 'L', url: 'u' });
    expect(post).toHaveBeenCalledWith('/courses/c1/links', { label: 'L', url: 'u' });
    coursesApi.deleteLink('c1', 'l1');
    expect(del).toHaveBeenCalledWith('/courses/c1/links/l1');
  });
  it('uploadFile posts FormData / deleteFile deletes', () => {
    coursesApi.uploadFile('c1', new File(['x'], 'f.pdf'));
    expect(post).toHaveBeenCalledWith('/courses/c1/files', expect.any(FormData));
    coursesApi.deleteFile('c1', 'f1');
    expect(del).toHaveBeenCalledWith('/courses/c1/files/f1');
  });
});

describe('lessonsApi', () => {
  it('list / get', () => {
    lessonsApi.list('c1'); expect(get).toHaveBeenCalledWith('/courses/c1/lessons');
    lessonsApi.get('l1'); expect(get).toHaveBeenCalledWith('/lessons/l1');
  });
  it('create / update', () => {
    lessonsApi.create('c1', { topic: 'T' });
    expect(post).toHaveBeenCalledWith('/courses/c1/lessons', { topic: 'T' });
    lessonsApi.update('l1', { hidden: true });
    expect(put).toHaveBeenCalledWith('/lessons/l1', { hidden: true });
  });
  it('reorder patches', () => {
    lessonsApi.reorder([{ id: 'l1', order: 0 }]);
    expect(patch).toHaveBeenCalledWith('/lessons/reorder', { lessons: [{ id: 'l1', order: 0 }] });
  });
  it('uploadFile / deleteFile / importMd', () => {
    lessonsApi.uploadFile('l1', new File(['x'], 'a'));
    expect(post).toHaveBeenCalledWith('/lessons/l1/files', expect.any(FormData));
    lessonsApi.deleteFile('l1', 'f1');
    expect(del).toHaveBeenCalledWith('/lessons/l1/files/f1');
    lessonsApi.importMd('l1', new File(['x'], 'a.md'));
    expect(post).toHaveBeenCalledWith('/lessons/l1/import-md', expect.any(FormData));
  });
  it('access endpoints', () => {
    lessonsApi.getAccess('l1'); expect(get).toHaveBeenCalledWith('/lessons/l1/access');
    lessonsApi.grantAccess('l1', 's1'); expect(post).toHaveBeenCalledWith('/lessons/l1/access', { studentId: 's1' });
    lessonsApi.revokeAccess('l1', 's1'); expect(del).toHaveBeenCalledWith('/lessons/l1/access/s1');
  });
});

describe('assignmentsApi', () => {
  it('list / create / update / delete / getSubmissions', () => {
    assignmentsApi.list('l1'); expect(get).toHaveBeenCalledWith('/lessons/l1/assignments');
    assignmentsApi.create('l1', { title: 'T' });
    expect(post).toHaveBeenCalledWith('/lessons/l1/assignments', { title: 'T' });
    assignmentsApi.update('a1', { title: 'U' });
    expect(put).toHaveBeenCalledWith('/assignments/a1', { title: 'U' });
    assignmentsApi.delete('a1'); expect(del).toHaveBeenCalledWith('/assignments/a1');
    assignmentsApi.getSubmissions('a1'); expect(get).toHaveBeenCalledWith('/assignments/a1/submissions');
  });
  it('importFromExcel posts FormData', () => {
    assignmentsApi.importFromExcel(new File(['x'], 'a.xlsx'));
    expect(post).toHaveBeenCalledWith('/assignments/import', expect.any(FormData));
  });
});

describe('submissionsApi', () => {
  it('submitFile posts FormData', () => {
    submissionsApi.submitFile('a1', new File(['x'], 'f'), 'note');
    expect(post).toHaveBeenCalledWith('/assignments/a1/submit', expect.any(FormData));
  });
  it('submitRepo posts repoName + notes', () => {
    submissionsApi.submitRepo('a1', 'repo', 'note');
    expect(post).toHaveBeenCalledWith('/assignments/a1/submit', { repoName: 'repo', notes: 'note' });
  });
  it('mine / get', () => {
    submissionsApi.mine(); expect(get).toHaveBeenCalledWith('/submissions/mine');
    submissionsApi.get('s1'); expect(get).toHaveBeenCalledWith('/submissions/s1');
  });
  it('ai endpoints', () => {
    submissionsApi.requestAiReview('s1'); expect(post).toHaveBeenCalledWith('/submissions/s1/request-ai-review');
    submissionsApi.approveAi('s1'); expect(post).toHaveBeenCalledWith('/submissions/s1/approve-ai');
    submissionsApi.allowExtraAi('s1'); expect(post).toHaveBeenCalledWith('/submissions/s1/allow-extra-ai');
    submissionsApi.restoreAiScore('s1'); expect(post).toHaveBeenCalledWith('/submissions/s1/restore-ai-score');
  });
  it('importSubmissions posts FormData', () => {
    submissionsApi.importSubmissions(new File(['x'], 'a.xlsx'));
    expect(post).toHaveBeenCalledWith('/submissions/import', expect.any(FormData));
  });
});

describe('gradesApi', () => {
  it('grade posts', () => {
    gradesApi.grade('s1', { score: 90 });
    expect(post).toHaveBeenCalledWith('/submissions/s1/grade', { score: 90 });
  });
  it('report gets with params', () => {
    gradesApi.report({ groupId: 'g1' });
    expect(get).toHaveBeenCalledWith('/grades/report', { params: { groupId: 'g1' } });
  });
  it('pending gets', () => {
    gradesApi.pending(); expect(get).toHaveBeenCalledWith('/grades/pending');
  });
  it('exportReport fetches a blob through axios so the auth header is sent', () => {
    // A plain <a download> navigation omits the Authorization header and the
    // route has no cookie fallback, so the export always came back 401.
    gradesApi.exportReport({ groupId: 'g1', courseId: 'c1' });
    expect(get).toHaveBeenCalledWith('/grades/report/export', {
      params: { groupId: 'g1', courseId: 'c1' },
      responseType: 'blob',
    });
  });
});

describe('quizzesApi', () => {
  it('get / attempt / results', () => {
    quizzesApi.get('l1'); expect(get).toHaveBeenCalledWith('/lessons/l1/quiz');
    quizzesApi.attempt('l1', [0, 1]);
    expect(post).toHaveBeenCalledWith('/lessons/l1/quiz/attempt', { answers: [0, 1] });
    quizzesApi.results('l1'); expect(get).toHaveBeenCalledWith('/lessons/l1/quiz/results');
  });
});

describe('messagesApi', () => {
  it('covers all endpoints', () => {
    messagesApi.send('hi'); expect(post).toHaveBeenCalledWith('/messages', { content: 'hi' });
    messagesApi.getAll(); expect(get).toHaveBeenCalledWith('/messages');
    messagesApi.getMine(); expect(get).toHaveBeenCalledWith('/messages/mine');
    messagesApi.getUnreadCount(); expect(get).toHaveBeenCalledWith('/messages/unread-count');
    messagesApi.markRead('m1'); expect(patch).toHaveBeenCalledWith('/messages/m1/read');
    messagesApi.reply('m1', 'r'); expect(post).toHaveBeenCalledWith('/messages/m1/reply', { reply: 'r' });
  });
});

describe('aiUsageApi', () => {
  it('summary gets', () => {
    aiUsageApi.summary(); expect(get).toHaveBeenCalledWith('/ai-usage/summary');
  });
});

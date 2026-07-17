import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeacherLessonDetailPage from '@/pages/teacher/LessonDetailPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/lessons.api', () => ({
  lessonsApi: { get: vi.fn(), getAccess: vi.fn(), grantAccess: vi.fn(), revokeAccess: vi.fn() },
}));
vi.mock('@/api/assignments.api', () => ({
  assignmentsApi: { getSubmissions: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/api/submissions.api', () => ({
  submissionsApi: { approveAi: vi.fn(), restoreAiScore: vi.fn() },
}));
vi.mock('@/api/grades.api', () => ({ gradesApi: { grade: vi.fn() } }));
vi.mock('@/api/groups.api', () => ({ groupsApi: { list: vi.fn(), get: vi.fn() } }));

import { lessonsApi } from '@/api/lessons.api';
import { assignmentsApi } from '@/api/assignments.api';
import { submissionsApi } from '@/api/submissions.api';

const getLesson = lessonsApi.get as unknown as ReturnType<typeof vi.fn>;
const getAccess = lessonsApi.getAccess as unknown as ReturnType<typeof vi.fn>;
const getSubmissions = assignmentsApi.getSubmissions as unknown as ReturnType<typeof vi.fn>;
const approveAi = submissionsApi.approveAi as unknown as ReturnType<typeof vi.fn>;

import { groupsApi } from '@/api/groups.api';
const groupsList = groupsApi.list as unknown as ReturnType<typeof vi.fn>;

const lesson = {
  id: 'l1',
  topic: 'שיעור בדיקה',
  lessonDate: '2026-07-01T00:00:00Z',
  contentMd: '',
  githubUrl: '',
  hidden: false,
  order: 0,
  files: [],
  assignments: [
    {
      id: 'a1',
      title: 'מטלה ראשית',
      description: 'תיאור',
      deadline: '2026-08-01T00:00:00Z',
      allowedTypes: [],
      allowGithub: true,
      allowFile: false,
      requirements: [{ id: 'r1', text: 'דרישה 1' }],
    },
  ],
};

function renderPage() {
  return renderWithProviders(<TeacherLessonDetailPage />, {
    path: '/teacher/lesson/:id',
    initialEntries: ['/teacher/lesson/l1'],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getLesson.mockResolvedValue({ data: { data: { lesson } } });
  getAccess.mockResolvedValue({ data: { data: { students: [] } } });
  groupsList.mockResolvedValue({ data: { data: { groups: [] } } });
});

describe('TeacherLessonDetailPage', () => {
  it('renders the lesson and its submissions', async () => {
    getSubmissions.mockResolvedValue({
      data: { data: { submissions: [
        { id: 's1', studentName: 'רותי', studentEmail: 'ruti@x.com', submittedAt: '2026-07-10T10:00:00Z', isLate: false, githubUrl: 'https://github.com/a/b', grade: null },
      ] } },
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'שיעור בדיקה' })).toBeInTheDocument();
    expect(await screen.findByText('רותי')).toBeInTheDocument();
  });

  it('opens the grade modal with the suggested score prefilled for an ungraded submission', async () => {
    // not late, 1 unchecked requirement => 100 - 0 - 5 = 95
    getSubmissions.mockResolvedValue({
      data: { data: { submissions: [
        { id: 's1', studentName: 'רותי', studentEmail: 'ruti@x.com', submittedAt: '2026-07-10T10:00:00Z', isLate: false, githubUrl: 'https://github.com/a/b', grade: null },
      ] } },
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'בדוק עכשיו' }));

    const dialogHeading = await screen.findByText(/ציון — רותי/);
    expect(dialogHeading).toBeInTheDocument();
    const scoreInput = screen.getByPlaceholderText('85') as HTMLInputElement;
    expect(scoreInput.value).toBe('95');
  });

  it('prefills the existing teacher score when the submission is already graded', async () => {
    getSubmissions.mockResolvedValue({
      data: { data: { submissions: [
        { id: 's2', studentName: 'נועה', studentEmail: 'noa@x.com', submittedAt: '2026-07-10T10:00:00Z', isLate: true, githubUrl: 'https://github.com/a/b', grade: { score: 77, feedback: '', gradedAt: '' } },
      ] } },
    });
    renderPage();
    // Exact name: /ערוך/ also matches the "ערוך שיעור" button and would open
    // the lesson editor instead of the grade modal.
    await userEvent.click(await screen.findByRole('button', { name: 'ערוך' }));
    const scoreInput = await screen.findByPlaceholderText('85') as HTMLInputElement;
    expect(scoreInput.value).toBe('77');
  });

  it('shows approve-AI and restore-AI controls when the submission has a completed AI review', async () => {
    getSubmissions.mockResolvedValue({
      data: { data: { submissions: [
        { id: 's3', studentName: 'תמר', studentEmail: 't@x.com', submittedAt: '2026-07-10T10:00:00Z', isLate: false, githubUrl: 'https://github.com/a/b', grade: null, aiStatus: 'done', aiScore: 88, aiApproved: false, aiVerbalReview: 'עבודה טובה' },
      ] } },
    });
    approveAi.mockResolvedValue({ data: {} });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'בדוק עכשיו' }));

    expect(await screen.findByText(/בדיקת AI — ציון: 88/)).toBeInTheDocument();
    const approveBtn = screen.getByRole('button', { name: /אשרי ציון AI לתלמידה/ });
    expect(approveBtn).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /החזירי לציון AI/ })).toBeInTheDocument();

    await userEvent.click(approveBtn);
    await waitFor(() => expect(approveAi).toHaveBeenCalled());
  });

  it('opens the new-assignment modal from the "new assignment" button', async () => {
    getSubmissions.mockResolvedValue({ data: { data: { submissions: [] } } });
    renderPage();
    await screen.findByRole('heading', { name: 'שיעור בדיקה' });
    await userEvent.click(screen.getByRole('button', { name: /מטלה חדשה/ }));
    expect(await screen.findByText('כותרת המטלה')).toBeInTheDocument();
  });
});

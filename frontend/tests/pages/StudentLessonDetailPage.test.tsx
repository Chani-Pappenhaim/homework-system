import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentLessonDetailPage from '@/pages/student/LessonDetailPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/lessons.api', () => ({ lessonsApi: { get: vi.fn() } }));
vi.mock('@/api/submissions.api', () => ({
  submissionsApi: { mine: vi.fn(), submitRepo: vi.fn(), submitFile: vi.fn(), requestAiReview: vi.fn() },
}));
vi.mock('@/api/messages.api', () => ({ messagesApi: { send: vi.fn() } }));

import { lessonsApi } from '@/api/lessons.api';
import { submissionsApi } from '@/api/submissions.api';
import { messagesApi } from '@/api/messages.api';

const getLesson = lessonsApi.get as unknown as ReturnType<typeof vi.fn>;
const mine = submissionsApi.mine as unknown as ReturnType<typeof vi.fn>;
const submitRepo = submissionsApi.submitRepo as unknown as ReturnType<typeof vi.fn>;
const requestAiReview = submissionsApi.requestAiReview as unknown as ReturnType<typeof vi.fn>;
const sendMessage = messagesApi.send as unknown as ReturnType<typeof vi.fn>;

const FUTURE = '2999-01-01T00:00:00Z';
const PAST = '2000-01-01T00:00:00Z';

function lessonWith(assignments: any[]) {
  return {
    data: {
      data: {
        lesson: {
          id: 'l1',
          topic: 'שיעור מבוא',
          contentMd: '## תוכן',
          githubUrl: '',
          files: [],
          assignments,
        },
      },
    },
  };
}

function renderPage() {
  return renderWithProviders(<StudentLessonDetailPage />, {
    path: '/student/lesson/:id',
    initialEntries: ['/student/lesson/l1'],
  });
}

beforeEach(() => vi.clearAllMocks());

describe('StudentLessonDetailPage', () => {
  it('renders the lesson topic', async () => {
    getLesson.mockResolvedValue(lessonWith([]));
    mine.mockResolvedValue({ data: { data: { submitted: [] } } });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'שיעור מבוא' })).toBeInTheDocument();
  });

  it('renders a submit form (github) for an open assignment and submits a repo', async () => {
    getLesson.mockResolvedValue(
      lessonWith([
        { id: 'a1', title: 'מטלה 1', deadline: FUTURE, allowFile: false, allowGithub: true, allowedTypes: [] },
      ])
    );
    mine.mockResolvedValue({ data: { data: { submitted: [] } } });
    submitRepo.mockResolvedValue({ data: {} });
    renderPage();

    const input = await screen.findByPlaceholderText('שם הפרויקט ב-GitHub');
    await userEvent.type(input, 'my-repo');
    await userEvent.click(screen.getByRole('button', { name: 'הגש' }));
    await waitFor(() => expect(submitRepo).toHaveBeenCalledWith('a1', 'my-repo', undefined));
  });

  it('shows a "request AI review" button for a submitted github assignment with aiStatus none', async () => {
    getLesson.mockResolvedValue(
      lessonWith([{ id: 'a2', title: 'מטלה AI', deadline: FUTURE, allowFile: false, allowGithub: true, allowedTypes: [] }])
    );
    mine.mockResolvedValue({
      data: {
        data: {
          submitted: [
            {
              id: 'sub1',
              // Matched by assignmentId — matching on the title broke as soon as
              // two assignments shared one.
              assignmentId: 'a2',
              assignmentTitle: 'מטלה AI',
              submittedAt: '2026-07-01T10:00:00Z',
              isLate: false,
              githubUrl: 'https://github.com/x/y',
              aiStatus: 'none',
              grade: null,
            },
          ],
        },
      },
    });
    requestAiReview.mockResolvedValue({ data: {} });
    renderPage();

    const btn = await screen.findByRole('button', { name: 'בקשי בדיקה' });
    await userEvent.click(btn);
    await waitFor(() => expect(requestAiReview).toHaveBeenCalledWith('sub1'));
  });

  it('shows a late-submission request button when the deadline has passed and nothing is submitted', async () => {
    getLesson.mockResolvedValue(
      lessonWith([{ id: 'a3', title: 'מטלה מאוחרת', deadline: PAST, allowFile: false, allowGithub: true, allowedTypes: [] }])
    );
    mine.mockResolvedValue({ data: { data: { submitted: [] } } });
    sendMessage.mockResolvedValue({ data: {} });
    renderPage();

    // "פג תוקף" badge indicates overdue
    expect(await screen.findByText('פג תוקף')).toBeInTheDocument();
    const lateBtn = screen.getByRole('button', { name: 'בקשי אישור הגשה מאוחרת' });
    await userEvent.click(lateBtn);
    await userEvent.click(screen.getByRole('button', { name: 'שלחי בקשה' }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage.mock.calls[0][0]).toContain('מטלה מאוחרת');
  });
});

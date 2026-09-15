import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentLessonDetailPage from '@/pages/student/LessonDetailPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/lessons.api', () => ({ lessonsApi: { get: vi.fn(), setProgress: vi.fn(), markFileViewed: vi.fn() } }));
vi.mock('@/api/submissions.api', () => ({
  submissionsApi: { mine: vi.fn(), submitRepo: vi.fn(), submitFile: vi.fn(), requestAiReview: vi.fn() },
}));
vi.mock('@/api/messages.api', () => ({ messagesApi: { send: vi.fn() } }));

import { lessonsApi } from '@/api/lessons.api';
import { submissionsApi } from '@/api/submissions.api';
import { messagesApi } from '@/api/messages.api';

const getLesson = lessonsApi.get as unknown as ReturnType<typeof vi.fn>;
const setProgress = lessonsApi.setProgress as unknown as ReturnType<typeof vi.fn>;
const markFileViewed = lessonsApi.markFileViewed as unknown as ReturnType<typeof vi.fn>;
const mine = submissionsApi.mine as unknown as ReturnType<typeof vi.fn>;
const submitRepo = submissionsApi.submitRepo as unknown as ReturnType<typeof vi.fn>;
const requestAiReview = submissionsApi.requestAiReview as unknown as ReturnType<typeof vi.fn>;
const sendMessage = messagesApi.send as unknown as ReturnType<typeof vi.fn>;

const FUTURE = '2999-01-01T00:00:00Z';
const PAST = '2000-01-01T00:00:00Z';

function lessonWith(assignments: any[], overrides: Record<string, any> = {}) {
  return {
    data: {
      data: {
        lesson: {
          id: 'l1',
          topic: 'שיעור מבוא',
          contentMd: '## תוכן',
          githubUrls: [],
          files: [],
          assignments,
          ...overrides,
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

async function openAssignmentsTab(lessonTopic: string) {
  await screen.findByRole('heading', { name: lessonTopic });
  await userEvent.click(screen.getByRole('button', { name: 'מטלות' }));
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
    await openAssignmentsTab('שיעור מבוא');

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
    await openAssignmentsTab('שיעור מבוא');

    const btn = await screen.findByRole('button', { name: 'בקשי בדיקה' });
    await userEvent.click(btn);
    await waitFor(() => expect(requestAiReview).toHaveBeenCalledWith('sub1'));
  });

  it('shows the submission score but hides the content score when it is null', async () => {
    getLesson.mockResolvedValue(
      lessonWith([{ id: 'a4', title: 'מטלה עם ציון', deadline: FUTURE, allowFile: false, allowGithub: true, allowedTypes: [] }])
    );
    mine.mockResolvedValue({
      data: { data: { submitted: [
        {
          id: 'sub2', assignmentId: 'a4', assignmentTitle: 'מטלה עם ציון',
          submittedAt: '2026-07-01T10:00:00Z', isLate: false, githubUrl: 'https://github.com/x/y',
          grade: { submissionScore: 91, contentScore: null, feedback: '', checklist: [] },
        },
      ] } },
    });
    renderPage();
    await openAssignmentsTab('שיעור מבוא');
    expect(await screen.findByText(/ציון הגשה: 91/)).toBeInTheDocument();
    expect(screen.queryByText(/ציון תוכן/)).not.toBeInTheDocument();
  });

  it('shows a late-submission request button when the deadline has passed and nothing is submitted', async () => {
    getLesson.mockResolvedValue(
      lessonWith([{ id: 'a3', title: 'מטלה מאוחרת', deadline: PAST, allowFile: false, allowGithub: true, allowedTypes: [] }])
    );
    mine.mockResolvedValue({ data: { data: { submitted: [] } } });
    sendMessage.mockResolvedValue({ data: {} });
    renderPage();
    await openAssignmentsTab('שיעור מבוא');

    // "פג תוקף" badge indicates overdue
    expect(await screen.findByText('פג תוקף')).toBeInTheDocument();
    const lateBtn = screen.getByRole('button', { name: 'בקשי אישור הגשה מאוחרת' });
    await userEvent.click(lateBtn);
    await userEvent.click(screen.getByRole('button', { name: 'שלחי בקשה' }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage.mock.calls[0][0]).toContain('מטלה מאוחרת');
  });

  it('disables lesson completion while a required file is unviewed, and shows how many remain', async () => {
    getLesson.mockResolvedValue(
      lessonWith([], {
        completed: false,
        files: [{ id: 'f1', name: 'סרטון חובה', url: '/f1', required: true, viewed: false }],
      })
    );
    mine.mockResolvedValue({ data: { data: { submitted: [] } } });
    renderPage();

    await screen.findByRole('heading', { name: 'שיעור מבוא' });
    const finishBtn = screen.getByRole('button', { name: 'סיימתי את השיעור' });
    expect(finishBtn).toBeDisabled();
    expect(await screen.findByText('נותרו 1 קבצי חובה לצפייה')).toBeInTheDocument();
  });

  it('marks a required file as viewed and re-enables completion once none remain', async () => {
    getLesson.mockResolvedValueOnce(
      lessonWith([], {
        completed: false,
        files: [{ id: 'f1', name: 'סרטון חובה', url: '/f1', required: true, viewed: false }],
      })
    );
    getLesson.mockResolvedValue(
      lessonWith([], {
        completed: false,
        files: [{ id: 'f1', name: 'סרטון חובה', url: '/f1', required: true, viewed: true }],
      })
    );
    mine.mockResolvedValue({ data: { data: { submitted: [] } } });
    markFileViewed.mockResolvedValue({ data: {} });
    renderPage();

    await screen.findByRole('heading', { name: 'שיעור מבוא' });
    await userEvent.click(screen.getByRole('button', { name: /^חומרי עזר/ }));
    await userEvent.click(screen.getByRole('button', { name: 'סימני שראית/קראת' }));
    await waitFor(() => expect(markFileViewed).toHaveBeenCalledWith('l1', 'f1'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'סיימתי את השיעור' })).not.toBeDisabled());
  });

  it('surfaces the server error when finishing the lesson is rejected for missing required files', async () => {
    getLesson.mockResolvedValue(lessonWith([], { completed: false, files: [] }));
    mine.mockResolvedValue({ data: { data: { submitted: [] } } });
    setProgress.mockRejectedValue({ response: { data: { error: 'יש לסמן את הקבצים הבאים כנצפו' } } });
    renderPage();

    await screen.findByRole('heading', { name: 'שיעור מבוא' });
    await userEvent.click(screen.getByRole('button', { name: 'סיימתי את השיעור' }));
    expect(await screen.findByText('יש לסמן את הקבצים הבאים כנצפו')).toBeInTheDocument();
  });
});

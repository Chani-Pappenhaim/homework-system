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
vi.mock('@/api/aiUsage.api', () => ({ aiUsageApi: { availability: vi.fn() } }));

import { lessonsApi } from '@/api/lessons.api';
import { submissionsApi } from '@/api/submissions.api';
import { messagesApi } from '@/api/messages.api';
import { aiUsageApi } from '@/api/aiUsage.api';

const getLesson = lessonsApi.get as unknown as ReturnType<typeof vi.fn>;
const setProgress = lessonsApi.setProgress as unknown as ReturnType<typeof vi.fn>;
const markFileViewed = lessonsApi.markFileViewed as unknown as ReturnType<typeof vi.fn>;
const mine = submissionsApi.mine as unknown as ReturnType<typeof vi.fn>;
const submitRepo = submissionsApi.submitRepo as unknown as ReturnType<typeof vi.fn>;
const requestAiReview = submissionsApi.requestAiReview as unknown as ReturnType<typeof vi.fn>;
const sendMessage = messagesApi.send as unknown as ReturnType<typeof vi.fn>;
const aiAvailability = aiUsageApi.availability as unknown as ReturnType<typeof vi.fn>;

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

function submittedForAi(assignment: Record<string, any> = {}) {
  getLesson.mockResolvedValue(
    lessonWith([{ id: 'a2', title: 'מטלה AI', deadline: FUTURE, allowFile: false, allowGithub: true, allowedTypes: [], ...assignment }])
  );
  mine.mockResolvedValue({
    data: {
      data: {
        submitted: [{
          id: 'sub1', assignmentId: 'a2', assignmentTitle: 'מטלה AI', submittedAt: '2026-07-01T10:00:00Z',
          isLate: false, githubUrl: 'https://github.com/x/y', aiStatus: 'none', grade: null,
        }],
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  aiAvailability.mockResolvedValue({ data: { success: true, data: { available: true, reason: null, resumesAt: null } } });
});

describe('StudentLessonDetailPage', () => {
  it('hides the AI review when the teacher turned it off for the assignment', async () => {
    submittedForAi({ aiReviewEnabled: false });
    renderPage();
    await openAssignmentsTab('שיעור מבוא');
    await screen.findByText('מטלה AI');
    expect(screen.queryByRole('button', { name: 'בקשי בדיקה' })).not.toBeInTheDocument();
  });

  it('tells her which tags to push when the review of an exercise given in parts reads them', async () => {
    submittedForAi({ aiGitFromTag: 'lesson1', aiGitToTag: 'lesson3' });
    renderPage();
    await openAssignmentsTab('שיעור מבוא');
    expect(await screen.findByText(/בדיקת ה-AI קוראת את הריפו/)).toHaveTextContent('בתגית lesson3, ואת השינויים מאז התגית lesson1');
    expect(screen.getByText(/git push origin lesson3/)).toHaveTextContent(
      'git tag lesson1 git push origin lesson1 git tag lesson3 git push origin lesson3'
    );
  });

  it('replaces the AI review button with the reset time once the daily quota is spent', async () => {
    aiAvailability.mockResolvedValue({
      data: { success: true, data: { available: false, reason: 'daily-quota', resumesAt: new Date(Date.now() + 3_600_000).toISOString() } },
    });
    submittedForAi();
    renderPage();
    await openAssignmentsTab('שיעור מבוא');
    expect(await screen.findByText(/המכסה היומית של ה-AI נגמרה/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'בקשי בדיקה' })).not.toBeInTheDocument();
  });

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

describe('one assignment, linked and collapsed', () => {
  it('opens the assignments tab marked at the linked assignment, its brief hideable', async () => {
    getLesson.mockResolvedValue(lessonWith([
      { id: 'a1', title: 'מטלה ראשונה', description: 'תיאור ארוך של המטלה', deadline: FUTURE, allowFile: false, allowGithub: true, allowedTypes: [] },
    ]));
    mine.mockResolvedValue({ data: { data: { submitted: [] } } });
    renderWithProviders(<StudentLessonDetailPage />, {
      path: '/student/lesson/:id',
      initialEntries: ['/student/lesson/l1?tab=assignments&assignment=a1'],
    });
    expect(await screen.findByText('תיאור ארוך של המטלה')).toBeInTheDocument();
    expect(screen.getByText('הגשה: מטלה ראשונה')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /הסתרת התיאור/ }));
    expect(screen.queryByText('תיאור ארוך של המטלה')).not.toBeInTheDocument();
    expect(screen.getByText('הגשה: מטלה ראשונה')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /הצגת התיאור/ }));
    expect(screen.getByText('תיאור ארוך של המטלה')).toBeInTheDocument();
  });
});

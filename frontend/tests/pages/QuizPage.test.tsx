import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizPage from '@/pages/student/QuizPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/quizzes.api', () => ({
  quizzesApi: { get: vi.fn(), attempt: vi.fn(), results: vi.fn() },
}));
import { quizzesApi } from '@/api/quizzes.api';
const getQuiz = quizzesApi.get as unknown as ReturnType<typeof vi.fn>;
const attempt = quizzesApi.attempt as unknown as ReturnType<typeof vi.fn>;

const readyQuiz = {
  data: {
    data: {
      status: 'ready',
      quiz: {
        id: 'q1',
        questions: [
          { id: 'q-1', question: 'מהו React?', options: ['ספרייה', 'שפה'], correctIndex: 0 },
        ],
      },
    },
  },
};

function renderPage() {
  return renderWithProviders(<QuizPage />, {
    path: '/student/quiz/:lessonId',
    initialEntries: ['/student/quiz/l1'],
  });
}

beforeEach(() => vi.clearAllMocks());

describe('QuizPage', () => {
  // Generation is the teacher's action now. A student never waits on an AI call,
  // so there is no "generating" state on this page any more — an unpublished or
  // missing quiz both read as simply "not available yet".
  it('shows the server\'s message when no quiz is available to take', async () => {
    getQuiz.mockResolvedValue({
      data: { data: { status: 'unavailable', message: 'החידון לשיעור הזה עדיין לא פורסם.' } },
    });
    renderPage();
    expect(await screen.findByText('החידון עדיין לא זמין')).toBeInTheDocument();
    expect(screen.getByText('החידון לשיעור הזה עדיין לא פורסם.')).toBeInTheDocument();
    // Nothing she can do about it — offering "try again" would be a false promise.
    expect(screen.queryByRole('button', { name: 'נסי שוב' })).not.toBeInTheDocument();
  });

  it('offers a retry when the request itself failed', async () => {
    getQuiz.mockRejectedValue(new Error('network'));
    renderPage();
    expect(await screen.findByText('לא הצלחנו לטעון את החידון')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נסי שוב' })).toBeInTheDocument();
  });

  it('renders quiz questions and options when ready', async () => {
    getQuiz.mockResolvedValue(readyQuiz);
    renderPage();
    expect(await screen.findByText('1. מהו React?')).toBeInTheDocument();
    expect(screen.getByText('ספרייה')).toBeInTheDocument();
    expect(screen.getByText('1 שאלות')).toBeInTheDocument();
  });

  it('disables submit until every question is answered', async () => {
    getQuiz.mockResolvedValue(readyQuiz);
    renderPage();
    await screen.findByText('1. מהו React?');
    const submit = screen.getByRole('button', { name: 'הגש חידון' });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getAllByRole('radio')[0]);
    expect(submit).toBeEnabled();
  });

  it('submits answers and shows the score result', async () => {
    getQuiz.mockResolvedValue(readyQuiz);
    attempt.mockResolvedValue({ data: { data: { score: 100, correct: 1, total: 1 } } });
    renderPage();
    await screen.findByText('1. מהו React?');
    await userEvent.click(screen.getAllByRole('radio')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'הגש חידון' }));
    await waitFor(() => expect(attempt).toHaveBeenCalledWith('l1', [0]));
    expect(await screen.findByText('100%')).toBeInTheDocument();
    expect(screen.getByText('מצוין!')).toBeInTheDocument();
  });
});

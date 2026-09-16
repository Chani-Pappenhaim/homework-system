import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizPanel from '@/components/teacher/QuizPanel';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/quizzes.api', () => ({
  quizzesApi: {
    get: vi.fn(),
    generate: vi.fn(),
    updateQuestions: vi.fn(),
    setPublished: vi.fn(),
    results: vi.fn(),
    attempt: vi.fn(),
  },
}));
import { quizzesApi } from '@/api/quizzes.api';

const getQuiz = quizzesApi.get as unknown as ReturnType<typeof vi.fn>;
const generate = quizzesApi.generate as unknown as ReturnType<typeof vi.fn>;
const updateQuestions = quizzesApi.updateQuestions as unknown as ReturnType<typeof vi.fn>;
const setPublished = quizzesApi.setPublished as unknown as ReturnType<typeof vi.fn>;

const questions = [
  { id: 'q-1', question: 'מהו React?', options: ['ספרייה', 'שפה', 'DB', 'OS'], correctIndex: 0 },
];

const state = (over: Record<string, unknown>) => ({ data: { data: over } });
const withQuiz = (published: boolean) =>
  state({ status: 'ready', quiz: { id: 'qz1', published, questionCount: 1, questions } });

function renderPanel(hasContent = true) {
  return renderWithProviders(<QuizPanel lessonId="l1" hasContent={hasContent} />);
}

beforeEach(() => vi.clearAllMocks());

describe('QuizPanel — creating', () => {
  it('offers to generate when no quiz exists yet', async () => {
    getQuiz.mockResolvedValue(state({ status: 'none' }));
    generate.mockResolvedValue(state({ status: 'generating' }));
    renderPanel();

    const button = await screen.findByRole('button', { name: /צרי בוחן בעזרת AI/ });
    await userEvent.click(button);
    await waitFor(() => expect(generate).toHaveBeenCalledWith('l1', false));
  });

  it('cannot generate from a lesson with no content', async () => {
    getQuiz.mockResolvedValue(state({ status: 'none' }));
    renderPanel(false);
    expect(await screen.findByRole('button', { name: /צרי בוחן בעזרת AI/ })).toBeDisabled();
  });

  it('shows the technical reason when generation failed', async () => {
    getQuiz.mockResolvedValue(state({ status: 'failed', message: 'יצירת הבוחן נכשלה: Gemini API error: 404' }));
    renderPanel();
    expect(await screen.findByText(/Gemini API error: 404/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /נסי שוב/ })).toBeInTheDocument();
  });
});

describe('QuizPanel — editing', () => {
  it('marks a draft as invisible to students', async () => {
    getQuiz.mockResolvedValue(withQuiz(false));
    renderPanel();
    expect(await screen.findByText('טיוטה — התלמידות לא רואות')).toBeInTheDocument();
  });

  it('saves an edited question', async () => {
    getQuiz.mockResolvedValue(withQuiz(false));
    updateQuestions.mockResolvedValue(withQuiz(false));
    renderPanel();

    const field = await screen.findByLabelText('שאלה 1');
    await userEvent.clear(field);
    await userEvent.type(field, 'מהו ה-DOM?');
    await userEvent.click(screen.getByRole('button', { name: /שמרי שינויים/ }));

    await waitFor(() => expect(updateQuestions).toHaveBeenCalled());
    expect(updateQuestions.mock.calls[0][1][0].question).toBe('מהו ה-DOM?');
  });

  it('saves a changed correct answer', async () => {
    getQuiz.mockResolvedValue(withQuiz(false));
    updateQuestions.mockResolvedValue(withQuiz(false));
    renderPanel();

    await screen.findByLabelText('שאלה 1');
    await userEvent.click(screen.getByLabelText('סמני כתשובה נכונה לשאלה 1, אפשרות 2'));
    await userEvent.click(screen.getByRole('button', { name: /שמרי שינויים/ }));

    await waitFor(() => expect(updateQuestions).toHaveBeenCalled());
    expect(updateQuestions.mock.calls[0][1][0].correctIndex).toBe(1);
  });

  it('keeps save disabled until something actually changes', async () => {
    getQuiz.mockResolvedValue(withQuiz(false));
    renderPanel();
    await screen.findByLabelText('שאלה 1');
    expect(screen.getByRole('button', { name: /שמרי שינויים/ })).toBeDisabled();
  });
});

describe('QuizPanel — publishing', () => {
  it('publishes a draft to the class', async () => {
    getQuiz.mockResolvedValue(withQuiz(false));
    setPublished.mockResolvedValue(state({ published: true }));
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /פרסמי לתלמידות/ }));
    await waitFor(() => expect(setPublished).toHaveBeenCalledWith('l1', true));
  });

  it('pulls a published quiz back to a draft', async () => {
    getQuiz.mockResolvedValue(withQuiz(true));
    setPublished.mockResolvedValue(state({ published: false }));
    renderPanel();

    expect(await screen.findByText('פורסם לתלמידות')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /החזירי לטיוטה/ }));
    await waitFor(() => expect(setPublished).toHaveBeenCalledWith('l1', false));
  });

  it('refuses to publish while edits are unsaved — that would publish a different quiz', async () => {
    getQuiz.mockResolvedValue(withQuiz(false));
    renderPanel();

    const field = await screen.findByLabelText('שאלה 1');
    await userEvent.type(field, ' שינוי');

    expect(screen.getByRole('button', { name: /פרסמי לתלמידות/ })).toBeDisabled();
    expect(screen.getByText('יש שינויים שלא נשמרו. שמרי אותם כדי לאפשר פרסום.')).toBeInTheDocument();
    expect(setPublished).not.toHaveBeenCalled();
  });
});

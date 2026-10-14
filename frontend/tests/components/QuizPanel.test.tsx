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
vi.mock('@/api/aiUsage.api', () => ({ aiUsageApi: { availability: vi.fn() } }));
import { quizzesApi } from '@/api/quizzes.api';
import { aiUsageApi } from '@/api/aiUsage.api';

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

function renderPanel(hasContent = true, hasFiles = false) {
  return renderWithProviders(<QuizPanel lessonId="l1" hasContent={hasContent} hasFiles={hasFiles} />);
}

const aiAvailability = aiUsageApi.availability as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  aiAvailability.mockResolvedValue({ data: { success: true, data: { available: true, reason: null, resumesAt: null } } });
});

describe('QuizPanel — creating', () => {
  it('offers to generate when no quiz exists yet', async () => {
    getQuiz.mockResolvedValue(state({ status: 'none' }));
    generate.mockResolvedValue(state({ status: 'generating' }));
    renderPanel();

    const button = await screen.findByRole('button', { name: /צרי בוחן בעזרת AI/ });
    await userEvent.click(button);
    await waitFor(() => expect(generate).toHaveBeenCalledWith('l1', false, false));
  });

  it('cannot generate while the AI is unavailable, and says why', async () => {
    aiAvailability.mockResolvedValue({
      data: { success: true, data: { available: false, reason: 'not-configured', resumesAt: null } },
    });
    getQuiz.mockResolvedValue(state({ status: 'none' }));
    renderPanel();
    expect(await screen.findByText('שירות ה-AI אינו זמין כרגע.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /צרי בוחן בעזרת AI/ })).toBeDisabled();
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

const progress = (over: Record<string, unknown> = {}) => ({
  stage: 'generating', attempt: 1, maxAttempts: 3, withFiles: false, elapsedSeconds: 42, ...over,
});

describe('QuizPanel — generation progress', () => {
  it('shows the current stage and how long it has been running', async () => {
    getQuiz.mockResolvedValue(state({ status: 'generating', progress: progress({ withFiles: true }) }));
    renderPanel();
    expect(await screen.findByText('ה-AI כותב שאלות על תוכן השיעור…')).toBeInTheDocument();
    expect(screen.getByText('קריאת הקבצים')).toBeInTheDocument();
    expect(screen.getByText('כתיבת השאלות').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText(/עברו 0:4\d/)).toBeInTheDocument();
    expect(screen.getByText(/אפשר לצאת מהעמוד/)).toBeInTheDocument();
  });

  it('leaves out the file-reading stage when no files were asked for', async () => {
    getQuiz.mockResolvedValue(state({ status: 'generating', progress: progress() }));
    renderPanel();
    await screen.findByText('כתיבת השאלות');
    expect(screen.queryByText('קריאת הקבצים')).not.toBeInTheDocument();
  });

  it('says which attempt it is on and why the previous one failed', async () => {
    getQuiz.mockResolvedValue(state({
      status: 'generating', progress: progress({ attempt: 2, lastFailure: 'timeout' }),
    }));
    renderPanel();
    expect(await screen.findByText('ניסיון 2 מתוך 3 — בניסיון הקודם ה-AI לא ענה בזמן')).toBeInTheDocument();
  });
});

describe('QuizPanel — lesson files', () => {
  it('lists the files that would be left out, once she chooses to include files', async () => {
    getQuiz.mockResolvedValue(state({ status: 'none', excludedFiles: ['code.zip', 'talk.mp4'] }));
    generate.mockResolvedValue(state({ status: 'generating' }));
    renderPanel(true, true);

    const checkbox = await screen.findByRole('checkbox', { name: /כללי גם את הקבצים/ });
    expect(screen.queryByText(/לא ייכללו/)).not.toBeInTheDocument();
    await userEvent.click(checkbox);
    expect(screen.getByText('לא ייכללו: code.zip, talk.mp4')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /צרי בוחן בעזרת AI/ }));
    await waitFor(() => expect(generate).toHaveBeenCalledWith('l1', true, false));
  });

  it('says what a generated quiz was built from', async () => {
    getQuiz.mockResolvedValue(state({
      status: 'ready',
      quiz: {
        id: 'qz1', published: false, questionCount: 1, questions,
        sourceFiles: { included: ['a.pdf', 'b.docx'], skipped: [{ name: 'c.zip', reason: 'unsupported' }] },
      },
    }));
    renderPanel();
    expect(await screen.findByText(/נוצר מתוך תוכן השיעור ו-2 קבצים/)).toBeInTheDocument();
    expect(screen.getByText('· לא נכללו: c.zip (סוג קובץ שלא נקרא)')).toBeInTheDocument();
  });
});

describe('QuizPanel — regenerating', () => {
  it('regenerates a draft after she confirms', async () => {
    getQuiz.mockResolvedValue(withQuiz(false));
    generate.mockResolvedValue(state({ status: 'generating' }));
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /צרי מחדש/ }));
    expect(await screen.findByText('ליצור את הבוחן מחדש?')).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();

    const dialogButtons = screen.getAllByRole('button', { name: /צרי מחדש/ });
    await userEvent.click(dialogButtons[dialogButtons.length - 1]!);
    await waitFor(() => expect(generate).toHaveBeenCalledWith('l1', false, true));
  });

  it('does not offer to regenerate a published quiz', async () => {
    getQuiz.mockResolvedValue(withQuiz(true));
    renderPanel();
    await screen.findByText('פורסם לתלמידות');
    expect(screen.queryByRole('button', { name: /צרי מחדש/ })).not.toBeInTheDocument();
  });

  it('keeps the old questions visible but locked while new ones are generated', async () => {
    getQuiz.mockResolvedValue(state({
      status: 'ready',
      quiz: { id: 'qz1', published: false, questionCount: 1, questions },
      regeneration: { status: 'generating', progress: progress() },
    }));
    renderPanel();

    expect(await screen.findByText('ה-AI כותב שאלות חדשות על תוכן השיעור…')).toBeInTheDocument();
    expect(screen.getByLabelText('שאלה 1')).toBeDisabled();
    expect(screen.getByRole('button', { name: /פרסמי לתלמידות/ })).toBeDisabled();
  });

  it('shows why a regeneration failed, and keeps the old questions', async () => {
    getQuiz.mockResolvedValue(state({
      status: 'ready',
      quiz: { id: 'qz1', published: false, questionCount: 1, questions },
      regeneration: { status: 'failed', message: 'הגענו כרגע למכסת השימוש ב-AI. נסי שוב בעוד כמה דקות.' },
    }));
    renderPanel();
    expect(await screen.findByText(/מכסת השימוש/)).toBeInTheDocument();
    expect(screen.getByLabelText('שאלה 1')).not.toBeDisabled();
  });
});

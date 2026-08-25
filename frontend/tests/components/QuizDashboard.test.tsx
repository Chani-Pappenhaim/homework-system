import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import QuizDashboard from '@/components/teacher/QuizDashboard';
import { renderWithProviders } from '../utils/render';
import type { QuizResultsDTO } from '@/types';

const question = (id: string, text: string, over: Partial<QuizResultsDTO['questions'][0]> = {}) => ({
  id,
  question: text,
  options: ['נכונה', 'מלכודת', 'ג', 'ד'],
  correctIndex: 0,
  optionCounts: [4, 0, 0, 0],
  unanswered: 0,
  correctCount: 4,
  correctRate: 100,
  ...over,
});

const data = (over: Partial<QuizResultsDTO> = {}): QuizResultsDTO => ({
  quiz: { id: 'qz1', createdAt: '2026-08-16T10:00:00Z', published: true, questionCount: 2 },
  summary: { attemptCount: 4, averageScore: 62.5 },
  questions: [
    question('q1', 'שאלה קלה'),
    question('q2', 'שאלה קשה', { optionCounts: [1, 3, 0, 0], correctCount: 1, correctRate: 25 }),
  ],
  results: [
    { studentName: 'שרה', studentEmail: 's@x.com', score: 100, takenAt: '2026-08-16T11:00:00Z' },
  ],
  ...over,
});

describe('QuizDashboard', () => {
  it('leads with the class summary', () => {
    renderWithProviders(<QuizDashboard data={data()} />);
    // Scoped to the tile — a bare "4" also appears in the per-option counts.
    const tile = screen.getByText('ענו על החידון').closest('div')!;
    expect(within(tile).getByText('4')).toBeInTheDocument();
    expect(screen.getByText('63%')).toBeInTheDocument();
  });

  it('puts the hardest question first — that is the reason to open the page', () => {
    renderWithProviders(<QuizDashboard data={data()} />);
    const questions = screen.getAllByText(/^שאלה (קלה|קשה)$/);
    expect(questions[0]).toHaveTextContent('שאלה קשה');
  });

  it('prints every count as a number, never colour alone', () => {
    renderWithProviders(<QuizDashboard data={data()} />);
    // "1 מתוך 4" for the hard question, "4 מתוך 4" for the easy one.
    expect(screen.getByText(/1 מתוך 4/)).toBeInTheDocument();
    expect(screen.getByText(/4 מתוך 4/)).toBeInTheDocument();
  });

  it('names the correct answer in words, so correctness is not a colour', () => {
    renderWithProviders(<QuizDashboard data={data()} />);
    expect(screen.getAllByText('(התשובה הנכונה)').length).toBe(2);
  });

  it('reports students who skipped a question separately from wrong answers', () => {
    renderWithProviders(<QuizDashboard data={data({
      questions: [question('q1', 'שאלה', { optionCounts: [2, 0, 0, 0], correctCount: 2, correctRate: 50, unanswered: 2 })],
    })} />);
    expect(screen.getByText('2 לא ענו על שאלה זו')).toBeInTheDocument();
  });

  it('says there is no data yet instead of showing a 0% that reads as total failure', () => {
    renderWithProviders(<QuizDashboard data={data({
      summary: { attemptCount: 0, averageScore: null },
      results: [],
    })} />);
    expect(screen.getByText(/אף תלמידה עוד לא ענתה על החידון/)).toBeInTheDocument();
    expect(screen.queryByText('פילוח לפי שאלה')).not.toBeInTheDocument();
  });

  it('still lists the per-student scores as a table', () => {
    renderWithProviders(<QuizDashboard data={data()} />);
    expect(screen.getByText('שרה')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});

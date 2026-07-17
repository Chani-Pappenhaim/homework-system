import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import AiUsagePage from '@/pages/teacher/AiUsagePage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/aiUsage.api', () => ({
  aiUsageApi: { summary: vi.fn() },
}));

import { aiUsageApi } from '@/api/aiUsage.api';
const summaryMock = aiUsageApi.summary as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const sampleSummary = {
  totalReviews: 42,
  totalQuizzes: 7,
  totalTokensInput: 1000,
  totalTokensOutput: 500,
  totalCostUsd: 3.456,
  byMonth: [
    { month: '2026-06', reviews: 20, quizzes: 3, costUsd: 1.5 },
    { month: '2026-07', reviews: 22, quizzes: 4, costUsd: 1.956 },
  ],
};

describe('AiUsagePage', () => {
  it('renders the stat cards from the summary', async () => {
    summaryMock.mockResolvedValue({ data: { data: sampleSummary } });
    renderWithProviders(<AiUsagePage />);

    expect(await screen.findByText('42')).toBeInTheDocument(); // totalReviews
    expect(screen.getByText('7')).toBeInTheDocument(); // totalQuizzes
    expect(screen.getByText('1,500')).toBeInTheDocument(); // total tokens
    expect(screen.getByText('$3.46')).toBeInTheDocument(); // cost, toFixed(2)
  });

  it('renders a row per month in the breakdown table', async () => {
    summaryMock.mockResolvedValue({ data: { data: sampleSummary } });
    renderWithProviders(<AiUsagePage />);

    expect(await screen.findByText('$1.50')).toBeInTheDocument();
    expect(screen.getByText('$1.96')).toBeInTheDocument();
    // review counts appear in table cells
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
  });

  it('shows an empty-state row when there is no monthly data', async () => {
    summaryMock.mockResolvedValue({
      data: { data: { ...sampleSummary, byMonth: [] } },
    });
    renderWithProviders(<AiUsagePage />);
    expect(await screen.findByText('אין נתוני שימוש עדיין')).toBeInTheDocument();
  });
});

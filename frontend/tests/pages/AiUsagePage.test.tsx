import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AiUsagePage from '@/pages/teacher/AiUsagePage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/aiUsage.api', () => ({
  aiUsageApi: { summary: vi.fn(), storage: vi.fn(), updateSettings: vi.fn() },
}));

import { aiUsageApi } from '@/api/aiUsage.api';
const summaryMock = aiUsageApi.summary as unknown as ReturnType<typeof vi.fn>;
const updateSettings = aiUsageApi.updateSettings as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const sampleSummary = {
  totalReviews: 42,
  totalQuizzes: 7,
  totalTokensInput: 1000,
  totalTokensOutput: 500,
  totalCostUsd: 3.456,
  free: { calls: 35, tokensInput: 600, tokensOutput: 300, costUsd: 0 },
  paid: { calls: 14, tokensInput: 400, tokensOutput: 200, costUsd: 3.456 },
  quota: {
    freeKeyConfigured: true,
    paidKeyConfigured: true,
    freeRequestsToday: 12,
    freeDailyLimit: 20,
    resetsAt: '2026-10-15T07:00:00.000Z',
    freeExhaustedUntil: null as string | null,
    paidFallback: 'DAILY_QUOTA',
  },
  byMonth: [
    { month: '2026-06', reviews: 20, quizzes: 3, paidCalls: 9, costUsd: 1.5 },
    { month: '2026-07', reviews: 22, quizzes: 4, paidCalls: 11, costUsd: 1.956 },
  ],
};

const renderSummary = (summary: object) => {
  summaryMock.mockResolvedValue({ data: { data: summary } });
  renderWithProviders(<AiUsagePage />);
};
const withQuota = (quota: Partial<typeof sampleSummary.quota>) =>
  ({ ...sampleSummary, quota: { ...sampleSummary.quota, ...quota } });

describe('AiUsagePage', () => {
  it('renders the stat cards from the summary', async () => {
    renderSummary(sampleSummary);

    expect(await screen.findByText('42')).toBeInTheDocument(); // totalReviews
    expect(screen.getByText('7')).toBeInTheDocument(); // totalQuizzes
    expect(screen.getByText('1,500')).toBeInTheDocument(); // total tokens
    // The billed cost: on its stat card and on the paid tier's row.
    expect(screen.getAllByText('$3.46')).toHaveLength(2);
  });

  it('renders a row per month in the breakdown table, with its paid calls', async () => {
    renderSummary(sampleSummary);

    expect(await screen.findByText('$1.50')).toBeInTheDocument();
    expect(screen.getByText('$1.96')).toBeInTheDocument();
    // review counts appear in table cells
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
  });

  it('shows an empty-state row when there is no monthly data', async () => {
    renderSummary({ ...sampleSummary, byMonth: [] });
    expect(await screen.findByText('אין נתוני שימוש עדיין')).toBeInTheDocument();
  });

  it('shows a sub-cent cost as <$0.01, left to right, instead of $0.00', async () => {
    renderSummary({ ...sampleSummary, totalCostUsd: 0.004, paid: { ...sampleSummary.paid, costUsd: 0.004 } });
    const costs = await screen.findAllByText('<$0.01');
    expect(costs).toHaveLength(2);
    costs.forEach((cost) => expect(cost).toHaveAttribute('dir', 'ltr'));
  });
});

describe('AiUsagePage — Gemini quota card', () => {
  it('shows today\'s free requests out of the daily limit', async () => {
    renderSummary(sampleSummary);

    expect(await screen.findByText('מסלול חינמי')).toBeInTheDocument();
    expect(screen.getByText('12 בקשות חינמיות היום')).toBeInTheDocument();
    expect(screen.getByText('מתוך 20')).toBeInTheDocument();
    expect(screen.getByText(/אין הגבלה על סך\s+הטוקנים/)).toBeInTheDocument();
    expect(screen.queryByText(/לא מוגדר מפתח בתשלום/)).not.toBeInTheDocument();
  });

  it('breaks calls, tokens and cost down by tier', async () => {
    renderSummary(sampleSummary);

    const freeRow = (await screen.findByText('חינמי')).closest('tr')!;
    expect(freeRow).toHaveTextContent('35');
    expect(freeRow).toHaveTextContent('600');
    expect(freeRow).toHaveTextContent('300');
    expect(freeRow).toHaveTextContent('$0.00');
    const paidRow = screen.getByText('בתשלום').closest('tr')!;
    expect(paidRow).toHaveTextContent('14');
    expect(paidRow).toHaveTextContent('400');
    expect(paidRow).toHaveTextContent('200');
    expect(paidRow).toHaveTextContent('$3.46');
  });

  it('points to AI Studio while the daily limit is still unknown', async () => {
    renderSummary(withQuota({ freeDailyLimit: null }));

    expect(await screen.findByText(/12 בקשות חינמיות היום/)).toBeInTheDocument();
    expect(screen.queryByText(/^מתוך/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AI Studio' })).toHaveAttribute('href', 'https://aistudio.google.com/rate-limit');
  });

  it('says calls go to the paid key, and until when, once the free quota is spent', async () => {
    renderSummary(withQuota({ freeRequestsToday: 20, freeExhaustedUntil: '2026-10-15T07:00:00.000Z' }));
    expect(await screen.findByText(/^בתשלום עד \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('warns that the AI stops for the day when there is no paid key', async () => {
    renderSummary(withQuota({ paidKeyConfigured: false, freeExhaustedUntil: '2026-10-15T07:00:00.000Z' }));

    expect(await screen.findByText('המכסה היומית נגמרה')).toBeInTheDocument();
    expect(screen.getByText(/^לא מוגדר מפתח בתשלום/)).toBeInTheDocument();
  });

  it('says the AI buttons are off until the reset when the teacher never allows the paid key', async () => {
    renderSummary(withQuota({ paidFallback: 'NEVER', freeExhaustedUntil: '2026-10-15T07:00:00.000Z' }));

    expect(await screen.findByText('המכסה היומית נגמרה')).toBeInTheDocument();
    expect(screen.getByText(/כפתורי ה-AI מושבתים עד \d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.queryByText(/^בתשלום עד/)).not.toBeInTheDocument();
  });

  it('flags the AI as blocked when only a paid key exists and it is not allowed', async () => {
    renderSummary(withQuota({ freeKeyConfigured: false, paidFallback: 'NEVER' }));
    expect(await screen.findByText('AI חסום')).toBeInTheDocument();
  });
});

describe('AiUsagePage — paid fallback settings', () => {
  it('shows the saved choice', async () => {
    renderSummary(withQuota({ paidFallback: 'ANY_LIMIT' }));
    expect(await screen.findByRole('radio', { name: /גם בעומס רגעי/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /רק כשהמכסה היומית נגמרת/ })).not.toBeChecked();
  });

  it('saves a new choice as soon as the teacher picks it', async () => {
    updateSettings.mockResolvedValue({ data: { success: true, data: { paidFallback: 'NEVER' } } });
    renderSummary(sampleSummary);

    await userEvent.click(await screen.findByRole('radio', { name: /אף פעם/ }));

    expect(updateSettings).toHaveBeenCalledWith({ paidFallback: 'NEVER' });
    expect(screen.getByRole('radio', { name: /אף פעם/ })).toBeChecked();
  });

  it('goes back to the saved choice when saving fails', async () => {
    updateSettings.mockRejectedValue(new Error('network'));
    renderSummary(sampleSummary);

    await userEvent.click(await screen.findByRole('radio', { name: /אף פעם/ }));

    await waitFor(() => expect(screen.getByRole('radio', { name: /רק כשהמכסה היומית נגמרת/ })).toBeChecked());
  });

  it('notes that without a paid key the AI stops whatever is chosen', async () => {
    renderSummary(withQuota({ paidKeyConfigured: false }));
    expect(await screen.findByText(/בכל אחת מהאפשרויות ה-AI נעצר/)).toBeInTheDocument();
  });

  it('shows only the paid tier when the free key is not configured', async () => {
    renderSummary(withQuota({ freeKeyConfigured: false }));

    expect(await screen.findByText('מסלול בתשלום')).toBeInTheDocument();
    expect(screen.queryByText(/בקשות חינמיות היום/)).not.toBeInTheDocument();
  });

  it('flags an AI with no key at all', async () => {
    renderSummary(withQuota({ freeKeyConfigured: false, paidKeyConfigured: false }));
    expect(await screen.findByText('AI לא מוגדר')).toBeInTheDocument();
  });
});

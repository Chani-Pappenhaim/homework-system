import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '../utils/render';

vi.mock('@/api/aiUsage.api', () => ({
  aiUsageApi: { availability: vi.fn() },
}));

import { aiUsageApi } from '@/api/aiUsage.api';
import { aiUnavailableMessage, formatResumeTime, useAiAvailability } from '@/hooks/useAiAvailability';

const availability = aiUsageApi.availability as unknown as ReturnType<typeof vi.fn>;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>
);
const respond = (data: object) => availability.mockResolvedValue({ data: { success: true, data } });
const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

beforeEach(() => vi.clearAllMocks());

describe('useAiAvailability', () => {
  it('counts as available while the check is still loading', () => {
    availability.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAiAvailability(), { wrapper });
    expect(result.current).toEqual({ available: true, message: null });
  });

  it('counts as available when the check itself fails', async () => {
    availability.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAiAvailability(), { wrapper });
    await waitFor(() => expect(availability).toHaveBeenCalled());
    expect(result.current.available).toBe(true);
  });

  it('is unavailable, with the time the quota resets, once the daily quota is spent', async () => {
    respond({ available: false, reason: 'daily-quota', resumesAt: inAnHour() });
    const { result } = renderHook(() => useAiAvailability(), { wrapper });
    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.message).toMatch(/^המכסה היומית של ה-AI נגמרה\. אפשר לנסות שוב (היום|מחר) אחרי \d{2}:\d{2}\.$/);
  });

  it('is available again once the reset time has passed while the page stayed open', async () => {
    respond({ available: false, reason: 'daily-quota', resumesAt: new Date(Date.now() - 1000).toISOString() });
    const { result } = renderHook(() => useAiAvailability(), { wrapper });
    await waitFor(() => expect(availability).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual({ available: true, message: null });
  });

  it('says the service is unavailable when no key may be used', async () => {
    respond({ available: false, reason: 'not-configured', resumesAt: null });
    const { result } = renderHook(() => useAiAvailability(), { wrapper });
    await waitFor(() => expect(result.current.message).toBe('שירות ה-AI אינו זמין כרגע.'));
  });
});

describe('formatResumeTime', () => {
  const RESET = '2026-10-15T07:00:00Z'; // 10:00 in Israel

  it('names tomorrow when the reset falls on the next Israeli day', () => {
    expect(formatResumeTime(RESET, new Date('2026-10-14T12:00:00Z'))).toBe('מחר אחרי 10:00');
  });

  it('names today when the reset is later the same Israeli day', () => {
    expect(formatResumeTime(RESET, new Date('2026-10-15T05:00:00Z'))).toBe('היום אחרי 10:00');
  });

  it('follows Israel winter time', () => {
    expect(formatResumeTime('2026-12-02T08:00:00Z', new Date('2026-12-01T20:00:00Z'))).toBe('מחר אחרי 10:00');
  });
});

describe('aiUnavailableMessage', () => {
  it('falls back to the general message when the reset time is unknown', () => {
    expect(aiUnavailableMessage({ available: false, reason: 'daily-quota', resumesAt: null }))
      .toBe('שירות ה-AI אינו זמין כרגע.');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: { appSettings: { findUnique: vi.fn(), upsert: vi.fn() } },
}));

import { prisma } from '../../src/config/prisma';
import { getAiSettings, updateAiSettings } from '../../src/services/settings.service';

const p = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('settings.service.getAiSettings', () => {
  it('reads the saved setting', async () => {
    p.appSettings.findUnique.mockResolvedValue({ id: 'app', aiPaidFallback: 'NEVER' });
    expect(await getAiSettings()).toEqual({ paidFallback: 'NEVER' });
    expect(p.appSettings.findUnique).toHaveBeenCalledWith({ where: { id: 'app' } });
  });

  it('falls back to the daily quota until the teacher first saves', async () => {
    p.appSettings.findUnique.mockResolvedValue(null);
    expect(await getAiSettings()).toEqual({ paidFallback: 'DAILY_QUOTA' });
  });

  it('falls back to the defaults when the database cannot be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    p.appSettings.findUnique.mockRejectedValue(new Error('connection refused'));
    expect(await getAiSettings()).toEqual({ paidFallback: 'DAILY_QUOTA' });
  });
});

describe('settings.service.updateAiSettings', () => {
  it('saves the single settings row', async () => {
    p.appSettings.upsert.mockResolvedValue({ id: 'app', aiPaidFallback: 'ANY_LIMIT' });
    expect(await updateAiSettings({ paidFallback: 'ANY_LIMIT' })).toEqual({ paidFallback: 'ANY_LIMIT' });
    expect(p.appSettings.upsert).toHaveBeenCalledWith({
      where: { id: 'app' },
      create: { id: 'app', aiPaidFallback: 'ANY_LIMIT' },
      update: { aiPaidFallback: 'ANY_LIMIT' },
    });
  });

  it.each([['SOMETIMES'], [undefined], [42]])('rejects %s', async (paidFallback) => {
    await expect(updateAiSettings({ paidFallback })).rejects.toMatchObject({ status: 400 });
    expect(p.appSettings.upsert).not.toHaveBeenCalled();
  });
});

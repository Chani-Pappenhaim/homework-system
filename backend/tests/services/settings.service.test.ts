import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: { appSettings: { findUnique: vi.fn(), upsert: vi.fn() } },
}));

import { prisma } from '../../src/config/prisma';
import {
  getAiSettings, updateAiSettings, getEmailSettings, updateEmailSettings, emailSenderName, MAX_SENDER_NAME,
  getLatePolicy, updateLatePolicy,
} from '../../src/services/settings.service';

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

describe('the email sender name', () => {
  beforeEach(() => { process.env.BREVO_SENDER_NAME = 'Teacher Feature'; });

  it('is the site default until the teacher chooses one', async () => {
    p.appSettings.findUnique.mockResolvedValue(null);
    expect(await getEmailSettings()).toEqual({ senderName: null, defaultSenderName: 'Teacher Feature' });
    expect(await emailSenderName()).toBe('Teacher Feature');
  });

  it('saves her name on one line, and an empty one goes back to the default', async () => {
    p.appSettings.upsert.mockResolvedValue({});
    const saved = await updateEmailSettings({ senderName: '  המורה\n עדי שלום ' });
    expect(saved.senderName).toBe('המורה עדי שלום');
    expect(p.appSettings.upsert.mock.calls[0][0].update).toEqual({ emailSenderName: 'המורה עדי שלום' });

    expect((await updateEmailSettings({ senderName: '   ' })).senderName).toBeNull();
    expect(p.appSettings.upsert.mock.calls[1][0].update).toEqual({ emailSenderName: null });
  });

  it('refuses a name that is too long or not text', async () => {
    await expect(updateEmailSettings({ senderName: 'א'.repeat(MAX_SENDER_NAME + 1) })).rejects.toMatchObject({ status: 400 });
    await expect(updateEmailSettings({ senderName: 5 })).rejects.toMatchObject({ status: 400 });
    expect(p.appSettings.upsert).not.toHaveBeenCalled();
  });

  it('sends from her name, and from the default if the database cannot be read', async () => {
    p.appSettings.findUnique.mockResolvedValue({ emailSenderName: 'המורה עדי' });
    expect(await emailSenderName()).toBe('המורה עדי');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    p.appSettings.findUnique.mockRejectedValue(new Error('db down'));
    expect(await emailSenderName()).toBe('Teacher Feature');
    warn.mockRestore();
  });
});

describe('the late penalty', () => {
  it('reads the saved penalty', async () => {
    p.appSettings.findUnique.mockResolvedValue({ id: 'app', latePenaltyPerDay: 5, latePenaltyMax: 50 });
    expect(await getLatePolicy()).toEqual({ perDay: 5, max: 50 });
  });

  it('is 2 points a day up to 20 until the teacher first saves, or when the database cannot be read', async () => {
    p.appSettings.findUnique.mockResolvedValueOnce(null);
    expect(await getLatePolicy()).toEqual({ perDay: 2, max: 20 });
    p.appSettings.findUnique.mockRejectedValueOnce(new Error('db down'));
    expect(await getLatePolicy()).toEqual({ perDay: 2, max: 20 });
  });

  it('saves whole numbers between 0 and 100, also sent as text', async () => {
    expect(await updateLatePolicy({ perDay: '3', max: 0 })).toEqual({ perDay: 3, max: 0 });
    expect(p.appSettings.upsert).toHaveBeenCalledWith({
      where: { id: 'app' },
      create: { id: 'app', latePenaltyPerDay: 3, latePenaltyMax: 0 },
      update: { latePenaltyPerDay: 3, latePenaltyMax: 0 },
    });
  });

  it('refuses a missing, fractional, negative or too large value', async () => {
    for (const bad of [{ max: 10 }, { perDay: 1.5, max: 10 }, { perDay: -1, max: 10 }, { perDay: 2, max: 101 }, { perDay: '', max: 10 }]) {
      await expect(updateLatePolicy(bad)).rejects.toMatchObject({ status: 400 });
    }
    expect(p.appSettings.upsert).not.toHaveBeenCalled();
  });
});

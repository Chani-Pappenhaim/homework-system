import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { sendMail } from '../../src/services/email.service';

const OLD_ENV = { ...process.env };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
});

describe('email.service.sendMail', () => {
  it('skips (warns, no throw) when BREVO_API_KEY/BREVO_SENDER_EMAIL are not set', async () => {
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SENDER_EMAIL;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(sendMail({ to: 'a@x.com', subject: 'Hi', html: '<b>x</b>' })).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('sends through the Brevo API when configured', async () => {
    process.env.BREVO_API_KEY = 'key123';
    process.env.BREVO_SENDER_EMAIL = 'noreply@x.com';
    process.env.BREVO_SENDER_NAME = 'Click Class';
    fetchMock.mockResolvedValue({ ok: true });

    await sendMail({ to: 'b@x.com', subject: 'Report', html: '<p>hello</p>' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'api-key': 'key123' }),
        body: JSON.stringify({
          sender: { email: 'noreply@x.com', name: 'Click Class' },
          to: [{ email: 'b@x.com' }],
          subject: 'Report',
          htmlContent: '<p>hello</p>',
        }),
      })
    );
  });

  it('throws when Brevo responds with a non-ok status', async () => {
    process.env.BREVO_API_KEY = 'key123';
    process.env.BREVO_SENDER_EMAIL = 'noreply@x.com';
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' });

    await expect(sendMail({ to: 'b@x.com', subject: 'Report', html: '<p>hello</p>' }))
      .rejects.toThrow('Brevo email failed (400): bad request');
  });
});

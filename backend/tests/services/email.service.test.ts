import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

import { sendMail } from '../../src/services/email.service';

const OLD_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe('email.service.sendMail', () => {
  it('skips (warns, no throw) when SMTP_HOST is not set', async () => {
    delete process.env.SMTP_HOST;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(sendMail({ to: 'a@x.com', subject: 'Hi', html: '<b>x</b>' })).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('sends through the transporter when SMTP_HOST is set', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '2525';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.FROM_EMAIL = 'noreply@x.com';
    sendMailMock.mockResolvedValue({ messageId: '1' });

    await sendMail({ to: 'b@x.com', subject: 'Report', html: '<p>hello</p>' });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', port: 2525, auth: { user: 'user', pass: 'pass' } })
    );
    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'noreply@x.com',
      to: 'b@x.com',
      subject: 'Report',
      html: '<p>hello</p>',
    });
  });
});

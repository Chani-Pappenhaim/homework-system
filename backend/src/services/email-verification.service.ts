import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { emailQueue } from '../infrastructure/queues/queues';
import { AppError } from '../utils/errors';
import { isValidEmail } from '../utils/excel';
import { hashToken } from '../utils/token-hash';

const VERIFY_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Mails the user a link proving the address is hers. Replaces any earlier
 * link, so only the newest one works. Never throws: a queue hiccup must not
 * fail the action (adding a student, changing an email) that triggered it.
 */
export async function sendEmailVerification(userId: string): Promise<void> {
  try {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const user = await prisma.user.update({
      where: { id: userId },
      data: { emailVerifyTokenHash: hashToken(rawToken), emailVerifyExpiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS) },
    });
    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${rawToken}`;
    await emailQueue.add('verify-email', { email: user.email, name: user.name, verifyUrl });
  } catch (err) {
    console.error('[auth] Failed to send verification email:', err);
  }
}

export async function verifyEmail(token: string): Promise<void> {
  const user = token ? await prisma.user.findFirst({ where: { emailVerifyTokenHash: hashToken(token) } }) : null;
  if (!user) throw new AppError('Verification link invalid', 'הקישור אינו תקין או שכבר נעשה בו שימוש', 400);
  // Links mailed before expiry was recorded have no date and stay valid.
  if (user.emailVerifyExpiresAt && user.emailVerifyExpiresAt < new Date()) {
    throw new AppError('Verification link expired', 'תוקף הקישור פג. אפשר לשלוח קישור חדש מדף הפרופיל', 400);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null, emailVerifyExpiresAt: null },
  });
}

/**
 * Writes a new email address onto a user. A changed address is unverified
 * until its owner follows the link mailed to it.
 */
export async function changeEmail(userId: string, rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase();
  if (!isValidEmail(email)) throw new AppError('Invalid email address', 'כתובת אימייל לא תקינה', 400);
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (current?.email === email) return false;
  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken) throw new AppError('Email already in use', 'כתובת המייל הזו כבר בשימוש', 409);
  await prisma.user.update({
    where: { id: userId },
    data: { email, emailVerifiedAt: null, emailVerifyTokenHash: null },
  });
  return true;
}

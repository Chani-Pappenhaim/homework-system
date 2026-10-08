import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { User, Group } from '@prisma/client';
import { emailQueue } from '../infrastructure/queues/queues';
import { AppError } from '../utils/errors';
import { isValidEmail, normalizeGithubUsername } from '../utils/excel';
import { groupDisplayName, groupNameSelect } from '../utils/group-name';

export type UserDTO = {
  id: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  githubUsername: string | null;
  emailVerified: boolean;
  emailNotifications: boolean;
  groups: { id: string; name: string }[];
};

// A user loaded together with its group memberships. Students belong to one
// or more groups; teachers have none.
type UserWithGroups = User & {
  studentGroups?: { group: Pick<Group, 'id' | 'name' | 'seminar' | 'year'> }[];
};

const groupsInclude = {
  studentGroups: { include: { group: { select: { id: true, ...groupNameSelect } } } },
};

export function toUserDTO(user: UserWithGroups): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    githubUsername: user.githubUsername ?? null,
    emailVerified: Boolean(user.emailVerifiedAt),
    emailNotifications: user.emailNotifications,
    groups: user.studentGroups?.map((sg) => ({ id: sg.group.id, name: groupDisplayName(sg.group) })) ?? [],
  };
}

export async function loginWithPassword(email: string, password: string): Promise<UserWithGroups> {
  const user = await prisma.user.findUnique({ where: { email }, include: groupsInclude });
  if (!user) throw new AppError('Invalid credentials', 'אימייל או סיסמה שגויים', 401);
  if (!user.password) throw new AppError('Use OAuth to login', 'יש להתחבר עם הכניסה החברתית (OAuth)', 403);

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new AppError('Invalid credentials', 'אימייל או סיסמה שגויים', 401);

  return user;
}

export async function getUserById(id: string): Promise<UserWithGroups | null> {
  return prisma.user.findUnique({ where: { id }, include: groupsInclude });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new AppError('Password too short (min 6 chars)', 'הסיסמה החדשה קצרה מדי (מינימום 6 תווים)', 400);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.password) throw new AppError('Cannot change password', 'לא ניתן לשנות סיסמה לחשבון זה', 400);

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new AppError('Current password is wrong', 'הסיסמה הנוכחית שגויה', 401);

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed, mustChangePassword: false } });
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Always resolves successfully regardless of whether the email exists, so
 * this endpoint can't be used to enumerate registered emails.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const rawToken = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: { resetTokenHash: hashToken(rawToken), resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;
  try {
    await emailQueue.add('forgot-password-link', { email: user.email, name: user.name, resetUrl });
  } catch (err) {
    console.error('[auth] Failed to enqueue forgot-password-link email:', err);
  }
}

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
      data: { emailVerifyTokenHash: hashToken(rawToken) },
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
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null },
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

/** A user editing her own details on the profile page. */
export async function updateProfile(userId: string, data: {
  name?: string; email?: string; githubUsername?: string | null; emailNotifications?: boolean;
}): Promise<UserWithGroups> {
  const update: { name?: string; githubUsername?: string | null; emailNotifications?: boolean } = {};
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw new AppError('Name is required', 'יש להזין שם', 400);
    update.name = name;
  }
  if (data.githubUsername !== undefined) {
    update.githubUsername = data.githubUsername ? normalizeGithubUsername(data.githubUsername) || null : null;
  }
  if (data.emailNotifications !== undefined) update.emailNotifications = Boolean(data.emailNotifications);

  const emailChanged = data.email !== undefined && (await changeEmail(userId, String(data.email)));
  if (Object.keys(update).length > 0) await prisma.user.update({ where: { id: userId }, data: update });
  if (emailChanged) await sendEmailVerification(userId);

  return (await getUserById(userId))!;
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new AppError('Password too short (min 6 chars)', 'הסיסמה החדשה קצרה מדי (מינימום 6 תווים)', 400);

  const user = await prisma.user.findFirst({ where: { resetTokenHash: hashToken(token) } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    throw new AppError('Reset link invalid or expired', 'הקישור אינו תקין או שפג תוקפו', 400);
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, mustChangePassword: false, resetTokenHash: null, resetTokenExpiresAt: null },
  });
}

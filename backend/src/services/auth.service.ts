import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { User, Group } from '@prisma/client';
import { emailQueue } from '../infrastructure/queues/queues';
import { AppError } from '../utils/errors';
import { normalizeGithubUsername } from '../utils/excel';
import { groupDisplayName, groupNameSelect } from '../utils/group-name';
import { hashToken } from '../utils/token-hash';
import { changeEmail, sendEmailVerification } from './email-verification.service';

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

/**
 * Finds a user by email regardless of letter case or surrounding spaces —
 * an address typed with a capital letter on a phone keyboard is still hers.
 */
export async function findUserByEmail(rawEmail: unknown): Promise<UserWithGroups | null> {
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  if (!email) return null;
  return prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, include: groupsInclude });
}

export async function loginWithPassword(email: string, password: string): Promise<UserWithGroups> {
  if (typeof password !== 'string' || !password) {
    throw new AppError('Missing credentials', 'יש להזין אימייל וסיסמה', 400);
  }
  const user = await findUserByEmail(email);
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
  if (typeof newPassword !== 'string' || typeof currentPassword !== 'string') {
    throw new AppError('Missing password fields', 'יש להזין את הסיסמה הנוכחית והחדשה', 400);
  }
  if (newPassword.length < 6) throw new AppError('Password too short (min 6 chars)', 'הסיסמה החדשה קצרה מדי (מינימום 6 תווים)', 400);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.password) throw new AppError('Cannot change password', 'לא ניתן לשנות סיסמה לחשבון זה', 400);

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new AppError('Current password is wrong', 'הסיסמה הנוכחית שגויה', 401);

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed, mustChangePassword: false, tokenVersion: { increment: 1 } } });
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Always resolves successfully regardless of whether the email exists, so
 * this endpoint can't be used to enumerate registered emails.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findUserByEmail(email);
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
  if (typeof token !== 'string' || !token || typeof newPassword !== 'string') {
    throw new AppError('Missing reset fields', 'הקישור אינו תקין או שפג תוקפו', 400);
  }
  if (newPassword.length < 6) throw new AppError('Password too short (min 6 chars)', 'הסיסמה החדשה קצרה מדי (מינימום 6 תווים)', 400);

  const user = await prisma.user.findFirst({ where: { resetTokenHash: hashToken(token) } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    throw new AppError('Reset link invalid or expired', 'הקישור אינו תקין או שפג תוקפו', 400);
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, mustChangePassword: false, resetTokenHash: null, resetTokenExpiresAt: null, tokenVersion: { increment: 1 } },
  });
}

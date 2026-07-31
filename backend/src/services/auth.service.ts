import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { User, Group } from '@prisma/client';
import { emailQueue } from '../infrastructure/queues/queues';

export type UserDTO = {
  id: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  groups: { id: string; name: string }[];
};

// A user loaded together with its group memberships. Students belong to one or
// more groups; teachers have none.
type UserWithGroups = User & {
  studentGroups?: { group: Pick<Group, 'id' | 'name'> }[];
};

// Prisma include that attaches each student's groups (id + name only).
const groupsInclude = {
  studentGroups: { include: { group: { select: { id: true, name: true } } } },
};

export function toUserDTO(user: UserWithGroups): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    groups: user.studentGroups?.map((sg) => sg.group) ?? [],
  };
}

export async function loginWithPassword(email: string, password: string): Promise<UserWithGroups> {
  const user = await prisma.user.findUnique({ where: { email }, include: groupsInclude });
  if (!user) throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  if (!user.password) throw Object.assign(new Error('Use OAuth to login'), { status: 403 });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

  return user;
}

export async function getUserById(id: string): Promise<UserWithGroups | null> {
  return prisma.user.findUnique({ where: { id }, include: groupsInclude });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw Object.assign(new Error('Password too short (min 6 chars)'), { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.password) throw Object.assign(new Error('Cannot change password'), { status: 400 });

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw Object.assign(new Error('Current password is wrong'), { status: 401 });

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed, mustChangePassword: false } });
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Always resolves successfully regardless of whether the email exists — the
 * caller (controller) returns the same generic message either way, so this
 * endpoint can't be used to discover which emails are registered.
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

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw Object.assign(new Error('Password too short (min 6 chars)'), { status: 400 });

  const user = await prisma.user.findFirst({ where: { resetTokenHash: hashToken(token) } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    throw Object.assign(new Error('הקישור אינו תקין או שפג תוקפו'), { status: 400 });
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, mustChangePassword: false, resetTokenHash: null, resetTokenExpiresAt: null },
  });
}

import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { User } from '@prisma/client';

export type UserDTO = { id: string; name: string; email: string; role: string; mustChangePassword: boolean };

export function toUserDTO(user: User): UserDTO {
  return { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
}

export async function loginWithPassword(email: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  if (!user.password) throw Object.assign(new Error('Use OAuth to login'), { status: 403 });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

  return user;
}

export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
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

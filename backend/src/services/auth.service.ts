import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { User, Group } from '@prisma/client';

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

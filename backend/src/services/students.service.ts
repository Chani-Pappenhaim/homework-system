import { prisma } from '../config/prisma';

export async function findStudentByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email, role: 'STUDENT' },
    select: { id: true, name: true, email: true },
  });
}

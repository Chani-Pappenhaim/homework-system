import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: 'admin@school.com' } });
  if (existing) {
    console.log('Admin user already exists, skipping seed.');
    return;
  }

  const hashed = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.create({
    data: {
      name: 'מורה',
      email: 'admin@school.com',
      password: hashed,
      role: 'ADMIN',
      mustChangePassword: false,
    },
  });

  console.log(`Created admin user: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

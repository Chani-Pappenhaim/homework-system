const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    const group = await prisma.group.findFirst({ where: { name: { contains: 'יג' } } });
    if (!group) { console.log('קבוצה לא נמצאה'); return; }
    console.log('קבוצה:', group.id, group.name, 'נוצרה ב:', group.createdAt);
    const rows = await prisma.studentGroup.findMany({
      where: { groupId: group.id },
      include: { student: { select: { name: true, email: true, createdAt: true } } },
      orderBy: { student: { createdAt: 'asc' } },
    });
    console.log(`\n${rows.length} תלמידות בקבוצה, לפי תאריך יצירת החשבון:`);
    for (const r of rows) console.log(`  ${r.student.name} (${r.student.email}) — נוצר: ${r.student.createdAt.toISOString()}`);
  } catch (e) {
    console.error('שגיאה:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();

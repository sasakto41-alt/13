/**
 * Восстановление из JSON-копии (см. docs/BACKUP.md).
 * Запуск: npm run restore -- путь/к/backup.json
 * Восстанавливаются сотрудники, формы, ответы, отчёты, документы.
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Использование: npm run restore -- путь/к/backup.json');
    process.exit(1);
  }
  if (process.env.RESTORE_ALLOW !== 'true') {
    console.error('Восстановление перезаписывает данные. Для подтверждения задайте RESTORE_ALLOW=true.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let created = { employees: 0, forms: 0, submissions: 0, reports: 0, documents: 0 };

  for (const e of data.employees || []) {
    await prisma.employee.upsert({
      where: { id: e.id },
      create: { ...e },
      update: { fullName: e.fullName, role: e.role, status: e.status, rank: e.rank, division: e.division, gameId: e.gameId, discordTag: e.discordTag },
    });
    created.employees++;
  }
  for (const f of data.forms || []) {
    await prisma.form.upsert({
      where: { id: f.id },
      create: { ...f },
      update: { title: f.title, description: f.description, status: f.status, type: f.type, questions: f.questions },
    });
    created.forms++;
  }
  for (const s of data.submissions || []) {
    await prisma.formSubmission.upsert({
      where: { id: s.id },
      create: { ...s },
      update: { status: s.status },
    });
    created.submissions++;
  }
  for (const r of data.reports || []) {
    await prisma.report.upsert({ where: { id: r.id }, create: { ...r }, update: { title: r.title } });
    created.reports++;
  }
  for (const d of data.documents || []) {
    await prisma.document.upsert({ where: { id: d.id }, create: { ...d }, update: { title: d.title } });
    created.documents++;
  }

  console.log('Восстановлено:', created);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

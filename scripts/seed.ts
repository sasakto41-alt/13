/**
 * Демо-данные ТОЛЬКО для локальной разработки.
 * Запуск: SEED_ALLOW=true npm run seed
 * Никогда не выполняйте это на production-базе.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (process.env.SEED_ALLOW !== 'true') {
    console.error('Демо-данные можно добавить только с SEED_ALLOW=true. Для production используйте панель.');
    process.exit(1);
  }

  const count = await prisma.employee.count();
  if (count > 0) {
    console.log(`В базе уже ${count} сотрудников — сид пропущен.`);
    return;
  }

  const employees = [
    { fullName: 'Иван Гордеев', role: 'LEADER' as const, rank: 'Sheriff', division: 'Управление', gameId: '10001' },
    { fullName: 'Пётр Волков', role: 'DEPUTY' as const, rank: 'Undersheriff', division: 'Управление', gameId: '10002' },
    { fullName: 'Анна Соколова', role: 'CURATOR' as const, rank: 'Lieutenant', division: 'Патрульный отдел', gameId: '10003' },
    { fullName: 'Джон Смит', role: 'EMPLOYEE' as const, rank: 'Officer', division: 'Патрульный отдел', gameId: '10004' },
    { fullName: 'Майкл Росс', role: 'EMPLOYEE' as const, rank: 'Officer', division: 'Дорожный отдел', gameId: '10005' },
  ];

  for (const e of employees) {
    await prisma.employee.create({ data: e });
  }
  console.log(`Добавлено ${employees.length} демо-сотрудников (без логинов — доступ к панели только у лидера через первичную настройку).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

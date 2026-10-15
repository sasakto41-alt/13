import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, ah } from '../lib/httpError';
import { sendCsv } from '../lib/csv';

const router = Router();
router.use(requireAuth);

const employeeSelect = {
  id: true,
  fullName: true,
  login: true,
  role: true,
  rank: true,
  division: true,
  status: true,
  gameId: true,
  discordTag: true,
  hiredAt: true,
  firedAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

function parsePagination(req: any) {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 20)));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function buildWhere(req: any) {
  const where: any = {};
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || 'ALL');
  const division = String(req.query.division || '').trim();
  if (status !== 'ALL') where.status = status;
  if (division) where.division = division;
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { login: { contains: q, mode: 'insensitive' } },
      { gameId: { contains: q } },
      { discordTag: { contains: q, mode: 'insensitive' } },
      { rank: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

// Список + поиск
router.get(
  '/',
  requireRole('LEADER', 'DEPUTY', 'CURATOR'),
  ah(async (req, res) => {
    const where = buildWhere(req);
    const { page, pageSize, skip, take } = parsePagination(req);
    const [items, total] = await Promise.all([
      prisma.employee.findMany({ where, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], skip, take, select: employeeSelect }),
      prisma.employee.count({ where }),
    ]);
    const divisions = await prisma.employee.findMany({ distinct: ['division'], select: { division: true }, where: { division: { not: null } } });
    res.json({ items, total, page, pageSize, divisions: divisions.map((d) => d.division) });
  })
);

// Создание
const createSchema = z.object({
  fullName: z.string().min(2).max(64),
  login: z.string().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, 'Логин: латиница, цифры, . _ -').optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(['LEADER', 'DEPUTY', 'CURATOR', 'EMPLOYEE']).default('EMPLOYEE'),
  rank: z.string().max(64).optional(),
  division: z.string().max(64).optional(),
  gameId: z.string().max(32).optional(),
  discordTag: z.string().max(64).optional(),
  hiredAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

router.post(
  '/',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const data = createSchema.parse(req.body);
    if (data.role === 'LEADER' && req.user!.role !== 'LEADER') {
      throw badRequest('Только лидер может создавать аккаунты лидеров');
    }
    if (data.login && !data.password) throw badRequest('При задании логина нужен пароль (минимум 8 символов)');
    if (data.login) {
      const exists = await prisma.employee.findUnique({ where: { login: data.login } });
      if (exists) throw badRequest('Такой логин уже используется');
    }
    const employee = await prisma.employee.create({
      data: {
        fullName: data.fullName,
        login: data.login || null,
        passwordHash: data.password ? await bcrypt.hash(data.password, 10) : null,
        role: data.role,
        rank: data.rank || null,
        division: data.division || null,
        gameId: data.gameId || null,
        discordTag: data.discordTag || null,
        hiredAt: data.hiredAt ? new Date(data.hiredAt) : new Date(),
        notes: data.notes || null,
      },
      select: employeeSelect,
    });
    await audit(req, 'employees.create', 'Employee', employee.id, { fullName: employee.fullName, role: employee.role });
    res.status(201).json({ item: employee });
  })
);

// Детальная карточка: профиль + отчёты + ответы форм
router.get(
  '/:id',
  requireRole('LEADER', 'DEPUTY', 'CURATOR'),
  ah(async (req, res) => {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id }, select: employeeSelect });
    if (!employee) throw badRequest('Сотрудник не найден');
    const [reports, submissions, reportsTotal, submissionsTotal] = await Promise.all([
      prisma.report.findMany({ where: { employeeId: employee.id }, orderBy: { submittedAt: 'desc' }, take: 20 }),
      prisma.formSubmission.findMany({ where: { employeeId: employee.id }, orderBy: { receivedAt: 'desc' }, take: 20, include: { form: { select: { title: true } } } }),
      prisma.report.count({ where: { employeeId: employee.id } }),
      prisma.formSubmission.count({ where: { employeeId: employee.id } }),
    ]);
    res.json({ item: employee, reports, submissions, reportsTotal, submissionsTotal });
  })
);

// Редактирование
const updateSchema = createSchema.partial().omit({ password: true });

router.patch(
  '/:id',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const target = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!target) throw badRequest('Сотрудник не найден');
    if (target.role === 'LEADER' && req.user!.role !== 'LEADER') {
      throw badRequest('Только лидер может изменять аккаунты лидеров');
    }
    const data = updateSchema.parse(req.body);
    if (data.role === 'LEADER' && req.user!.role !== 'LEADER') {
      throw badRequest('Назначать роль лидера может только лидер');
    }
    if (data.login && data.login !== target.login) {
      const exists = await prisma.employee.findUnique({ where: { login: data.login } });
      if (exists) throw badRequest('Такой логин уже используется');
    }
    const employee = await prisma.employee.update({
      where: { id: target.id },
      data: {
        fullName: data.fullName,
        login: data.login === undefined ? undefined : data.login || null,
        role: data.role,
        rank: data.rank === undefined ? undefined : data.rank || null,
        division: data.division === undefined ? undefined : data.division || null,
        gameId: data.gameId === undefined ? undefined : data.gameId || null,
        discordTag: data.discordTag === undefined ? undefined : data.discordTag || null,
        status: undefined,
        notes: data.notes === undefined ? undefined : data.notes || null,
      },
      select: employeeSelect,
    });
    await audit(req, 'employees.update', 'Employee', employee.id, { fullName: employee.fullName });
    res.json({ item: employee });
  })
);

// Сброс пароля
router.post(
  '/:id/password',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const schema = z.object({ password: z.string().min(8).max(128) });
    const data = schema.parse(req.body);
    const target = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!target) throw badRequest('Сотрудник не найден');
    if (target.role === 'LEADER' && req.user!.role !== 'LEADER') {
      throw badRequest('Только лидер может менять пароли аккаунтов лидеров');
    }
    await prisma.employee.update({ where: { id: target.id }, data: { passwordHash: await bcrypt.hash(data.password, 10) } });
    await audit(req, 'employees.reset_password', 'Employee', target.id, { fullName: target.fullName });
    res.json({ ok: true });
  })
);

// Увольнение / восстановление
router.post(
  '/:id/fire',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const target = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!target) throw badRequest('Сотрудник не найден');
    if (target.role === 'LEADER' && target.id !== req.user!.uid) {
      throw badRequest('Нельзя уволить аккаунт лидера');
    }
    const employee = await prisma.employee.update({
      where: { id: target.id },
      data: { status: 'FIRED', firedAt: new Date() },
      select: employeeSelect,
    });
    await audit(req, 'employees.fire', 'Employee', target.id, { fullName: target.fullName });
    res.json({ item: employee });
  })
);

router.post(
  '/:id/restore',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE', firedAt: null },
      select: employeeSelect,
    });
    await audit(req, 'employees.restore', 'Employee', employee.id, { fullName: employee.fullName });
    res.json({ item: employee });
  })
);

// Экспорт CSV (UTF-8 BOM)
router.get(
  '/export.csv',
  requireRole('LEADER', 'DEPUTY', 'CURATOR'),
  ah(async (req, res) => {
    const where = buildWhere(req);
    const items = await prisma.employee.findMany({ where, orderBy: { createdAt: 'desc' } });
    const rows: (string | number | null)[][] = [
      ['ФИО', 'Логин', 'Роль', 'Звание', 'Подразделение', 'Статус', 'Игровой ID', 'Discord', 'Дата приёма', 'Дата увольнения'],
      ...items.map((e) => [
        e.fullName,
        e.login,
        e.role,
        e.rank,
        e.division,
        e.status,
        e.gameId,
        e.discordTag,
        e.hiredAt ? e.hiredAt.toISOString() : null,
        e.firedAt ? e.firedAt.toISOString() : null,
      ]),
    ];
    await audit(req, 'employees.export_csv');
    sendCsv(res, 'employees.csv', rows);
  })
);

export default router;

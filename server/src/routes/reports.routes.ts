import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, ah } from '../lib/httpError';
import { sendCsv } from '../lib/csv';

const router = Router();
router.use(requireAuth);

// Список отчётов
router.get(
  '/',
  ah(async (req, res) => {
    const where: any = {};
    if (req.query.employeeId) where.employeeId = String(req.query.employeeId);
    if (req.query.type && req.query.type !== 'ALL') where.type = String(req.query.type);
    if (req.query.mine === '1') where.employeeId = req.user!.uid;
    const days = Number(req.query.days || 0);
    if (days > 0) where.submittedAt = { gte: new Date(Date.now() - days * 86400000) };

    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 20)));
    const [items, total] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { employee: { select: { id: true, fullName: true, rank: true, division: true } } },
      }),
      prisma.report.count({ where }),
    ]);
    res.json({ items, total, page, pageSize });
  })
);

// Ручное добавление отчёта
const createSchema = z.object({
  employeeId: z.string().min(1),
  type: z.string().min(1).max(40).default('manual'),
  title: z.string().min(2).max(200),
  content: z.string().max(8000).optional(),
});

router.post(
  '/',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const data = createSchema.parse(req.body);
    const employee = await prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw badRequest('Сотрудник не найден');
    const report = await prisma.report.create({
      data: {
        employeeId: employee.id,
        type: data.type,
        title: data.title,
        content: data.content ? { text: data.content } : undefined,
        source: 'manual',
      },
      include: { employee: { select: { id: true, fullName: true, rank: true } } },
    });
    await audit(req, 'reports.create', 'Report', report.id, { employee: employee.fullName, title: data.title });
    res.status(201).json({ item: report });
  })
);

// Сотрудники без отчётов за период (метка «Отчёт отсутствует»)
router.get(
  '/missing',
  requireRole('LEADER', 'DEPUTY', 'CURATOR'),
  ah(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days || 7)));
    const since = new Date(Date.now() - days * 86400000);
    const active = await prisma.employee.findMany({
      where: { status: { not: 'FIRED' } },
      select: { id: true, fullName: true, rank: true, division: true, hiredAt: true },
    });
    const withReports = await prisma.report.findMany({
      where: { submittedAt: { gte: since }, employeeId: { not: null } },
      select: { employeeId: true },
    });
    const have = new Set(withReports.map((r) => r.employeeId));
    const missing = active.filter((e) => !have.has(e.id));
    res.json({ days, items: missing });
  })
);

// Статистика отчётов по сотрудникам за период
router.get(
  '/stats',
  requireRole('LEADER', 'DEPUTY', 'CURATOR'),
  ah(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days || 30)));
    const since = new Date(Date.now() - days * 86400000);
    const reports = await prisma.report.findMany({
      where: { submittedAt: { gte: since }, employeeId: { not: null } },
      select: { employeeId: true, submittedAt: true },
    });
    const byEmployee = new Map<string, number>();
    for (const r of reports) {
      byEmployee.set(r.employeeId!, (byEmployee.get(r.employeeId!) || 0) + 1);
    }
    const employees = await prisma.employee.findMany({
      where: { status: { not: 'FIRED' } },
      select: { id: true, fullName: true, rank: true, division: true },
    });
    const items = employees
      .map((e) => ({ ...e, reportsCount: byEmployee.get(e.id) || 0 }))
      .sort((a, b) => b.reportsCount - a.reportsCount);
    res.json({ days, items });
  })
);

// Экспорт CSV
router.get(
  '/export.csv',
  ah(async (req, res) => {
    const where: any = {};
    if (req.query.employeeId) where.employeeId = String(req.query.employeeId);
    if (req.query.mine === '1') where.employeeId = req.user!.uid;
    const days = Number(req.query.days || 0);
    if (days > 0) where.submittedAt = { gte: new Date(Date.now() - days * 86400000) };
    const items = await prisma.report.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      include: { employee: { select: { fullName: true } } },
    });
    const rows: (string | number | null)[][] = [
      ['Дата', 'Сотрудник', 'Тип', 'Заголовок', 'Источник', 'Содержание'],
      ...items.map((r) => [
        r.submittedAt.toISOString(),
        r.employee?.fullName || null,
        r.type,
        r.title,
        r.source,
        (r.content as any)?.text || (Array.isArray(r.content) ? (r.content as any[]).map((a) => `${a?.question}: ${a?.answer}`).join(' | ') : ''),
      ]),
    ];
    await audit(req, 'reports.export_csv');
    sendCsv(res, 'reports.csv', rows);
  })
);

export default router;

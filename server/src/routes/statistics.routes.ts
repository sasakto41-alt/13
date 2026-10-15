import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import { notConfigured, ah } from '../lib/httpError';
import { enqueueDiscord } from '../lib/delivery';
import { buildWebhookPayload } from '../lib/discord';
import { maskWebhookUrl } from '../lib/mask';
import { encryptSecret } from '../lib/crypto';
import { daySeries, isoDay } from '../lib/csv';
import { env } from '../config/env';

const router = Router();
router.use(requireAuth);

/**
 * Вся статистика строится ТОЛЬКО из реальных данных БД (FormSubmission, Report,
 * Employee, DeliveryJob). Никаких фиктивных значений.
 */

router.get(
  '/',
  ah(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days || 30)));
    const since = new Date(Date.now() - days * 86400000);

    const [submissions, reports, employeesActive, employeesTotal, byDivision, deliveryGroups, formsWithCounts, missingReports] =
      await Promise.all([
        prisma.formSubmission.findMany({
          where: { receivedAt: { gte: since } },
          select: { receivedAt: true, status: true, formId: true },
        }),
        prisma.report.findMany({
          where: { submittedAt: { gte: since } },
          select: { submittedAt: true, employeeId: true },
        }),
        prisma.employee.count({ where: { status: 'ACTIVE' } }),
        prisma.employee.count(),
        prisma.employee.groupBy({ by: ['division'], _count: { _all: true }, where: { status: 'ACTIVE' } }),
        prisma.deliveryJob.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.form.findMany({
          where: { status: { not: 'ARCHIVED' } },
          select: { id: true, title: true, type: true, status: true, _count: { select: { submissions: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.employee.count({ where: { status: 'ACTIVE' } }),
      ]);

    // По дням (в таймзоне панели)
    const series = daySeries(days, env.statsTz);
    const submissionsByDay = series.map((day) => ({ day, count: 0 }));
    const reportsByDay = series.map((day) => ({ day, count: 0 }));
    const dayIndex = new Map(series.map((d, i) => [d, i]));

    const statusCounts: Record<string, number> = { NEW: 0, NOTIFIED: 0, NO_EMPLOYEE: 0, NO_FORM: 0, FAILED: 0 };
    for (const s of submissions) {
      const idx = dayIndex.get(isoDay(s.receivedAt, env.statsTz));
      if (idx !== undefined) submissionsByDay[idx].count++;
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    }
    for (const r of reports) {
      const idx = dayIndex.get(isoDay(r.submittedAt, env.statsTz));
      if (idx !== undefined) reportsByDay[idx].count++;
    }

    // Топ активных сотрудников за период
    const reportCountByEmp = new Map<string, number>();
    for (const r of reports) {
      if (r.employeeId) reportCountByEmp.set(r.employeeId, (reportCountByEmp.get(r.employeeId) || 0) + 1);
    }
    const subCountByEmp = new Map<string, number>();
    const subs = await prisma.formSubmission.findMany({
      where: { receivedAt: { gte: since }, employeeId: { not: null } },
      select: { employeeId: true },
    });
    for (const s of subs) subCountByEmp.set(s.employeeId!, (subCountByEmp.get(s.employeeId!) || 0) + 1);
    const topEmployees = await prisma.employee.findMany({
      where: { id: { in: [...new Set([...reportCountByEmp.keys(), ...subCountByEmp.keys()])] } },
      select: { id: true, fullName: true, rank: true, division: true },
    });
    const top = topEmployees
      .map((e) => ({ ...e, reports: reportCountByEmp.get(e.id) || 0, submissions: subCountByEmp.get(e.id) || 0 }))
      .sort((a, b) => b.reports + b.submissions - (a.reports + a.submissions))
      .slice(0, 5);

    // Активные без отчётов за период
    const activeEmployees = await prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, rank: true, division: true },
    });
    const withReport = new Set(reports.map((r) => r.employeeId));
    const withoutReports = activeEmployees.filter((e) => !withReport.has(e.id)).slice(0, 50);

    const delivery = { delivered: 0, pending: 0, failed: 0, dead: 0 };
    for (const g of deliveryGroups) {
      if (g.status === 'DELIVERED') delivery.delivered = g._count._all;
      if (g.status === 'PENDING' || g.status === 'SENDING') delivery.pending += g._count._all;
      if (g.status === 'FAILED') delivery.failed = g._count._all;
      if (g.status === 'DEAD') delivery.dead = g._count._all;
    }

    res.json({
      days,
      totals: {
        submissions: submissions.length,
        reports: reports.length,
        employeesActive: employeesActive,
        employeesTotal: employeesTotal,
      },
      submissionsByDay,
      reportsByDay,
      statusCounts,
      byDivision: byDivision.map((d) => ({ division: d.division || 'Без подразделения', count: d._count._all })),
      forms: formsWithCounts.slice(0, 10).map((f) => ({ id: f.id, title: f.title, type: f.type, status: f.status, submissions: f._count.submissions })),
      topEmployees: top,
      withoutReports,
      delivery,
    });
  })
);

// Публикация статистики в Discord (реальные данные, глобальный вебхук статистики)
router.post(
  '/publish',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.body?.days || 7)));
    const since = new Date(Date.now() - days * 86400000);
    const [submissions, reports, active, deliveryOk, deliveryFail] = await Promise.all([
      prisma.formSubmission.count({ where: { receivedAt: { gte: since } } }),
      prisma.report.count({ where: { submittedAt: { gte: since } } }),
      prisma.employee.count({ where: { status: 'ACTIVE' } }),
      prisma.deliveryJob.count({ where: { status: 'DELIVERED', createdAt: { gte: since } } }),
      prisma.deliveryJob.count({ where: { status: { in: ['DEAD', 'FAILED'] }, createdAt: { gte: since } } }),
    ]);

    const target = env.discord.stats;
    if (!target) throw notConfigured('DISCORD_STATS_WEBHOOK_URL не настроен на сервере (Railway → Variables)');

    const payload = buildWebhookPayload(
      {
        title: `Статистика Sheriff Department — ${days} дн.`,
        footer: 'Сформировано панелью управления по реальным данным',
        timestamp: true,
      },
      [
        { name: 'Активные сотрудники', value: String(active) },
        { name: 'Ответов форм', value: String(submissions) },
        { name: 'Отчётов сдано', value: String(reports) },
        { name: 'Доставка в Discord', value: `${deliveryOk} успешно / ${deliveryFail} с ошибками` },
      ]
    );

    const { duplicate } = await enqueueDiscord({
      targetUrl: encryptSecret(target) as string,
      payload,
      dedupeKey: `stats:${isoDay(new Date(), env.statsTz)}:${Math.floor(Date.now() / 60000)}`,
      maskedUrl: maskWebhookUrl(target),
    });
    await audit(req, 'statistics.publish', undefined, undefined, { days, duplicate });
    res.json({ ok: true, duplicate });
  })
);

export default router;

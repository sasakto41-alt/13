import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, ah } from '../lib/httpError';

const router = Router();
router.use(requireAuth, requireRole('LEADER', 'DEPUTY'));

// Очередь доставки (URL вебхуков — только маскированные)
router.get(
  '/',
  async (req, res, next) => {
    try {
      const where: any = {};
      if (req.query.status && req.query.status !== 'ALL') where.status = String(req.query.status);
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 30)));
      const [items, total, counts] = await Promise.all([
        prisma.deliveryJob.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            kind: true,
            status: true,
            attempts: true,
            maxAttempts: true,
            lastError: true,
            nextAttemptAt: true,
            targetUrlMasked: true,
            dedupeKey: true,
            relatedSubmissionId: true,
            deliveredAt: true,
            createdAt: true,
          },
        }),
        prisma.deliveryJob.count({ where }),
        prisma.deliveryJob.groupBy({ by: ['status'], _count: { _all: true } }),
      ]);
      const byStatus: Record<string, number> = {};
      for (const g of counts) byStatus[g.status] = g._count._all;
      res.json({ items, total, page, pageSize, byStatus });
    } catch (e) {
      next(e);
    }
  }
);

// Ручная переотправка: сброс счётчика попыток и статуса
router.post(
  '/:id/retry',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const job = await prisma.deliveryJob.findUnique({ where: { id: req.params.id } });
    if (!job) throw badRequest('Задача не найдена');
    if (job.status === 'DELIVERED') throw badRequest('Задача уже доставлена');
    const updated = await prisma.deliveryJob.update({
      where: { id: job.id },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
    await audit(req, 'delivery.retry', 'DeliveryJob', job.id, { dedupeKey: job.dedupeKey });
    res.json({ item: { id: updated.id, status: updated.status } });
  })
);

// Отмена задачи
router.post(
  '/:id/cancel',
  requireRole('LEADER'),
  ah(async (req, res) => {
    const job = await prisma.deliveryJob.findUnique({ where: { id: req.params.id } });
    if (!job) throw badRequest('Задача не найдена');
    await prisma.deliveryJob.update({ where: { id: job.id }, data: { status: 'DEAD', lastError: 'Отменено вручную' } });
    await audit(req, 'delivery.cancel', 'DeliveryJob', job.id, { dedupeKey: job.dedupeKey });
    res.json({ ok: true });
  })
);

export default router;

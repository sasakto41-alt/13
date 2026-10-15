import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('LEADER'));

// Журнал действий (только лидер; секреты в details маскируются при записи)
router.get(
  '/',
  async (req, res, next) => {
    try {
      const where: any = {};
      const action = String(req.query.action || '').trim();
      const actor = String(req.query.actor || '').trim();
      const days = Number(req.query.days || 30);
      if (action) where.action = { contains: action, mode: 'insensitive' };
      if (actor) where.actorLogin = { contains: actor, mode: 'insensitive' };
      if (days > 0) where.createdAt = { gte: new Date(Date.now() - days * 86400000) };

      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 30)));
      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.auditLog.count({ where }),
      ]);
      res.json({ items, total, page, pageSize });
    } catch (e) {
      next(e);
    }
  }
);

export default router;

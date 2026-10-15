import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { unpackJson } from '../lib/jsonField';

const router = Router();
router.use(requireAuth, requireRole('LEADER'));

// Журнал действий (только лидер; секреты в details маскируются при записи)
router.get(
  '/',
  async (req, res, next) => {
    try {
      const action = String(req.query.action || '').trim();
      const actor = String(req.query.actor || '').trim();
      const days = Number(req.query.days || 30);
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 30)));

      const since = days > 0 ? { gte: new Date(Date.now() - days * 86400000) } : undefined;

      let items: any[];
      let total: number;

      if (action || actor) {
        // SQLite не поддерживает регистронезависимый contains для кириллицы —
        // при фильтре загружаем период целиком и фильтруем в JS.
        const all = await prisma.auditLog.findMany({
          where: since ? { createdAt: since } : {},
          orderBy: { createdAt: 'desc' },
        });
        const filtered = all.filter((row) => {
          if (action && !row.action.toLowerCase().includes(action.toLowerCase())) return false;
          if (actor && !(row.actorLogin || '').toLowerCase().includes(actor.toLowerCase())) return false;
          return true;
        });
        total = filtered.length;
        items = filtered.slice((page - 1) * pageSize, page * pageSize);
      } else {
        const where: any = {};
        if (since) where.createdAt = since;
        [items, total] = await Promise.all([
          prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          prisma.auditLog.count({ where }),
        ]);
      }

      res.json({
        items: items.map((i) => ({ ...i, details: unpackJson<any>(i.details, null) })),
        total,
        page,
        pageSize,
      });
    } catch (e) {
      next(e);
    }
  }
);

export default router;

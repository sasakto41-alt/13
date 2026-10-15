import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, ah } from '../lib/httpError';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  ah(async (req, res) => {
    const unreadOnly = req.query.unread === '1';
    const items = await prisma.notification.findMany({
      where: unreadOnly ? { isRead: false } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unreadCount = await prisma.notification.count({ where: { isRead: false } });
    res.json({ items, unreadCount });
  })
);

router.post(
  '/:id/read',
  ah(async (req, res) => {
    const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!existing) throw badRequest('Уведомление не найдено');
    await prisma.notification.update({ where: { id: existing.id }, data: { isRead: true } });
    res.json({ ok: true });
  })
);

router.post(
  '/read-all',
  ah(async (req, res) => {
    await prisma.notification.updateMany({ data: { isRead: true } });
    await audit(req, 'notifications.read_all');
    res.json({ ok: true });
  })
);

export default router;

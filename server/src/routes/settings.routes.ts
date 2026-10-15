import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env, warnIfMisconfigured } from '../config/env';
import { requireAuth, requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import { ah } from '../lib/httpError';
import { googleConfigured, credentialsEmail } from '../lib/google';
import { maskWebhookUrl } from '../lib/mask';

const router = Router();
router.use(requireAuth);

/** Диагностика сервисов: что настроено, что нет. Секреты — только масками. */
router.get(
  '/',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const panelUrlRow = await prisma.appSetting.findUnique({ where: { key: 'panelUrl' } });
    const lastDelivery = await prisma.deliveryJob.findFirst({
      where: { status: 'DELIVERED' },
      orderBy: { deliveredAt: 'desc' },
      select: { deliveredAt: true },
    });
    const lastBackup = await prisma.appSetting.findUnique({ where: { key: 'backup.lastRunDay' } });

    const webhooks = {
      applications: maskWebhookUrl(env.discord.applications),
      reports: maskWebhookUrl(env.discord.reports),
      tech: maskWebhookUrl(env.discord.tech),
      stats: maskWebhookUrl(env.discord.stats),
      backup: maskWebhookUrl(env.discord.backup),
    };

    // Фиксация статуса интеграций в БД (модель Integration)
    const anyWebhook = Object.values(env.discord).some(Boolean);
    await Promise.all([
      prisma.integration.upsert({
        where: { kind: 'google' },
        create: { kind: 'google', status: googleConfigured() ? 'configured' : 'not_configured', details: { email: credentialsEmail() }, lastCheckedAt: new Date() },
        update: { status: googleConfigured() ? 'configured' : 'not_configured', details: { email: credentialsEmail() }, lastCheckedAt: new Date() },
      }),
      prisma.integration.upsert({
        where: { kind: 'discord' },
        create: { kind: 'discord', status: anyWebhook ? 'configured' : 'not_configured', lastCheckedAt: new Date() },
        update: { status: anyWebhook ? 'configured' : 'not_configured', lastCheckedAt: new Date() },
      }),
      prisma.integration.upsert({
        where: { kind: 'apps_script' },
        create: { kind: 'apps_script', status: env.sharedSecret ? 'configured' : 'not_configured', lastCheckedAt: new Date() },
        update: { status: env.sharedSecret ? 'configured' : 'not_configured', lastCheckedAt: new Date() },
      }),
    ]);

    res.json({
      google: {
        configured: googleConfigured(),
        serviceAccount: credentialsEmail(),
      },
      appsScript: {
        configured: Boolean(env.sharedSecret),
      },
      discord: {
        webhooks,
        anyConfigured: anyWebhook,
      },
      panelUrl: panelUrlRow ? String((panelUrlRow.value as any)?.url || '') : '',
      lastDeliveryAt: lastDelivery?.deliveredAt || null,
      lastBackupDay: lastBackup ? String((lastBackup.value as any)?.day || '') : null,
      warnings: warnIfMisconfigured(),
      cookieSecure: env.cookieSecure,
      statsTz: env.statsTz,
    });
  })
);

const panelUrlSchema = z.object({ url: z.string().url().max(300) });

router.put(
  '/panel-url',
  requireRole('LEADER'),
  ah(async (req, res) => {
    const data = panelUrlSchema.parse(req.body);
    if (!data.url.startsWith('https://')) {
      return res.status(400).json({ error: 'BAD_URL', message: 'Адрес панели должен начинаться с https://' });
    }
    await prisma.appSetting.upsert({
      where: { key: 'panelUrl' },
      create: { key: 'panelUrl', value: { url: data.url } as any },
      update: { value: { url: data.url } as any },
    });
    await audit(req, 'settings.panel_url', undefined, undefined, { url: data.url });
    res.json({ ok: true, url: data.url });
  })
);

export default router;

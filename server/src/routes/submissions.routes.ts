import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, notConfigured, ah } from '../lib/httpError';
import { enqueueDiscord } from '../lib/delivery';
import { buildWebhookPayload, EmbedField } from '../lib/discord';
import { maskWebhookUrl } from '../lib/mask';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { sendCsv } from '../lib/csv';
import { unpackJson } from '../lib/jsonField';
import { env } from '../config/env';

const router = Router();
router.use(requireAuth);

function parsePagination(req: any) {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 20)));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function normalizeAnswer(v: any): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Список ответов
router.get(
  '/',
  ah(async (req, res) => {
    const where: any = {};
    if (req.query.formId) where.formId = String(req.query.formId);
    if (req.query.status && req.query.status !== 'ALL') where.status = String(req.query.status);
    if (req.query.employeeId) where.employeeId = String(req.query.employeeId);
    const days = Number(req.query.days || 0);
    if (days > 0) where.receivedAt = { gte: new Date(Date.now() - days * 86400000) };

    const { page, pageSize, skip, take } = parsePagination(req);
    const [rawItems, total] = await Promise.all([
      prisma.formSubmission.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip,
        take,
        include: {
          form: { select: { id: true, title: true, type: true } },
          employee: { select: { id: true, fullName: true, rank: true } },
        },
      }),
      prisma.formSubmission.count({ where }),
    ]);
    const items = rawItems.map((s) => ({
      ...s,
      answers: unpackJson<any[]>(s.answers, []),
      meta: unpackJson<any>(s.meta, null),
    }));
    res.json({ items, total, page, pageSize });
  })
);

// Экспорт CSV (UTF-8 BOM) — ВАЖНО: объявлен ДО /:id, иначе перехватывается деталями ответа
router.get(
  '/export.csv',
  ah(async (req, res) => {
    const where: any = {};
    if (req.query.formId) where.formId = String(req.query.formId);
    if (req.query.status && req.query.status !== 'ALL') where.status = String(req.query.status);
    const days = Number(req.query.days || 0);
    if (days > 0) where.receivedAt = { gte: new Date(Date.now() - days * 86400000) };

    const items = await prisma.formSubmission.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      include: { form: { select: { title: true } }, employee: { select: { fullName: true } } },
    });
    const rows: (string | number | null)[][] = [
      ['Дата', 'Форма', 'Сотрудник', 'Статус', 'Ответы'],
      ...items.map((s) => [
        s.receivedAt.toISOString(),
        s.form?.title || 'Форма не найдена',
        s.employee?.fullName || null,
        s.status,
        unpackJson<any[]>(s.answers, []).map((a) => `${a?.question}: ${normalizeAnswer(a?.answer)}`).join(' | '),
      ]),
    ];
    await audit(req, 'submissions.export_csv');
    sendCsv(res, 'submissions.csv', rows);
  })
);

// Детали ответа
router.get(
  '/:id',
  ah(async (req, res) => {
    const item = await prisma.formSubmission.findUnique({
      where: { id: req.params.id },
      include: {
        form: { select: { id: true, title: true, type: true } },
        employee: { select: { id: true, fullName: true, rank: true, division: true } },
        deliveryJobs: { select: { id: true, status: true, attempts: true, lastError: true, targetUrlMasked: true, deliveredAt: true } },
      },
    });
    if (!item) throw badRequest('Ответ не найден');
    res.json({
      item: {
        ...item,
        answers: unpackJson<any[]>(item.answers, []),
        meta: unpackJson<any>(item.meta, null),
      },
    });
  })
);

// Ручная повторная отправка ответа в Discord
router.post(
  '/:id/resend',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const submission = await prisma.formSubmission.findUnique({
      where: { id: req.params.id },
      include: { form: true },
    });
    if (!submission) throw badRequest('Ответ не найден');

    const target =
      (submission.form ? decryptSecret((submission.form as any).webhookUrlEnc) : null) || env.discord.applications;
    if (!target) throw notConfigured('Вебхук не задан ни у формы, ни глобально (DISCORD_APPLICATIONS_WEBHOOK_URL)');

    const raw = unpackJson<any[]>(submission.answers, []);
    const fields: EmbedField[] = raw.map((a) => ({ name: String(a?.question || 'Вопрос'), value: normalizeAnswer(a?.answer) }));
    if (!submission.employeeId) {
      fields.push({ name: 'Сопоставление', value: 'Сотрудник не найден' });
    }

    const form = submission.form;
    const payload = buildWebhookPayload(
      {
        username: form?.webhookUsername,
        avatarUrl: form?.webhookAvatarUrl,
        content: form ? [form.webhookMention, form.webhookContent].filter(Boolean).join(' ') : undefined,
        title: form?.webhookTitle || form?.title || 'Повторная отправка ответа',
        color: form?.webhookColor,
        footer: form?.webhookFooter || 'Повторная отправка из панели Sheriff Department',
        timestamp: form ? form.webhookTimestamp : true,
      },
      fields
    );

    const { duplicate } = await enqueueDiscord({
      targetUrl: encryptSecret(target) as string,
      payload,
      dedupeKey: `submission:${submission.id}:resend:${Date.now()}`,
      relatedSubmissionId: submission.id,
      maskedUrl: maskWebhookUrl(target),
    });

    await prisma.formSubmission.update({ where: { id: submission.id }, data: { status: 'NEW' } });
    await audit(req, 'submissions.resend', 'FormSubmission', submission.id);
    res.json({ ok: true, duplicate });
  })
);

export default router;

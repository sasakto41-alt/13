import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, notConfigured, ah } from '../lib/httpError';
import { encryptSecret, decryptSecret, isEncrypted } from '../lib/crypto';
import { maskWebhookUrl } from '../lib/mask';
import { sendWebhook, buildWebhookPayload, isValidWebhookUrl } from '../lib/discord';
import { googleConfigured, createGoogleForm, QuestionDef } from '../lib/google';
import { env } from '../config/env';
import { renderAppsScriptTemplate } from '../lib/appsScriptTemplate';
import { packJson, unpackJson } from '../lib/jsonField';

const router = Router();
router.use(requireAuth);

const questionSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['PARAGRAPH', 'MULTIPLE_CHOICE']),
  options: z.array(z.string().max(120)).max(12).optional(),
  required: z.boolean().optional(),
});

const webhookSchema = z.object({
  webhookEnabled: z.boolean().default(true),
  webhookUsername: z.string().max(80).optional().nullable(),
  webhookAvatarUrl: z.string().max(500).optional().nullable(),
  webhookContent: z.string().max(1500).optional().nullable(),
  webhookTitle: z.string().max(200).optional().nullable(),
  webhookColor: z.number().int().min(0).max(0xffffff).optional().nullable(),
  webhookFooter: z.string().max(200).optional().nullable(),
  webhookTimestamp: z.boolean().default(true),
  webhookMention: z.enum(['', '@everyone', '@here']).optional().nullable(),
});

const formSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(1000).optional().nullable(),
  type: z.enum(['APPLICATION', 'REPORT', 'OTHER']).default('APPLICATION'),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
  googleFormUrl: z.string().max(500).optional().nullable(),
  questions: z.array(questionSchema).max(30).default([]),
  webhookUrl: z.string().max(500).optional().nullable(), // новое значение / null = очистить / отсутствует = не менять
});

function webhookData(b: z.infer<typeof webhookSchema>) {
  return {
    webhookEnabled: b.webhookEnabled,
    webhookUsername: b.webhookUsername || null,
    webhookAvatarUrl: b.webhookAvatarUrl || null,
    webhookContent: b.webhookContent || null,
    webhookTitle: b.webhookTitle || null,
    webhookColor: b.webhookColor ?? null,
    webhookFooter: b.webhookFooter || null,
    webhookTimestamp: b.webhookTimestamp,
    webhookMention: b.webhookMention || null,
  };
}

/** Публичное представление формы: без секретов, URL вебхука — только маска */
function publicForm(f: any) {
  const url = decryptSecret(f.webhookUrlEnc);
  return {
    id: f.id,
    title: f.title,
    description: f.description,
    type: f.type,
    status: f.status,
    formKey: f.formKey,
    googleFormId: f.googleFormId,
    googleFormUrl: f.googleFormUrl,
    questions: unpackJson<any[]>(f.questions, []),
    webhook: {
      enabled: f.webhookEnabled,
      hasCustomUrl: Boolean(f.webhookUrlEnc),
      urlMasked: maskWebhookUrl(url),
      username: f.webhookUsername,
      avatarUrl: f.webhookAvatarUrl,
      content: f.webhookContent,
      title: f.webhookTitle,
      color: f.webhookColor,
      footer: f.webhookFooter,
      timestamp: f.webhookTimestamp,
      mention: f.webhookMention,
    },
    createdBy: f.createdBy,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    _count: f._count,
  };
}

// Список форм
router.get(
  '/',
  ah(async (req, res) => {
    const forms = await prisma.form.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { submissions: true } } },
    });
    res.json({ items: forms.map(publicForm) });
  })
);

// Одна форма
router.get(
  '/:id',
  ah(async (req, res) => {
    const form = await prisma.form.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { submissions: true } } },
    });
    if (!form) throw badRequest('Форма не найдена');
    res.json({ item: publicForm(form) });
  })
);

// Создание формы (с настройками вебхука)
router.post(
  '/',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const body = formSchema.parse(req.body);
    const wh = webhookSchema.parse(req.body.webhook || {});
    if (body.webhookUrl && !isValidWebhookUrl(body.webhookUrl)) {
      throw badRequest('URL вебхука должен начинаться с https://');
    }
    const form = await prisma.form.create({
      data: {
        title: body.title,
        description: body.description || null,
        type: body.type,
        status: body.status,
        googleFormUrl: body.googleFormUrl || null,
        questions: packJson(body.questions || []),
        formKey: `F-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        webhookUrlEnc: encryptSecret(body.webhookUrl || null),
        ...webhookData(wh),
        createdBy: req.user!.login,
      },
      include: { _count: { select: { submissions: true } } },
    });
    await audit(req, 'forms.create', 'Form', form.id, { title: form.title, type: form.type, webhookCustom: Boolean(body.webhookUrl) });
    res.status(201).json({ item: publicForm(form) });
  })
);

// Редактирование формы (в т.ч. настройки вебхука)
router.patch(
  '/:id',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const form = await prisma.form.findUnique({ where: { id: req.params.id } });
    if (!form) throw badRequest('Форма не найдена');

    const body = formSchema.partial().parse(req.body);
    const wh = req.body.webhook ? webhookSchema.partial().parse(req.body.webhook) : undefined;

    const data: any = {
      title: body.title,
      description: body.description === undefined ? undefined : body.description || null,
      type: body.type,
      status: body.status,
      googleFormUrl: body.googleFormUrl === undefined ? undefined : body.googleFormUrl || null,
      questions: body.questions === undefined ? undefined : packJson(body.questions),
    };

    if (body.webhookUrl !== undefined) {
      if (body.webhookUrl === null || body.webhookUrl === '') {
        data.webhookUrlEnc = null; // явная очистка
      } else {
        if (!isValidWebhookUrl(body.webhookUrl)) throw badRequest('URL вебхука должен начинаться с https://');
        data.webhookUrlEnc = encryptSecret(body.webhookUrl);
      }
    }
    if (wh) {
      if (wh.webhookEnabled !== undefined) data.webhookEnabled = wh.webhookEnabled;
      if (wh.webhookUsername !== undefined) data.webhookUsername = wh.webhookUsername || null;
      if (wh.webhookAvatarUrl !== undefined) data.webhookAvatarUrl = wh.webhookAvatarUrl || null;
      if (wh.webhookContent !== undefined) data.webhookContent = wh.webhookContent || null;
      if (wh.webhookTitle !== undefined) data.webhookTitle = wh.webhookTitle || null;
      if (wh.webhookColor !== undefined) data.webhookColor = wh.webhookColor;
      if (wh.webhookFooter !== undefined) data.webhookFooter = wh.webhookFooter || null;
      if (wh.webhookTimestamp !== undefined) data.webhookTimestamp = wh.webhookTimestamp;
      if (wh.webhookMention !== undefined) data.webhookMention = wh.webhookMention || null;
    }

    const updated = await prisma.form.update({
      where: { id: form.id },
      data,
      include: { _count: { select: { submissions: true } } },
    });
    await audit(req, 'forms.update', 'Form', form.id, { title: updated.title, webhookChanged: Boolean(wh) || body.webhookUrl !== undefined });
    res.json({ item: publicForm(updated) });
  })
);

// Удаление: если есть ответы — архивация, иначе полное удаление
router.delete(
  '/:id',
  requireRole('LEADER'),
  ah(async (req, res) => {
    const form = await prisma.form.findUnique({ where: { id: req.params.id }, include: { _count: { select: { submissions: true } } } });
    if (!form) throw badRequest('Форма не найдена');
    if (form._count.submissions > 0) {
      await prisma.form.update({ where: { id: form.id }, data: { status: 'ARCHIVED' } });
      await audit(req, 'forms.archive', 'Form', form.id, { title: form.title });
      return res.json({ archived: true });
    }
    await prisma.form.delete({ where: { id: form.id } });
    await audit(req, 'forms.delete', 'Form', form.id, { title: form.title });
    res.json({ deleted: true });
  })
);

// Тест вебхука формы (пер-формный, иначе глобальный для заявок)
router.post(
  '/:id/test-webhook',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const form = await prisma.form.findUnique({ where: { id: req.params.id } });
    if (!form) throw badRequest('Форма не найдена');
    const target = decryptSecret(form.webhookUrlEnc) || env.discord.applications;
    if (!target) {
      throw notConfigured('Вебхук не задан ни у формы, ни глобально (DISCORD_APPLICATIONS_WEBHOOK_URL)');
    }
    const payload = buildWebhookPayload(
      {
        username: form.webhookUsername,
        avatarUrl: form.webhookAvatarUrl,
        content: form.webhookMention,
        title: form.webhookTitle || `Проверка вебхука: ${form.title}`,
        color: form.webhookColor,
        footer: form.webhookFooter || 'Тестовое сообщение из панели Sheriff Department',
        timestamp: form.webhookTimestamp,
      },
      [
        { name: 'Форма', value: form.title },
        { name: 'Статус', value: 'Если вы видите это сообщение — вебхук работает' },
      ]
    );
    const result = await sendWebhook(target, payload);
    await audit(req, 'forms.test_webhook', 'Form', form.id, { ok: result.ok, error: result.error });
    res.json({ ok: result.ok, error: result.error || null, targetMasked: maskWebhookUrl(target) });
  })
);

// Создание НАСТОЯЩЕЙ Google Form через Forms API (по вопросам из конструктора)
router.post(
  '/:id/create-google-form',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const form = await prisma.form.findUnique({ where: { id: req.params.id } });
    if (!form) throw badRequest('Форма не найдена');
    if (!googleConfigured()) {
      throw notConfigured('Google API не настроено (GOOGLE_SERVICE_ACCOUNT_JSON). См. docs/GOOGLE-API.md');
    }
    const questions = unpackJson<QuestionDef[]>(form.questions, []);
    if (!questions.length) throw badRequest('Добавьте хотя бы один вопрос в конструкторе');
    const created = await createGoogleForm({
      title: form.title,
      description: form.description || undefined,
      questions,
    });
    await prisma.form.update({
      where: { id: form.id },
      data: { googleFormId: created.formId, googleFormUrl: created.responderUri },
    });
    await audit(req, 'forms.create_google', 'Form', form.id, { googleFormId: created.formId });
    res.json({ item: { googleFormUrl: created.responderUri, editUri: created.editUri, formId: created.formId } });
  })
);

// Готовый Apps Script для этой формы (подставлены адрес панели, секрет и ключ формы)
router.get(
  '/:id/apps-script',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const form = await prisma.form.findUnique({ where: { id: req.params.id } });
    if (!form) throw badRequest('Форма не найдена');
    if (!env.sharedSecret) {
      throw notConfigured('INTEGRATION_SHARED_SECRET не задан на сервере');
    }
    let formKey = form.formKey;
    if (!formKey) {
      formKey = `F-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      await prisma.form.update({ where: { id: form.id }, data: { formKey } });
    }
    const settings = await prisma.appSetting.findUnique({ where: { key: 'panelUrl' } });
    const panelUrl = settings ? String(unpackJson<any>(settings.value, {}).url || '') : `${req.protocol}://${req.get('host')}`;
    const code = renderAppsScriptTemplate({ panelUrl, sharedSecret: env.sharedSecret, formKey });
    res.json({ code, formKey, panelUrl });
  })
);

export default router;

import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { ingestLimiter } from '../middleware/rateLimit';
import { enqueueDiscord } from '../lib/delivery';
import { buildWebhookPayload, EmbedField } from '../lib/discord';
import { maskWebhookUrl } from '../lib/mask';
import { encryptSecret, decryptSecret } from '../lib/crypto';
import { nickEquals, nickContains, normalizeNick } from '../lib/nickname';
import { HttpError, ah } from '../lib/httpError';

const router = Router();

/**
 * POST /api/integrations/ingest
 * Endpoint для Google Apps Script (триггер onFormSubmit).
 * Защита: заголовок X-Shared-Secret == INTEGRATION_SHARED_SECRET.
 * Идемпотентность: externalId (ID ответа Google Form) — повторная отправка не создаёт дублей.
 */
router.post(
  '/',
  ingestLimiter,
  ah(async (req, res) => {
    const secret = req.header('x-shared-secret') || '';
    if (!env.sharedSecret || secret !== env.sharedSecret) {
      throw new HttpError(401, 'INVALID_SECRET', 'Неверный или не настроенный общий секрет (X-Shared-Secret)');
    }

    const body = req.body || {};
    const externalId = typeof body.externalId === 'string' ? body.externalId : null;
    const formKey = typeof body.formKey === 'string' ? body.formKey.trim() : '';
    const googleFormId = typeof body.googleFormId === 'string' ? body.googleFormId : null;
    const formTitle = typeof body.formTitle === 'string' ? body.formTitle : 'Форма';
    const respondentEmail = typeof body.respondentEmail === 'string' ? body.respondentEmail : '';
    const submittedAt = typeof body.submittedAt === 'string' && !isNaN(Date.parse(body.submittedAt)) ? new Date(body.submittedAt) : new Date();

    if (!Array.isArray(body.answers)) {
      throw new HttpError(400, 'BAD_ANSWERS', 'Поле answers должно быть массивом {question, answer}');
    }
    const answers = (body.answers as any[])
      .map((a) => ({
        question: String(a?.question ?? '').slice(0, 200),
        answer: a?.answer == null ? '' : Array.isArray(a.answer) ? a.answer.join(', ') : String(a.answer),
      }))
      .filter((a) => a.answer !== '');

    // Идемпотентность
    if (externalId) {
      const dup = await prisma.formSubmission.findUnique({ where: { externalId } });
      if (dup) return res.json({ ok: true, duplicate: true, submissionId: dup.id });
    }

    // Поиск формы
    let form = null;
    if (formKey) form = await prisma.form.findUnique({ where: { formKey } });
    if (!form && googleFormId) form = await prisma.form.findUnique({ where: { googleFormId } });

    // Сопоставление сотрудника
    const employee = await matchEmployee(answers, respondentEmail);

    const submission = await prisma.formSubmission.create({
      data: {
        formId: form?.id || null,
        externalId,
        answers: answers as any,
        employeeId: employee?.id || null,
        status: form ? (employee ? 'NEW' : 'NO_EMPLOYEE') : 'NO_FORM',
        meta: {
          formTitle,
          respondentEmail,
          submittedAt: submittedAt.toISOString(),
          matchedBy: employee?.matchedBy || null,
        } as any,
      },
    });

    // Отчёт из формы типа REPORT (только если сотрудник сопоставлен)
    if (form && form.type === 'REPORT' && employee) {
      try {
        await prisma.report.create({
          data: {
            employeeId: employee.id,
            type: 'form_report',
            title: form.title,
            content: answers as any,
            source: 'google_form',
            externalId: externalId || `submission:${submission.id}`,
            submittedAt,
          },
        });
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e; // дубль отчёта по externalId — ок
      }
    }

    // Доставка в Discord по настройкам вебхука формы
    let deliveryEnqueued = false;
    if (form && form.webhookEnabled) {
      const target = decryptUrl(form.webhookUrlEnc) || env.discord.applications;
      if (target) {
        const fields: EmbedField[] = answers.map((a) => ({ name: a.question, value: a.answer }));
        if (!employee) {
          fields.push({ name: 'Сопоставление', value: 'Сотрудник не найден — проверьте игровой ID / Discord / ник в карточке сотрудника' });
        }
        const payload = buildWebhookPayload(
          {
            username: form.webhookUsername,
            avatarUrl: form.webhookAvatarUrl,
            content: [form.webhookMention, form.webhookContent].filter(Boolean).join(' '),
            title: form.webhookTitle || form.title,
            color: form.webhookColor,
            footer: form.webhookFooter || 'Sheriff Department — ответ формы',
            timestamp: form.webhookTimestamp,
          },
          fields
        );
        await enqueueDiscord({
          targetUrl: encryptSecret(target) as string,
          payload,
          dedupeKey: `submission:${submission.id}:discord`,
          relatedSubmissionId: submission.id,
          maskedUrl: maskWebhookUrl(target),
        });
        deliveryEnqueued = true;
        if (employee) {
          await prisma.formSubmission.update({ where: { id: submission.id }, data: { status: 'NEW' } });
        }
      }
    }

    await prisma.notification.create({
      data: {
        kind: 'submission_new',
        title: `Новый ответ: ${form?.title || formTitle}`,
        body: answers
          .slice(0, 2)
          .map((a) => `${a.question}: ${a.answer.slice(0, 80)}`)
          .join(' | ') || 'Ответ без полей',
        link: '/submissions',
      },
    });

    res.json({
      ok: true,
      submissionId: submission.id,
      formMatched: Boolean(form),
      employeeMatched: Boolean(employee),
      deliveryEnqueued,
    });
  })
);

function decryptUrl(enc: string | null): string | null {
  if (!enc) return null;
  return decryptSecret(enc);
}

interface MatchResult {
  id: string;
  matchedBy: string;
}

async function matchEmployee(answers: { question: string; answer: string }[], respondentEmail: string): Promise<(MatchResult & { fullName: string }) | null> {
  const q = (s: string) => s.toLowerCase();

  // 1) Точный матч по игровому ID
  for (const a of answers) {
    if (q(a.question).includes('id') || q(a.question).includes('айди') || q(a.question).includes('статик')) {
      const val = a.answer.trim();
      if (/^[\w#-]{1,16}$/.test(val)) {
        const emp = await prisma.employee.findFirst({ where: { gameId: val, status: { not: 'FIRED' } } });
        if (emp) return { id: emp.id, fullName: emp.fullName, matchedBy: 'gameId' };
      }
    }
  }

  // 2) Discord-тег
  for (const a of answers) {
    if (q(a.question).includes('discord') || q(a.question).includes('дискорд')) {
      const val = a.answer.trim();
      if (val.length >= 2) {
        const emp = await prisma.employee.findFirst({ where: { discordTag: { equals: val, mode: 'insensitive' }, status: { not: 'FIRED' } } });
        if (emp) return { id: emp.id, fullName: emp.fullName, matchedBy: 'discordTag' };
      }
    }
  }

  // 3) Никнейм (нормализованное сравнение)
  for (const a of answers) {
    if (q(a.question).includes('ник') || q(a.question).includes('nick') || q(a.question).includes('имя') || q(a.question).includes('name')) {
      const val = a.answer.trim();
      if (val.length < 2) continue;
      const employees = await prisma.employee.findMany({ where: { status: { not: 'FIRED' } } });
      const exact = employees.find((e) => nickEquals(e.fullName, val));
      if (exact) return { id: exact.id, fullName: exact.fullName, matchedBy: 'fullName' };
      const partial = employees.find((e) => nickContains(e.fullName, val) || nickContains(val, e.fullName));
      if (partial) return { id: partial.id, fullName: partial.fullName, matchedBy: 'fullName' };
    }
  }

  // 4) Логин = email из формы
  if (respondentEmail) {
    const emp = await prisma.employee.findUnique({ where: { login: respondentEmail } });
    if (emp && emp.status !== 'FIRED') return { id: emp.id, fullName: emp.fullName, matchedBy: 'login' };
  }

  return null;
}

export default router;

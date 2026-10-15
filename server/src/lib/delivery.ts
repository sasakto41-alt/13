import { prisma } from './prisma';
import { sendWebhook } from './discord';
import { decryptSecret } from './crypto';
import { packJson, unpackJson } from './jsonField';

/**
 * Очередь доставки DeliveryJob: ретраи с экспоненциальным backoff,
 * идемпотентность по dedupeKey (без дублей), ручная переотправка.
 * Одиночный воркер внутри процесса (Railway: масштаб = 1 инстанс).
 */

export interface EnqueueDiscordInput {
  targetUrl: string;
  payload: unknown;
  dedupeKey: string;
  relatedSubmissionId?: string | null;
  maskedUrl?: string | null;
}

export function backoffMs(attempts: number): number {
  // 1 мин, 2, 4, 8, 16 мин ... максимум 1 час
  return Math.min(60_000 * Math.pow(2, Math.max(0, attempts - 1)), 60 * 60_000);
}

export async function enqueueDiscord(input: EnqueueDiscordInput) {
  const existing = await prisma.deliveryJob.findUnique({ where: { dedupeKey: input.dedupeKey } });
  if (existing) return { job: existing, duplicate: true };
  const job = await prisma.deliveryJob.create({
    data: {
      kind: 'discord_webhook',
      targetUrlEnc: input.targetUrl,
      targetUrlMasked: input.maskedUrl || null,
      payload: packJson(input.payload) as string,
      dedupeKey: input.dedupeKey,
      relatedSubmissionId: input.relatedSubmissionId ?? null,
    },
  });
  return { job, duplicate: false };
}

export async function processOnce(): Promise<number> {
  const jobs = await prisma.deliveryJob.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  for (const job of jobs) {
    const url = decryptSecret(job.targetUrlEnc);
    if (!url) {
      await prisma.deliveryJob.update({
        where: { id: job.id },
        data: { status: 'DEAD', lastError: 'URL вебхука не задан или не расшифрован' },
      });
      continue;
    }

    const result = await sendWebhook(url, unpackJson<Record<string, unknown>>(job.payload, {}));

    if (result.ok) {
      await prisma.deliveryJob.update({
        where: { id: job.id },
        data: { status: 'DELIVERED', deliveredAt: new Date(), lastError: null },
      });
      if (job.relatedSubmissionId) {
        await prisma.formSubmission.updateMany({
          where: { id: job.relatedSubmissionId, status: 'NEW' },
          data: { status: 'NOTIFIED' },
        });
      }
      continue;
    }

    const attempts = job.attempts + 1;
    const dead = !result.retryable || attempts >= job.maxAttempts;
    await prisma.deliveryJob.update({
      where: { id: job.id },
      data: {
        attempts,
        status: dead ? 'DEAD' : 'PENDING',
        lastError: result.error || 'unknown error',
        nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
      },
    });

    if (dead) {
      await prisma.notification.create({
        data: {
          kind: 'delivery_failed',
          title: 'Не удалось доставить сообщение в Discord',
          body: `Задача ${job.dedupeKey || job.id}: ${result.error || 'неизвестная ошибка'}. Доступна ручная переотправка в разделе «Очередь доставки».`,
          link: '/delivery',
        },
      });
      if (job.relatedSubmissionId) {
        await prisma.formSubmission.updateMany({
          where: { id: job.relatedSubmissionId, status: 'NEW' },
          data: { status: 'FAILED' },
        });
      }
    }
  }

  return jobs.length;
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startDeliveryWorker() {
  if (workerTimer) return;
  workerTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await processOnce();
    } catch (e) {
      console.error('delivery worker error:', e);
    } finally {
      running = false;
    }
  }, 10_000);
  console.log('Delivery worker запущен (интервал 10 c)');
}

export function stopDeliveryWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}

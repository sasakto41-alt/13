import { prisma } from './prisma';
import { sendWebhook, buildWebhookPayload } from './discord';
import { uploadBackupToDrive } from './google';
import { env } from '../config/env';
import { isoDay } from './csv';

/**
 * Ежедневное резервное копирование: дамп основных таблиц в JSON ->
 * Discord (attachment через вебхук) и/или Google Drive (если настроен).
 * Запуск: раз в сутки по APP_TIMEZONE (по умолчанию 03:10 локального времени).
 */

const BACKUP_TIME_KEY = 'backup.lastRunDay';
const BACKUP_HOUR = 3;
const BACKUP_MINUTE = 10;

export async function collectBackupJson(): Promise<string> {
  const [employees, forms, submissions, reports, documents, settings] = await Promise.all([
    prisma.employee.findMany(),
    prisma.form.findMany(),
    prisma.formSubmission.findMany(),
    prisma.report.findMany(),
    prisma.document.findMany(),
    prisma.appSetting.findMany(),
  ]);
  return JSON.stringify(
    {
      version: 1,
      createdAt: new Date().toISOString(),
      employees,
      forms: forms.map((f) => ({ ...f, webhookUrlEnc: '•••' })),
      submissions,
      reports,
      documents,
      settings,
    },
    null,
    2
  );
}

async function lastRunDay(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: BACKUP_TIME_KEY } });
  return row ? String((row.value as any)?.day ?? '') : null;
}

async function markRun(day: string) {
  await prisma.appSetting.upsert({
    where: { key: BACKUP_TIME_KEY },
    create: { key: BACKUP_TIME_KEY, value: { day } as any },
    update: { value: { day } as any },
  });
}

export async function runBackupNow(): Promise<{ discord: boolean; drive: string | null; error?: string }> {
  const json = await collectBackupJson();
  const stamp = isoDay(new Date(), env.statsTz);
  const filename = `sheriff-panel-backup-${stamp}.json`;
  const result = { discord: false, drive: null as string | null, error: undefined as string | undefined };

  if (env.discord.backup) {
    try {
      const boundary = '----SheriffPanelBackup' + Date.now();
      const payload = buildWebhookPayload(
        { title: 'Резервная копия панели', footer: 'Автоматическое копирование' },
        [{ name: 'Дата', value: new Date().toISOString() }, { name: 'Размер', value: `${(json.length / 1024).toFixed(1)} КБ` }]
      );
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(
            payload
          )}\r\n--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="${filename}"\r\nContent-Type: application/json\r\n\r\n`,
          'utf8'
        ),
        Buffer.from(json, 'utf8'),
        Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
      ]);
      const res = await fetch(env.discord.backup, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
      });
      result.discord = res.ok;
      if (!res.ok) result.error = `Discord backup HTTP ${res.status}`;
    } catch (e: any) {
      result.error = String(e?.message || e);
    }
  }

  try {
    result.drive = await uploadBackupToDrive(filename, json);
  } catch (e: any) {
    if (!result.error) result.error = `Drive: ${String(e?.message || e)}`;
  }

  await markRun(stamp);
  return result;
}

let backupTimer: ReturnType<typeof setInterval> | null = null;

export function startBackupScheduler() {
  if (backupTimer) return;
  backupTimer = setInterval(async () => {
    try {
      const nowLocal = new Date(new Date().toLocaleString('en-US', { timeZone: env.statsTz }));
      if (nowLocal.getHours() !== BACKUP_HOUR || nowLocal.getMinutes() !== BACKUP_MINUTE) return;
      const today = isoDay(new Date(), env.statsTz);
      if ((await lastRunDay()) === today) return;
      const result = await runBackupNow();
      console.log('Backup completed:', result);
      await prisma.notification.create({
        data: {
          kind: 'backup',
          title: 'Резервная копия создана',
          body: result.error
            ? `Копирование завершено с ошибкой: ${result.error}`
            : `Копия отправлена: ${result.discord ? 'Discord; ' : ''}${result.drive ? 'Google Drive' : ''}`.trim() || 'Готово',
          link: '/settings',
        },
      });
    } catch (e) {
      console.error('backup scheduler error:', e);
    }
  }, 60_000);
  console.log('Backup scheduler запущен (ежедневно в 03:10', env.statsTz + ')');
}

export function stopBackupScheduler() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = null;
}

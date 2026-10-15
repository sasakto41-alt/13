import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env, warnIfMisconfigured } from './config/env';
import { csrfMiddleware } from './lib/csrf';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter, loginLimiter } from './middleware/rateLimit';
import { prisma } from './lib/prisma';
import { startDeliveryWorker } from './lib/delivery';
import { startBackupScheduler } from './lib/backup';
import { signSession } from './lib/session';

import authRoutes from './routes/auth.routes';
import employeesRoutes from './routes/employees.routes';
import formsRoutes from './routes/forms.routes';
import submissionsRoutes from './routes/submissions.routes';
import reportsRoutes from './routes/reports.routes';
import documentsRoutes from './routes/documents.routes';
import statisticsRoutes from './routes/statistics.routes';
import notificationsRoutes from './routes/notifications.routes';
import auditRoutes from './routes/audit.routes';
import deliveryRoutes from './routes/delivery.routes';
import settingsRoutes from './routes/settings.routes';
import ingestRoutes from './routes/ingest.routes';

async function bootstrapLeader() {
  // Вариант 1: ADMIN_PASSWORD_HASH из окружения — создаём лидера при старте
  if (env.adminPasswordHash) {
    const exists = await prisma.employee.findUnique({ where: { login: 'leader' } });
    if (!exists) {
      await prisma.employee.create({
        data: {
          fullName: 'Лидер Sheriff Department',
          login: 'leader',
          passwordHash: env.adminPasswordHash,
          role: 'LEADER',
          status: 'ACTIVE',
        },
      });
      console.log('Создан аккаунт лидера из ADMIN_PASSWORD_HASH (логин: leader)');
    }
  }
  // Вариант 2 (основной): первый вход через страницу настройки + SETUP_SECRET
}

async function main() {
  if (env.isProd) {
    if (!env.databaseUrl) throw new Error('DATABASE_URL обязателен в production');
    if (env.sessionSecret.startsWith('dev-only')) {
      throw new Error('SESSION_SECRET должен быть задан случайной строкой в production');
    }
  }
  for (const w of warnIfMisconfigured()) console.warn('! ' + w);

  const app = express();
  app.set('trust proxy', 1);

  app.use(
    cors({
      origin: env.corsOrigin.length ? env.corsOrigin : true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(csrfMiddleware);
  app.use('/api', apiLimiter);

  // Health (без авторизации; Railway healthcheck)
  app.get('/api/health', async (_req, res) => {
    let db = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    res.json({ ok: true, db, time: new Date().toISOString(), version: '1.0.0' });
  });

  // Приём ответов Google Forms (Apps Script) — до остального API
  app.use('/api/integrations/ingest', ingestRoutes);

  app.use('/api/auth', loginLimiter, authRoutes);
  app.use('/api/employees', employeesRoutes);
  app.use('/api/forms', formsRoutes);
  app.use('/api/submissions', submissionsRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/documents', documentsRoutes);
  app.use('/api/statistics', statisticsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/delivery', deliveryRoutes);
  app.use('/api/settings', settingsRoutes);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Неизвестный API-метод' }));

  // Раздача собранного фронтенда одним сервисом
  if (env.serveFrontend) {
    const dist = path.resolve(__dirname, '../../client/dist');
    if (fs.existsSync(dist)) {
      app.use(express.static(dist));
      app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
      console.log('Frontend раздаётся из', dist);
    }
  }

  app.use(errorHandler);

  await bootstrapLeader();

  const server = app.listen(env.port, () => {
    console.log(`Sheriff Department Panel: http://localhost:${env.port} (${env.nodeEnv})`);
  });
  server.keepAliveTimeout = 65_000;

  startDeliveryWorker();
  if (env.discord.backup || env.googleServiceAccountJson || env.googleServiceAccountFile) {
    startBackupScheduler();
  }
}

main().catch((e) => {
  console.error('Не удалось запустить сервер:', e);
  process.exit(1);
});

// сохраняем ссылку для внешних тестов
export const __testables = { signSession };

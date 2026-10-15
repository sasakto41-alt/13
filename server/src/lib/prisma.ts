import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * База данных — файл data/panel.db в корне проекта (SQLite, сервер БД не нужен).
 * Путь задаём АБСОЛЮТНЫМ, чтобы файл всегда был в одном месте независимо от того,
 * откуда запущен процесс (npm run dev, npm start, tsx, node dist...).
 */

function databaseFileUrl(): string {
  // server/src/lib/prisma.ts (tsx) -> ../../../ = корень проекта;
  // server/dist/lib/prisma.js (tsc) -> ../../../ = тоже корень проекта.
  const root = path.resolve(__dirname, '..', '..', '..');
  const dataDir = path.join(root, 'data');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {
    // если не удалось создать — Prisma выдаст понятную ошибку ниже
  }
  const file = path.join(dataDir, 'panel.db');
  // Windows: приводим обратные слэши к прямым для file:-URL
  return 'file:' + file.replace(/\\/g, '/');
}

function env_nodeEnv(): string {
  return process.env.NODE_ENV || 'development';
}

export const prisma: PrismaClient =
  global.__prisma ||
  new PrismaClient({
    datasourceUrl: databaseFileUrl(),
    log: env_nodeEnv() === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

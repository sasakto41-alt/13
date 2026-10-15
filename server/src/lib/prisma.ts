import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ||
  new PrismaClient({
    log: env_nodeEnv() === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

function env_nodeEnv(): string {
  return process.env.NODE_ENV || 'development';
}

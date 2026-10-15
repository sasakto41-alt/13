import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../lib/httpError';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  const anyErr = err as any;
  if (anyErr && typeof anyErr === 'object') {
    // Prisma известные коды
    if (anyErr.code === 'P2002') {
      return res.status(409).json({ error: 'CONFLICT', message: 'Запись с такими данными уже существует' });
    }
    if (anyErr.code === 'P2025') {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Запись не найдена' });
    }
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'INTERNAL', message: 'Внутренняя ошибка сервера' });
}

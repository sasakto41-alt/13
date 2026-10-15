import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export const CSRF_COOKIE = 'spanel_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF-защита: double-submit cookie (заголовок + cookie) и проверка Origin.
 * Endpoint приёма ответов Apps Script исключён — он защищён общим секретом
 * и не использует cookie-сессии.
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies || !req.cookies[CSRF_COOKIE]) {
    const token = crypto.randomBytes(24).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: env.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600 * 1000,
    });
    (req.cookies as Record<string, string>)[CSRF_COOKIE] = token;
  }

  if (MUTATING.has(req.method)) {
    if (req.path.startsWith('/api/integrations/ingest')) return next();

    // 1) Проверка Origin (когда браузер его присылает)
    const origin = req.header('origin');
    if (origin) {
      const host = req.header('host');
      try {
        const o = new URL(origin);
        if (host && o.host !== host && !env.corsOrigin.includes(origin)) {
          return next(new Error('CSRF: origin mismatch'));
        }
      } catch {
        return next(new Error('CSRF: bad origin'));
      }
    }

    // 2) Double-submit token
    const header = req.header(CSRF_HEADER);
    if (!header || header !== req.cookies[CSRF_COOKIE]) {
      return res.status(403).json({ error: 'CSRF', message: 'CSRF-проверка не пройдена. Обновите страницу.' });
    }
  }

  next();
}

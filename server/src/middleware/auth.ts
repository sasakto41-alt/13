import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { verifySession, SESSION_COOKIE } from '../lib/session';
import { HttpError } from '../lib/httpError';

export interface AuthUser {
  uid: string;
  login: string;
  role: 'LEADER' | 'DEPUTY' | 'CURATOR' | 'EMPLOYEE';
  fullName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  const payload = verifySession(token);
  if (!payload) return next(new HttpError(401, 'UNAUTHORIZED', 'Требуется вход в систему'));
  req.user = {
    uid: payload.uid,
    login: payload.login,
    role: payload.role as AuthUser['role'],
    fullName: payload.fullName,
  };
  next();
}

type RoleName = 'LEADER' | 'DEPUTY' | 'CURATOR' | 'EMPLOYEE';

export function requireRole(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'UNAUTHORIZED', 'Требуется вход в систему'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'FORBIDDEN', 'Недостаточно прав для этого действия'));
    }
    next();
  };
}

/** Загружает сотрудника из БД по сессии (для проверки статуса/роли в рантайме) */
export async function currentUser(req: Request) {
  if (!req.user) return null;
  return prisma.employee.findUnique({ where: { id: req.user.uid } });
}

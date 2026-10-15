import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { signSession, sessionCookieOptions, SESSION_COOKIE } from '../lib/session';
import { requireAuth, currentUser } from '../middleware/auth';
import { audit } from '../lib/audit';
import { HttpError, ah } from '../lib/httpError';

const router = Router();

const loginSchema = z.object({
  login: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

const setupSchema = z.object({
  setupSecret: z.string().max(128).optional(),
  fullName: z.string().min(2).max(64),
  password: z.string().min(8).max(128),
});

function publicUser(e: {
  id: string;
  fullName: string;
  login: string | null;
  role: string;
  rank: string | null;
  division: string | null;
}) {
  return { id: e.id, fullName: e.fullName, login: e.login, role: e.role, rank: e.rank, division: e.division };
}

/** Статус первичной настройки: нужен ли setup и требуется ли секрет */
router.get(
  '/status',
  ah(async (_req, res) => {
    const leaderExists = (await prisma.employee.count({ where: { role: 'LEADER' } })) > 0;
    res.json({ needsSetup: !leaderExists, setupSecretRequired: Boolean(env.setupSecret) });
  })
);

/** Первичная настройка: создание аккаунта лидера (только пока лидера нет) */
router.post(
  '/setup',
  ah(async (req, res) => {
    const leaderExists = (await prisma.employee.count({ where: { role: 'LEADER' } })) > 0;
    if (leaderExists) throw new HttpError(409, 'ALREADY_SETUP', 'Первоначальная настройка уже выполнена');

    if (env.setupSecret && req.body?.setupSecret !== env.setupSecret) {
      throw new HttpError(403, 'BAD_SETUP_SECRET', 'Неверный секрет первоначальной настройки (SETUP_SECRET)');
    }
    const data = setupSchema.parse(req.body);
    const employee = await prisma.employee.create({
      data: {
        fullName: data.fullName,
        login: 'leader',
        passwordHash: await bcrypt.hash(data.password, 10),
        role: 'LEADER',
        status: 'ACTIVE',
      },
    });
    await audit(req, 'auth.setup', 'Employee', employee.id, { login: 'leader', role: 'LEADER' });

    const token = signSession({
      uid: employee.id,
      login: employee.login!,
      role: employee.role,
      fullName: employee.fullName,
    });
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    res.json({ user: publicUser(employee) });
  })
);

router.post(
  '/login',
  ah(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const employee = await prisma.employee.findUnique({ where: { login: data.login } });
    if (!employee || !employee.passwordHash) {
      throw new HttpError(401, 'BAD_CREDENTIALS', 'Неверный логин или пароль');
    }
    if (employee.status === 'FIRED') {
      throw new HttpError(403, 'ACCOUNT_DISABLED', 'Этот аккаунт отключён (сотрудник уволен)');
    }
    const ok = await bcrypt.compare(data.password, employee.passwordHash);
    if (!ok) throw new HttpError(401, 'BAD_CREDENTIALS', 'Неверный логин или пароль');

    const token = signSession({
      uid: employee.id,
      login: employee.login!,
      role: employee.role,
      fullName: employee.fullName,
    });
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    await audit(req, 'auth.login', 'Employee', employee.id);
    res.json({ user: publicUser(employee) });
  })
);

router.post(
  '/logout',
  ah(async (req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    await audit(req, 'auth.logout');
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const me = await currentUser(req);
    if (!me || me.status === 'FIRED') {
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      throw new HttpError(401, 'UNAUTHORIZED', 'Сессия недействительна');
    }
    res.json({ user: publicUser(me) });
  })
);

router.post(
  '/change-password',
  requireAuth,
  ah(async (req, res) => {
    const schema = z.object({ oldPassword: z.string().min(1), newPassword: z.string().min(8).max(128) });
    const data = schema.parse(req.body);
    const me = await currentUser(req);
    if (!me || !me.passwordHash) throw new HttpError(400, 'NO_PASSWORD', 'Пароль не установлен');
    const ok = await bcrypt.compare(data.oldPassword, me.passwordHash);
    if (!ok) throw new HttpError(400, 'BAD_OLD_PASSWORD', 'Текущий пароль указан неверно');
    await prisma.employee.update({
      where: { id: me.id },
      data: { passwordHash: await bcrypt.hash(data.newPassword, 10) },
    });
    await audit(req, 'auth.change_password', 'Employee', me.id);
    res.json({ ok: true });
  })
);

export default router;

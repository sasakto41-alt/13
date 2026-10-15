import crypto from 'crypto';
import { env } from '../config/env';

export interface SessionPayload {
  uid: string;
  login: string;
  role: string;
  fullName: string;
  exp: number;
}

export const SESSION_COOKIE = 'spanel_session';
export const SESSION_TTL_SEC = 7 * 24 * 3600;

export function signSession(p: Omit<SessionPayload, 'exp'>, ttlSec = SESSION_TTL_SEC): string {
  const body: SessionPayload = { ...p, exp: Math.floor(Date.now() / 1000) + ttlSec };
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.sessionSecret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', env.sessionSecret).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    if (!payload.uid || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SEC * 1000,
  };
}

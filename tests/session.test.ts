import { describe, it, expect } from 'vitest';
import { signSession, verifySession, SESSION_TTL_SEC } from '../server/src/lib/session';

describe('session tokens', () => {
  it('round-trip: подпись и проверка', () => {
    const token = signSession({ uid: 'u1', login: 'leader', role: 'LEADER', fullName: 'Тест' });
    const payload = verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload!.uid).toBe('u1');
    expect(payload!.login).toBe('leader');
    expect(payload!.role).toBe('LEADER');
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('подделка подписи отклоняется', () => {
    const token = signSession({ uid: 'u1', login: 'leader', role: 'LEADER', fullName: 'Тест' });
    const [data] = token.split('.');
    const forged = data + '.AAAA';
    expect(verifySession(forged)).toBeNull();
    expect(verifySession('garbage')).toBeNull();
    expect(verifySession('')).toBeNull();
  });

  it('просроченный токен отклоняется', () => {
    const token = signSession({ uid: 'u1', login: 'leader', role: 'LEADER', fullName: 'Тест' }, -10);
    expect(verifySession(token)).toBeNull();
  });

  it('TTL сессии — 7 дней', () => {
    expect(SESSION_TTL_SEC).toBe(7 * 24 * 3600);
  });
});

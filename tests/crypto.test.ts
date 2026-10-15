import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, isEncrypted } from '../server/src/lib/crypto';

describe('crypto (AES-256-GCM для секретов)', () => {
  it('шифрует и расшифровывает URL вебхука', () => {
    const url = 'https://discord.com/api/webhooks/1234567890/AbCdEfGhIjKlMnOpQrStUvWx';
    const enc = encryptSecret(url);
    expect(enc).not.toBeNull();
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain(url);
    expect(decryptSecret(enc)).toBe(url);
  });

  it('каждое шифрование уникально (случайный IV)', () => {
    const a = encryptSecret('secret-a');
    const b = encryptSecret('secret-a');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('secret-a');
    expect(decryptSecret(b)).toBe('secret-a');
  });

  it('пустые значения', () => {
    expect(encryptSecret(null)).toBeNull();
    expect(encryptSecret('')).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });

  it('незашифрованное значение возвращается как есть (совместимость)', () => {
    expect(decryptSecret('plain-value')).toBe('plain-value');
  });
});

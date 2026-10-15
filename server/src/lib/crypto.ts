import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Шифрование секретов (URL вебхуков), сохраняемых в БД — AES-256-GCM.
 * Формат: enc:v1:<iv_b64>:<tag_b64>:<data_b64>
 * Ключ: ENCRYPTION_KEY (64 hex-символа) либо SHA-256 от SESSION_SECRET.
 */

function keyBytes(): Buffer {
  if (env.encryptionKey) {
    const k = Buffer.from(env.encryptionKey, 'hex');
    if (k.length === 32) return k;
  }
  return crypto.createHash('sha256').update(`sheriff-panel:${env.sessionSecret}`).digest();
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('enc:v1:');
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isEncrypted(stored)) return stored; // значение без шифрования (совместимость)
  try {
    const [, , ivB64, tagB64, dataB64] = stored.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return out.toString('utf8');
  } catch {
    return null;
  }
}

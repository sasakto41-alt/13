/**
 * Хелперы для JSON-полей на SQLite.
 * SQLite (через Prisma) не поддерживает тип Json — такие поля хранятся
 * строками (JSON.stringify). Здесь — единая точка упаковки/распаковки.
 */

/** Упаковать значение в JSON-строку для хранения в БД. null/undefined -> null */
export function packJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/** Распаковать JSON-строку из БД. Возвращает fallback, если пусто/битое. */
export function unpackJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw as unknown as T; // уже объект (напр., из старого бэкапа)
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

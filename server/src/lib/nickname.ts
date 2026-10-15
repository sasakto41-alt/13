/** Нормализация никнеймов для сопоставления ответов форм с сотрудниками. */
export function normalizeNick(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .replace(/[\u0301\u0300]/g, '')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nickEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeNick(a);
  const nb = normalizeNick(b);
  return na.length > 0 && na === nb;
}

export function nickContains(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  const h = normalizeNick(haystack);
  const n = normalizeNick(needle);
  return h.length > 0 && n.length > 0 && h.includes(n);
}

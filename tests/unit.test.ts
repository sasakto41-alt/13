import { describe, it, expect } from 'vitest';
import { csvRows } from '../server/src/lib/csv';
import { normalizeNick, nickEquals, nickContains } from '../server/src/lib/nickname';
import { backoffMs } from '../server/src/lib/delivery';

describe('CSV export (UTF-8 BOM)', () => {
  it('начинается с BOM', () => {
    const out = csvRows([['a', 'b'], ['c', 'd']]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
  });

  it('экранирует кавычки и разделитель ;', () => {
    const out = csvRows([['он сказал "привет"; и ушёл']]);
    expect(out).toContain('"он сказал ""привет""; и ушёл"');
  });
});

describe('нормализация никнеймов', () => {
  it('регистр и Ё/Е не влияют', () => {
    expect(nickEquals('Пётр Иванов', 'петр иванов')).toBe(true);
    expect(normalizeNick('  JOHN   Smith ')).toBe('john smith');
  });

  it('nickContains находит частичное совпадение', () => {
    expect(nickContains('John Smith Jr', 'John')).toBe(true);
    expect(nickContains('Anna', 'Bob')).toBe(false);
  });
});

describe('очередь доставки: экспоненциальный backoff', () => {
  it('растёт и ограничен 1 часом', () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});

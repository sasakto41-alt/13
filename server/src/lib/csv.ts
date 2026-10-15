/**
 * CSV-экспорт с UTF-8 BOM (корректное открытие в Excel),
 * разделитель «;» — стандарт для русской локали Excel.
 */
export function csvRows(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v);
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}

export function sendCsv(res: any, filename: string, rows: (string | number | null | undefined)[][]): void {
  const body = csvRows(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

export function isoDay(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Список дней (YYYY-MM-DD) за последние days дней в указанной таймзоне */
export function daySeries(days: number, tz: string): string[] {
  const out: string[] = [];
  const fmtDay = (offset: number) => isoDay(new Date(Date.now() - offset * 86400000), tz);
  for (let i = days - 1; i >= 0; i--) out.push(fmtDay(i));
  return out;
}

/** Маскирует URL вебхука для показа в интерфейсе: домен + начало пути. */
export function maskWebhookUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const head = parts.slice(0, 3).join('/');
    return `${u.protocol}//${u.host}/${head}/••••••`;
  } catch {
    return '••••••';
  }
}

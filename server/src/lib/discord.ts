/**
 * Discord webhook: сборка payload'а и отправка.
 * Формат повторяет рабочий скрипт пользователя: content, embeds[{title, color,
 * fields[{name, value}], footer, timestamp}], username, avatar_url.
 * Длинные значения полей разбиваются на части по 1024 символа (лимит Discord).
 */

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordWebhookConfig {
  username?: string | null;
  avatarUrl?: string | null;
  content?: string | null;
  title?: string | null;
  color?: number | null;
  footer?: string | null;
  timestamp?: boolean | null;
}

export const DEFAULT_EMBED_COLOR = 0xd4af37; // золотистый Sheriff

export function split1024(s: string): string[] {
  const text = s || '';
  if (!text) return [];
  return text.match(/[\s\S]{1,1024}/g) || [text.slice(0, 1024)];
}

export function buildEmbedFields(fields: EmbedField[]): { name: string; value: string; inline: boolean }[] {
  const out: { name: string; value: string; inline: boolean }[] = [];
  for (const f of fields) {
    const value = (f.value == null || f.value === '' ? '—' : String(f.value)).trim() || '—';
    const parts = split1024(value);
    if (parts.length === 0) continue;
    parts.forEach((part, index) => {
      out.push({
        name: index === 0 ? (f.name || '\u200b') : `${f.name} (прод.)`,
        value: part,
        inline: Boolean(f.inline),
      });
    });
  }
  return out.slice(0, 25); // лимит Discord: 25 полей на embed
}

export function buildWebhookPayload(cfg: DiscordWebhookConfig, fields: EmbedField[]): Record<string, unknown> {
  const embed: Record<string, unknown> = {
    title: cfg.title || undefined,
    color: typeof cfg.color === 'number' ? cfg.color : DEFAULT_EMBED_COLOR,
    fields: buildEmbedFields(fields).length ? buildEmbedFields(fields) : undefined,
    footer: cfg.footer ? { text: cfg.footer } : undefined,
    timestamp: cfg.timestamp === false ? undefined : new Date().toISOString(),
  };

  const payload: Record<string, unknown> = {
    username: cfg.username || 'Sheriff Department',
    embeds: [embed],
  };
  if (cfg.avatarUrl) payload.avatar_url = cfg.avatarUrl;
  const content = (cfg.content || '').trim();
  if (content) payload.content = content.slice(0, 2000);
  return payload;
}

export interface WebhookSendResult {
  ok: boolean;
  status?: number;
  error?: string;
  retryable?: boolean;
}

export async function sendWebhook(url: string, payload: unknown): Promise<WebhookSendResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    // 429 — rate limit Discord (retryable), 5xx — retryable
    const retryable = res.status === 429 || res.status >= 500;
    let detail = `HTTP ${res.status}`;
    if (res.status === 404) detail = 'HTTP 404 — вебхук не найден (удалён или неверный URL)';
    if (res.status === 401) detail = 'HTTP 401 — неверный токен вебхука';
    try {
      const body = await res.text();
      if (body) detail += `: ${body.slice(0, 300)}`;
    } catch { /* ignore */ }
    return { ok: false, status: res.status, error: detail, retryable };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e), retryable: true };
  }
}

/** Проверка, что URL похож на Discord webhook */
export function isDiscordWebhookUrl(url: string): boolean {
  return /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url);
}

export function isValidWebhookUrl(url: string): boolean {
  return /^https:\/\//.test(url);
}

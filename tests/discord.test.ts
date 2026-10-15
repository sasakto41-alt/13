import { describe, it, expect } from 'vitest';
import { split1024, buildEmbedFields, buildWebhookPayload, isDiscordWebhookUrl } from '../server/src/lib/discord';

describe('discord webhook payload', () => {
  it('split1024 разбивает длинные значения', () => {
    const long = 'x'.repeat(2500);
    const parts = split1024(long);
    expect(parts.length).toBe(3);
    expect(parts[0].length).toBe(1024);
    expect(parts.join('')).toBe(long);
  });

  it('buildEmbedFields добавляет «(прод.)» для длинных ответов — как в рабочем скрипте', () => {
    const fields = buildEmbedFields([{ name: 'Вопрос', value: 'y'.repeat(2100) }]);
    expect(fields.length).toBe(3);
    expect(fields[0].name).toBe('Вопрос');
    expect(fields[1].name).toBe('Вопрос (прод.)');
    expect(fields.every((f) => f.value.length <= 1024)).toBe(true);
  });

  it('не более 25 полей (лимит Discord)', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `Q${i}`, value: 'z'.repeat(1100) }));
    expect(buildEmbedFields(many).length).toBeLessThanOrEqual(25);
  });

  it('buildWebhookPayload: username, avatar, content, color, footer, timestamp', () => {
    const payload = buildWebhookPayload(
      {
        username: 'WADE FAMILY',
        avatarUrl: 'https://example.com/avatar.jpg',
        content: 'Тут упоминание',
        title: 'ЗАГОЛОВОК',
        color: 16711680,
        footer: 'Это текст снизу!',
        timestamp: true,
      },
      [{ name: 'Вопрос', value: 'Ответ' }]
    );
    expect(payload.username).toBe('WADE FAMILY');
    expect(payload.avatar_url).toBe('https://example.com/avatar.jpg');
    expect(payload.content).toBe('Тут упоминание');
    const embed: any = (payload as any).embeds[0];
    expect(embed.color).toBe(16711680);
    expect(embed.title).toBe('ЗАГОЛОВОК');
    expect(embed.footer.text).toBe('Это текст снизу!');
    expect(embed.timestamp).toBeTruthy();
    expect(embed.fields[0]).toMatchObject({ name: 'Вопрос', value: 'Ответ' });
  });

  it('timestamp: false — метка времени не ставится', () => {
    const payload: any = buildWebhookPayload({ timestamp: false }, [{ name: 'A', value: 'B' }]);
    expect(payload.embeds[0].timestamp).toBeUndefined();
  });

  it('isDiscordWebhookUrl принимает только правильные URL', () => {
    expect(isDiscordWebhookUrl('https://discord.com/api/webhooks/1/abc')).toBe(true);
    expect(isDiscordWebhookUrl('https://discordapp.com/api/webhooks/1/abc')).toBe(true);
    expect(isDiscordWebhookUrl('http://discord.com/api/webhooks/1/abc')).toBe(false);
    expect(isDiscordWebhookUrl('https://evil.com/api/webhooks/1/abc')).toBe(false);
  });
});

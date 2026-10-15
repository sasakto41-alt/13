import fs from 'fs';

function required(name: string, devDefault?: string): string {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Отсутствует обязательная переменная окружения ${name}. Задайте её в Railway → Variables (или в .env).`
    );
  }
  return devDefault || '';
}

function optional(name: string): string {
  return (process.env[name] || '').trim();
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: Number(process.env.PORT || 3000),

  databaseUrl: optional('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET', 'dev-only-session-secret-change-me-please-32'),
  encryptionKey: optional('ENCRYPTION_KEY'),
  setupSecret: optional('SETUP_SECRET'),
  adminPasswordHash: optional('ADMIN_PASSWORD_HASH'),
  sharedSecret: optional('INTEGRATION_SHARED_SECRET'),

  discord: {
    applications: optional('DISCORD_APPLICATIONS_WEBHOOK_URL'),
    reports: optional('DISCORD_REPORTS_WEBHOOK_URL'),
    tech: optional('DISCORD_TECH_WEBHOOK_URL'),
    stats: optional('DISCORD_STATS_WEBHOOK_URL'),
    backup: optional('DISCORD_BACKUP_WEBHOOK_URL'),
  },

  googleServiceAccountJson: optional('GOOGLE_SERVICE_ACCOUNT_JSON'),
  googleServiceAccountFile: optional('GOOGLE_SERVICE_ACCOUNT_FILE'),

  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : (process.env.NODE_ENV || 'development') === 'production',
  serveFrontend: process.env.SERVE_FRONTEND !== 'false',
  corsOrigin: optional('CORS_ORIGIN')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  statsTz: optional('APP_TIMEZONE') || 'Europe/Moscow',
};

export function warnIfMisconfigured(): string[] {
  const warnings: string[] = [];
  if (!env.sharedSecret) warnings.push('INTEGRATION_SHARED_SECRET не задан — приём ответов Google Forms (Apps Script) будет отклонён.');
  const anyWebhook = Object.values(env.discord).some(Boolean);
  if (!anyWebhook) warnings.push('Ни один глобальный DISCORD_*_WEBHOOK_URL не задан — доставка будет работать только для форм с собственным вебхуком.');
  if (!env.googleServiceAccountJson && !env.googleServiceAccountFile) warnings.push('Google API не настроен (GOOGLE_SERVICE_ACCOUNT_JSON/FILE) — создание форм и документов будет недоступно («Не настроено»).');
  if (!env.adminPasswordHash && !env.setupSecret) warnings.push('Не заданы ни SETUP_SECRET, ни ADMIN_PASSWORD_HASH — аккаунт лидера не сможет быть создан.');
  return warnings;
}

export function readGoogleCredentialsFile(): object | null {
  if (!env.googleServiceAccountFile) return null;
  try {
    return JSON.parse(fs.readFileSync(env.googleServiceAccountFile, 'utf8'));
  } catch {
    return null;
  }
}

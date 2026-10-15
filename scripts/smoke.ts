/**
 * Сквозной smoke-тест API на ЗАПУЩЕННОМ сервере.
 * Запуск: PANEL_URL=http://localhost:3000 npm run smoke
 * Проверяет: health, статус первичной настройки, CSRF-cookie, защиту ingest.
 */
const BASE = (process.env.PANEL_URL || 'http://localhost:3000').replace(/\/$/, '');

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail?: string) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) failed++;
  };

  // 1. Health
  const health = await fetch(`${BASE}/api/health`);
  const healthBody = await health.json().catch(() => null);
  check('GET /api/health', health.ok && healthBody?.ok === true, `db=${healthBody?.db}`);

  // 2. Статус первичной настройки
  const status = await fetch(`${BASE}/api/auth/status`);
  const statusBody = await status.json().catch(() => null);
  check('GET /api/auth/status', status.ok && typeof statusBody?.needsSetup === 'boolean', JSON.stringify(statusBody));

  // 3. CSRF-cookie выдаётся
  const healthCookies = health.headers.getSetCookie?.() || [];
  check('CSRF cookie выдаётся', healthCookies.some((c) => c.startsWith('spanel_csrf=')));

  // 4. Изменяющий запрос без CSRF отклоняется
  const noCsrf = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'x', password: 'y' }),
  });
  check('POST без CSRF-токена отклоняется', noCsrf.status === 403, `status=${noCsrf.status}`);

  // 5. Ingest без секрета отклоняется
  const ingest = await fetch(`${BASE}/api/integrations/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: [] }),
  });
  const ingestOk = ingest.status === 401;
  check('POST /api/integrations/ingest без секрета -> 401', ingestOk, `status=${ingest.status}`);

  // 6. Защищённый API без сессии -> 401
  const me = await fetch(`${BASE}/api/employees`);
  check('GET /api/employees без сессии -> 401', me.status === 401, `status=${me.status}`);

  if (failed > 0) {
    console.error(`\nSmoke: ${failed} проверок провалено`);
    process.exit(1);
  }
  console.log('\nSmoke: все проверки пройдены');
}

main().catch((e) => {
  console.error('Smoke error:', e);
  process.exit(1);
});

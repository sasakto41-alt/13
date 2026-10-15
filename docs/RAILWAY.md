# Развёртывание: GitHub → Railway

Панель разворачивается одним сервисом (Express отдаёт собранный фронтенд) + PostgreSQL.

## 1. Код на GitHub

Репозиторий уже содержит весь код. Любой push в основную ветку можно связать
с автодеплоем Railway.

## 2. Создание проекта на Railway

1. <https://railway.app> → **New Project** → **Deploy from GitHub repo** → выберите репозиторий.
2. В этом же проекте: **New** → **Database** → **PostgreSQL**.
3. Откройте сервис панели → вкладка **Variables** → **New Variable** → в списке ссылок
   выберите `DATABASE_URL` (Railway подставит строку подключения из сервиса PostgreSQL).
4. Добавьте остальные переменные (см. таблицу ниже).
5. Вкладка **Settings** → убедитесь, что:
   - Builder: NIXPACKS;
   - Start Command: `npm start` (уже в `railway.json`);
   - Healthcheck Path: `/api/health`.
6. **Settings → Networking → Generate Domain** — получите адрес вида
   `https://<имя>.up.railway.app`.

## 3. Обязательные переменные

| Переменная | Значение |
|------------|----------|
| `DATABASE_URL` | ссылка на Railway PostgreSQL (выбирается из списка) |
| `SESSION_SECRET` | случайная строка 64 hex: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SETUP_SECRET` | случайная строка для страницы первичной настройки лидера |
| `INTEGRATION_SHARED_SECRET` | случайная строка для Apps Script |
| `NODE_ENV` | `production` |

Рекомендуемые: `ENCRYPTION_KEY` (64 hex), `DISCORD_*_WEBHOOK_URL` (5 шт.),
`GOOGLE_SERVICE_ACCOUNT_JSON`, `APP_TIMEZONE=Europe/Moscow`.

Альтернатива SETUP_SECRET: `ADMIN_PASSWORD_HASH` (bcrypt-хэш) — тогда лидер
`leader` с этим паролем создаётся автоматически при старте.

## 4. Первый вход

1. Откройте адрес панели → появится страница **первоначальной настройки**.
2. Введите `SETUP_SECRET`, своё имя и придумайте пароль (минимум 8 символов) →
   создаётся аккаунт лидера (`leader`).
3. Дальше — обычный вход логином и паролем. Заместителей/кураторов создаёт лидер
   в разделе «Сотрудники» (с логином и паролем).

> Если страница настройки больше не показывается — аккаунт лидера уже создан.
> Восстановление доступа: задайте `ADMIN_PASSWORD_HASH` и перезапустите сервис
> (аккаунт `leader` будет пересоздан, если его нет).

## 5. Миграции

Применяются автоматически при старте (`npm start` → `prisma migrate deploy`).
SQL-миграция лежит в `prisma/migrations/` и коммитится в репозиторий.

## 6. Проверка после деплоя

- `https://<адрес>/api/health` → `{"ok": true, "db": "up", ...}`;
- панель открывается, настройка лидера проходит;
- Настройки → Диагностика: статусы интеграций;
- smoke-тест локально: `PANEL_URL=https://<адрес> npm run smoke`.

## Обновление

Push в GitHub → Railway автоматически пересобирает и перезапускает сервис
(Nixpacks: `npm install` → `npm run build` → `npm start`).

# Ticket Flow System

Панель-трекер тикетов по проектам между админом и клиентами.
React + Vite + Tailwind, бэкенд Supabase. Дизайн — editorial-dark, тикеты в виде «билетов».

## Локальный запуск

```bash
npm install
npm run dev          # http://localhost:5173
```

Старт-админ: `office@barabashflow.pl` / `Qazxplmn_12`

## Сборка

```bash
npm run build        # -> dist/
npm run preview
```

## Деплой (делаешь сам)

### Фронт → GitHub Pages
1. `git init && git add . && git commit -m "init"`
2. Создать репо на GitHub, `git remote add origin … && git push -u origin main`
3. В репо: **Settings → Pages → Source: GitHub Actions**. Workflow `.github/workflows/deploy.yml` соберёт и опубликует.
4. Свой домен: **Settings → Pages → Custom domain → `tickets.barabashflow.pl`**, у DNS добавить CNAME `tickets` → `<username>.github.io`. (Роутинг на HashRouter — поддомен/подпапка работают без доп. настройки.)

Папка `Prod/` в `.gitignore` — не коммитится и не деплоится.

### Edge Functions
Уже задеплоены в проект Supabase `ebmroanhngmigjxljzlp`:
- **create-user** — создание/удаление клиентов админом (service_role, JWT-защита, проверка роли).
- **notify** — письма через Resend (best-effort).

Чтобы заработали письма, задать секреты функций (Dashboard → Edge Functions → Secrets,
либо `supabase secrets set`):
- `RESEND_API_KEY` — ключ Resend (домен barabashflow.pl уже верифицирован).
- `NOTIFY_FROM` — опц., по умолчанию `Ticket Flow <office@barabashflow.pl>`.
- `APP_URL` — опц., ссылка в письме, по умолчанию `https://tickets.barabashflow.pl`.

Без `RESEND_API_KEY` функция `notify` молча пропускает отправку — приложение работает.

## Стек

- **Frontend:** React 18, Vite 5, Tailwind 3, react-router (HashRouter), @supabase/supabase-js.
- **Backend:** Supabase (Postgres + RLS + Storage + Realtime + Edge Functions).
- Схема, RLS и логика — см. вики проекта.

## Что внутри

- Логин (email/пароль), роли admin/client, защита маршрутов.
- Проекты: список с обложками, создание/правка (админ), привязка клиентов.
- Тикеты-«билеты»: создание с фото (drag&drop / paste), статусы/приоритет/категория,
  фильтры/поиск, счётчики, **бейдж непрочитанного**.
- Деталь тикета: тред-комментарии с фото, смена статуса/приоритета (админ),
  лента активности, lightbox, **realtime**.
- Админ: управление пользователями (создание с паролем, привязка к проектам).
- Онбординг-туториал при первом входе (спотлайт «жми сюда»).
- Полностью адаптивно под мобильные, тёмная тема по умолчанию.

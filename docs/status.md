# Status
Date: 2026-08-25

## Now

`1.0.0-beta.4`: info login bounce (A+B) — увод на `rating.chgk.info/login` → preferred или последнее зеркало вкладки; bypass в options «Войти».

Ранее в beta.3: точные path-кнопки и UX попапа по отзыву тестирования.

## In progress

—

## Next

Ручная проверка login-bounce; релиз с тегом `v1.0.0-beta.4`.

## Holes

- Fallback ловит только сетевые ошибки браузера, не HTTP/таймаут.
- Firefox: смена иконки по-прежнему no-op.
- Нет автотестов на `sites.js`.
- Chromium login-bounce через `tabs.update` (возможен краткий мелькание info).

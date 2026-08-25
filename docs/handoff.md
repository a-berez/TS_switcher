# Handoff: —
Date: 2026-08-25

Login-bounce A+B в `1.0.0-beta.4`. Следующий шаг — ручная проверка и релиз `v1.0.0-beta.4`.

## Verify

- preferred=.me, с .kz без сессии → `.me/login`, не info
- preferred=off, с .kz → `.kz/login`
- options «Войти» на info при preferred=.me остаётся на info
- сценарии beta.3 (path-кнопки, fallback-баннер, tooltip, сетка copy)

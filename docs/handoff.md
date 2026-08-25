# Handoff: —
Date: 2026-08-25

Задача по отзыву тестирования (без login-bounce) закрыта в `1.0.0-beta.3`. Следующий шаг — ручная проверка и релиз `v1.0.0-beta.3`.

## Verify

- Chrome/Vivaldi: unpacked `src` — на `/venues` (TS) нет КПР/ККР; TS↔TS switch/copy ведут на тот же path; на `chgk.quest/map` нет кнопок на главные; tooltip с полным URL; 6 copy → сетка 3×2; fallback-баннер: короткие подписи, без хостов с выключенной видимостью; длинный попап прокручивается.
- Firefox: `python build.py`, тот же сценарий.

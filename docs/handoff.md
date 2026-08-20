# Handoff: —
Date: 2026-08-20

Задача закрыта. Следующий шаг — ручная проверка и релиз `v1.0.0-beta.2`.

## Verify

- Chrome: загрузить unpacked `src`, проверить переключение/copy на TS и рейтингах, preferred `.ru`, fallback (симулировать блокировку info); дополнительно проверить login grace до `/logout` и one-shot bypass при клике по TS-зеркалу из popup.
- Firefox: `python build.py`, загрузить zip, тот же сценарий + webRequest redirect с login grace до `/logout`.

# Status
Date: 2026-08-27

## Now

`1.0.0-beta.5`: рейтинг `elo-chgk.uk`; при уходе с elo сбрасываются `sort`/`dir`.

Ранее: `1.0.0-beta.4` info login bounce (A+B) ещё не выпущен отдельным тегом (изменения уже в дереве).

## In progress

—

## Next

Ручная проверка elo + login-bounce; релиз тегом `v1.0.0-beta.5` (или сначала `beta.4`, затем `beta.5`).

## Holes

- Fallback ловит только сетевые ошибки браузера, не HTTP/таймаут.
- Firefox: смена иконки по-прежнему no-op.
- Нет автотестов на `sites.js`.
- Chromium login-bounce через `tabs.update` (возможен краткий мелькание info).

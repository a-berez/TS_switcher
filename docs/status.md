# Status
Date: 2026-08-29

## Now

`1.0.0-beta.7`: фиксы по фидбеку тестирования — DNR перехват всех TS-путей, one-shot bypass, convertPath для подстраниц/query.

Предыдущий релиз: `1.0.0-beta.6` (адаптивная сетка копирования 4×2).

## In progress

Ручная проверка beta.7: `/venues`, `/players/…/statistics?role=`, перехват после клика в попапе.

## Next

Релиз тегом `v1.0.0-beta.7`.

## Holes

- Fallback ловит только сетевые ошибки браузера, не HTTP/таймаут.
- Firefox: смена иконки по-прежнему no-op.
- Нет автотестов на `sites.js`.
- Chromium login-bounce через `tabs.update` (возможен краткий мелькание info).
- «Перехват сам выключился» / login redirect при preferred=off — без воспроизведения; login grace до `/logout` остаётся возможной причиной.

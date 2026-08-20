# Status
Date: 2026-08-20

## Now

Реализовано: зеркало `.ru`, рейтинги `.fun` и `chgk.quest`, настройки (preferred TS, fallback, видимость switch/copy), перехват TS (DNR / webRequest) с исключением `/login` и `/logout`, login grace до `/logout`, one-shot bypass для кликов по TS-зеркалам из popup, fallback-баннер в попапе, динамический попап без polling (без мерцания кнопок) и options.

## In progress

—

## Next

Ручная проверка в Chrome и Firefox; релиз с тегом `v1.0.0-beta.2`.

## Holes

- Fallback ловит только сетевые ошибки браузера, не HTTP/tаймаут.
- Firefox: смена иконки по-прежнему no-op.
- Нет автотестов на `sites.js`.

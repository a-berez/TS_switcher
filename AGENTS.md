# TS_switcher — agent notes

Браузерное расширение: переключение вкладки между Турнирным сайтом (`rating.chgk.info`), зеркалами Печеного и сайтом Рейтинга (`rating.chgk.gg`) с конвертацией пути.

User-facing conversation: русский.

## Pointers

- Архитектура и границы: `docs/architecture.md` — перед сменой доменов, манифестов, правил URL.
- Текущее состояние: `docs/status.md` — перед продолжением открытой задачи.
- Открытая передача: `docs/handoff.md` — если задача не закрыта.
- Вход человека и changelog: `README.md`.
- Сборка: `build.py` — ZIP для Chromium и Firefox.

## Conventions the code does not say

- Логика переключения и копирования ссылок живёт в `src/popup.js`. Content script почти пустой (маркер «расширение активно»).
- Chromium: Manifest V3, `chrome.action.setIcon`. Firefox: Manifest V2, смена иконки не делается (`setIcon` — no-op).
- Версия в `src/manifest*.json` в репозитории может отставать от changelog; в CI её выставляет `build.py` из тега `v*`.
- Между Турнирным сайтом и Рейтингом конвертируются главная и страницы игрока / турнира / команды; между `.gg`, `.fun`, `chgk.quest` — через канонический тип страницы в `sites.js`.
- Preferred TS: DNR (Chromium) / webRequest (Firefox). Fallback только при preferred off.

## Verify

- Chromium: загрузить `src` как unpacked; Firefox: `python build.py`. Сценарии: все 7 хостов, preferred `.ru`, fallback-баннер, options.

## Secrets and privacy

- Секретов в репозитории нет. Расширение не хранит пользовательские данные. Публикация в магазины — вне репо (см. `docs/*_PUBLISH.out.md`).

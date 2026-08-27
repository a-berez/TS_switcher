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

- Логика переключения и копирования ссылок живёт в `src/popup.js`. Обновление попапа — по `tabs`/`storage` событиям, без polling; DOM кнопок пересобирается только при смене ключа (хост/путь/видимость/fallback). Content script только снимает query-маркер one-shot bypass.
- Chromium: Manifest V3, `chrome.action.setIcon`. Firefox: Manifest V2, смена иконки не делается (`setIcon` — no-op).
- Версия в `src/manifest*.json` в репозитории может отставать от changelog; в CI её выставляет `build.py` из тега `v*`.
- Кнопки switch/copy только при точном соответствии path (`Sites.hasExactPath`): главная, player/tournament/team, либо TS↔TS (общий path). Иначе кнопок «на главную за неимением соответствия» нет.
- Между Турнирным сайтом и Рейтингом конвертируются главная и страницы игрока / турнира / команды; между `.gg`, `.fun`, `chgk.quest`, `elo-chgk.uk` — через канонический тип страницы в `sites.js`.
- Preferred TS: DNR (Chromium) / webRequest (Firefox). `/login` и `/logout` на зеркалах не перехватываются preferred-правилами.
- Увод сайта на `rating.chgk.info/login` переписывается: при preferred — на preferred; при preferred=off — на последний TS-хост вкладки (не info). Обход: `?ts_switcher_direct=1` (ссылки «Войти» в options).
- Пока открыта `/login`, preferred-redirection в этой вкладке временно выключается до `/logout` (login grace).
- В options напротив TS-хостов (info / .me / .kz / .ru) есть ссылка «Войти» → `/login` в новой вкладке (с bypass-параметром).
- Fallback-баннер показывает только хосты с включённой видимостью переключения; подписи — короткие (`.me`), полный хост в `title`.
- Кнопки копирования: два ряда (ТС сверху, рейтинги снизу); колонки в ряду = число видимых кнопок (`--copy-cols`), по умолчанию до 4×2. Текущий хост тоже показывается (в отличие от switch).

## Verify

- Chromium: загрузить `src` как unpacked; Firefox: `python build.py`. Сценарии: все 8 хостов, preferred `.ru`, fallback-баннер, options.

## Secrets and privacy

- Секретов в репозитории нет. Расширение не хранит пользовательские данные. Публикация в магазины — вне репо (см. `docs/*_PUBLISH.out.md`).

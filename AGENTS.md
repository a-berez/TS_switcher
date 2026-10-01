# TS_switcher — agent notes

Браузерное расширение: переключение вкладки между Турнирным сайтом (`rating.chgk.info`), зеркалами Печеного и сайтом Рейтинга (`rating.chgk.gg`) с конвертацией пути.

User-facing conversation: русский.

## Pointers

- Архитектура и границы: `docs/architecture.md` — перед сменой доменов, манифестов, правил URL.
- Текущее состояние: `docs/status.md` — перед продолжением открытой задачи.
- Открытая передача: `docs/handoff.md` — если задача не закрыта.
- Вход человека и changelog: `README.md`.
- Сборка: `build.py` — ZIP для Chromium и Firefox.
- Проверки: `tests/README.md` — перед изменениями поведения и выпуском.
- Решения: `docs/decisions/2026-10-01-background-state.md` — перед изменением записи настроек или времени жизни background.

## Conventions the code does not say

- Логика переключения и копирования ссылок живёт в `src/popup.js`. Обновление попапа — по `tabs`/`storage` событиям, без polling; DOM кнопок пересобирается только при смене ключа (хост/путь/видимость/fallback). Content script только снимает query-маркер one-shot bypass.
- Chromium: Manifest V3, `chrome.action.setIcon`. Firefox: Manifest V2 с постоянным background; смена иконки не делается (`setIcon` — no-op).
- Версия релиза `1.0.0-beta.N` упаковывается как `1.0.0.N`. `build.py` задаёт версию внутри ZIP, исходные manifest не меняет и понижение версии отвергает.
- Записи `Settings` проходят через единую очередь background (`initializeBackground`); UI отправляет частичные изменения runtime-сообщением. Прямые записи общего объекта из UI возвращают гонки.
- Кнопки switch/copy только при точном соответствии path (`Sites.hasExactPath`): главная, player/tournament/team, либо TS↔TS (общий path). Иначе кнопок «на главную за неимением соответствия» нет.
- Между Турнирным сайтом и Рейтингом конвертируются главная и страницы игрока / турнира / команды; на TS при копировании/переключении сохраняются подпути и query; на рейтинги — канонический path без хвоста и параметров; между `.gg`, `.fun`, `chgk.quest`, `elo-chgk.uk` — через канонический тип страницы в `sites.js`.
- Preferred TS: DNR (Chromium) / webRequest (Firefox). `/login` и `/logout` на зеркалах не перехватываются preferred-правилами. Обход осознанного перехода из попапа: `?ts_switcher_direct=1` (DNR allow / webRequest skip), не tab-wide bypass.
- Увод сайта на `rating.chgk.info/login` переписывается: при preferred — на preferred; при preferred=off — на последний TS-хост вкладки (не info). Обход: `?ts_switcher_direct=1` (ссылки «Войти» в options).
- После `/login` preferred-redirection в этой вкладке выключен до запроса `/logout` или закрытия вкладки (login grace). Учитываются logout с HTTP redirect и info/login как конечный URL серверной цепочки.
- Fallback очищается по `webNavigation.onCompleted`, а не `tabs.onUpdated complete`: последнее приходит и для страницы ошибки браузера. Отменённые навигации не считаются недоступностью сайта.
- В options напротив TS-хостов (info / .me / .kz / .ru) есть ссылка «Войти» → `/login` в новой вкладке (с bypass-параметром).
- Fallback-баннер показывает только хосты с включённой видимостью переключения; подписи — короткие (`.me`), полный хост в `title`.
- Кнопки копирования: два ряда (ТС сверху, рейтинги снизу); колонки в ряду = число видимых кнопок (`--copy-cols`), по умолчанию до 4×2. Текущий хост тоже показывается (в отличие от switch).

## Verify

- Быстрые проверки: `node tests/audit-ui.cjs`, `node tests/audit-background.cjs`, `python tests/audit-build.py`.
- Настоящие браузеры и зависимости: `tests/README.md`. Ручная проверка: Chromium загрузить `src`; Firefox собрать `python build.py` и установить ZIP временно. Сценарии: 8 хостов, preferred `.ru`, вход/выход, fallback, options.

## Secrets and privacy

- В отслеживаемых исходниках секретов нет; в рабочей папке могут быть игнорируемые PEM-ключи. Их содержимое не выводить и в Git не добавлять.
- Настройки хранятся локально; URL ошибки и последний TS-хост вкладки — в session storage, при его отсутствии в local. Текст страниц не сохраняется, телеметрии нет.
- Workflows содержат выпуск GitHub и публикацию в магазины с GitHub Secrets. Обычная проверка/сборка локальна; публикация — отдельное действие.

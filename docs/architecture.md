# Architecture

Расширение работает на семи хостах: четыре TS (один path) и три рейтинга (разные path).

## Границы

Внутри: попап (UI + маршрутизация URL), background (иконка, DNR/webRequest, fallback), `sites.js` / `settings.js`, options, сборка ZIP.

Снаружи: `rating.chgk.info`, `rating.pecheny.me|kz|ru`, `rating.chgk.gg`, `rating.chgk.fun`, `chgk.quest`.

Не делаем: синхронизацию логина, произвольные домены.

## Поток

1. Попап читает URL вкладки и настройки из `chrome.storage.local`.
2. Кнопки переключения и копирования генерируются по `visibleSwitchHosts` / `visibleCopyHosts`.
3. `Sites.convertPath` — канонический тип страницы (player/tournament/team) и path целевого хоста.
4. **Preferred TS:** DNR (Chromium) или `webRequest` (Firefox) редиректит main_frame с любого TS на preferred (тот же path).
5. **Fallback:** при `preferred === off` и сетевой ошибке TS — `webNavigation.onErrorOccurred` → session storage → баннер в попапе с выбором другого TS.
6. При включённом preferred клик по TS в попапе меняет preferred и открывает хост.

## Модули

| Файл | Роль |
|------|------|
| `src/sites.js` | Хосты, конвертация путей |
| `src/settings.js` | Defaults, load/save, fallback session |
| `src/popup.js` | Динамический UI |
| `src/options.html/js` | Настройки |
| `src/background.js` | DNR, иконки, fallback (Chromium) |
| `src/background-firefox.js` | webRequest, fallback (Firefox) |

## Сборка

`python build.py` — Chromium из `src`; Firefox: `manifest-firefox.json` + `background-firefox.js` → `background.js`.

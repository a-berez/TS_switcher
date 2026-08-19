# Architecture

Расширение работает только на четырёх хостах и меняет URL активной вкладки из попапа.

## Границы

Внутри: попап (UI + маршрутизация URL), background (иконка на Chromium), сборка ZIP, GitHub Release по тегу.

Снаружи: `rating.chgk.info` (Турнирный сайт), `rating.pecheny.me` / `rating.pecheny.kz` (зеркала, тот же path), `rating.chgk.gg` (Рейтинг, другой path).

Не делаем: синхронизацию сессии/логина, произвольные домены, хранение настроек.

## Поток

1. Пользователь открывает попап на вкладке.
2. `popup.js` читает `hostname` + `pathname` (+ query).
3. Показывает кнопки: с основного — оба зеркала; с зеркала — оригинал и другое зеркало; на всех трёх — Рейтинг, если страница главная или известный тип; с `.gg` — оригинал и оба зеркала.
4. `tabs.update` на `https://<host><path>`. Между info/зеркалами path копируется. Между info и `.gg` — `convertPathToGG` / `convertPathFromGG`.
5. Копирование в буфер: оригинал (`rating.chgk.info`) и зеркала `.me` / `.kz` с той же конвертацией пути, если источник — `.gg`.

Background Chromium: при смене вкладки ставит обычную / «рейтинговую» / disabled-иконку. Content script: только проверка хоста и лог.

## Сборка

`python build.py` из корня. Chromium: файлы из `src` как есть. Firefox: `manifest-firefox.json` → `manifest.json`, `background-firefox.js` → `background.js`. Релиз: push тега `v*` → `.github/workflows/release.yml`.

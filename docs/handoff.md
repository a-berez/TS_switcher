# Handoff: ожидание правок
Date: 2026-08-19
Left by: агент (изучение репозитория)

## Goal

Пользователь сможет назвать правки; агент внесёт их в расширение и обновит документы, не ломая конвертацию URL и границы доменов.

## Done

Репозиторий прочитан. Назначение, хосты, маппинг путей, сборка и дыры зафиксированы в `AGENTS.md`, `docs/architecture.md`, `docs/status.md`.

## Not done

Сами правки кода. Пользователь ещё не сформулировал изменения.

## Invariants

- Работа только на `rating.chgk.info`, `rating.pecheny.me`, `rating.pecheny.kz`, `rating.chgk.gg`.
- Зеркала делят path с Турнирным сайтом; Рейтинг — `/b/<player|tournament|team>/<id>/` ↔ `/players|tournament|teams/<id>`.
- Неизвестный путь при уходе на `.gg` → `/b/`, при уходе с `.gg` → `/`.
- Chromium MV3 и Firefox MV2 собираются отдельно (`build.py`).

## Where to look

- Маршруты и UI: `src/popup.js`, `src/popup.html`
- Иконка Chromium: `src/background.js`
- Firefox background: `src/background-firefox.js`
- Манифесты: `src/manifest.json`, `src/manifest-firefox.json`
- Сборка/релиз: `build.py`, `.github/workflows/release.yml`

## Verify

Загрузить unpacked `src` в Chrome; проверить переключение и копирование на главной, игроке, турнире, команде и на `.gg`.

## Open questions

Какие именно правки нужны (новое зеркало, пути, UI, публикация, версии).

## Next step

Дождаться списка правок от пользователя и править `src/popup.js` (и манифесты, если меняются домены или разрешения).

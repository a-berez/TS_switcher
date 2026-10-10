# Handoff: ручная публикация Chromium 1.1.0
Date: 2026-10-10
Left by: Codex

## Goal
Завершить публикацию Chromium 1.1.0 в Chrome Web Store. Владелец выбрал самостоятельную загрузку готового пакета.

## Done
Коммит `423357f` (`v1.1.0`) отправлен в main. GitHub Release 1.1.0 опубликован; четыре ZIP сверены с исходниками релизного коммита и digest. Firefox 1.1.0 опубликован в AMO: публичный API подтвердил версию и статус public 2026-10-10. Готовый Chromium ZIP скопирован из GitHub Release в `dist/publish-1.1.0/TS_switcher-1.1.0-chromium.zip`; описание версии — `release-notes.txt` рядом. Папка dist исключена из Git.

## Not done
Chrome Web Store отклонил OAuth-авторизацию до загрузки. Неверен хотя бы один из client_id/client_secret/refresh_token. Секреты не менялись. Ручную загрузку выполняет владелец; её результат пока неизвестен.

## Invariants
Не менять тег v1.1.0 и не перезапускать весь workflow: Firefox уже опубликован. В Chrome использовать существующую карточку TS_switcher, загрузить ZIP без внешней папки и без дополнительной упаковки. Не выводить значения секретов.

## Where to look
[Actions](https://github.com/a-berez/TS_switcher/actions/runs/38065538225), [GitHub Release](https://github.com/a-berez/TS_switcher/releases/tag/v1.1.0), [карточка Chrome](https://chromewebstore.google.com/detail/tsswitcher/kbfllpfigjilnlfhkalpbjoigkfplblk), `docs/status.md`.

## Verify
Chromium ZIP: manifest_version 3, version 1.1.0, 30 файлов, SHA256 `9681a69d1bde02d06a5196b6f803c8e2839c0ec7dae47a42a556feff7634ffa5`. После ручной загрузки проверить результат отправки и статус в магазине; принятие на проверку не равно публикации.

## Open questions
Когда Chrome Web Store примет и опубликует вручную отправленную версию.

## Next step
Владельцу загрузить подготовленный ZIP в кабинет Chrome Web Store и отправить обновление на публикацию.

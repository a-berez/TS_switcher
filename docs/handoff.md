# Handoff: публикация 1.1.1
Date: 2026-10-10
Left by: Codex

## Goal
Опубликовать 1.1.1 с зеркалами и независимым перехватом A2. Подготовить ZIP для ручной загрузки в CWS.

## Done
Коммит 2c7bbdd (v1.1.1) отправлен в main; GitHub Release опубликован с четырьмя проверенными ZIP. Версия повышена в обоих manifest и build.py; README и обе истории изменений обновлены. Проверки пройдены, оба ZIP собраны и сверены. Для CWS подготовлены dist/publish-1.1.1/TS_switcher-1.1.1-chromium.zip, release-notes.txt и SHA256SUMS.txt. Реализация и проверки описаны в status.md.

## Not done
Actions 38077008847 выполняет отправку AMO; шаг CWS ожидает. Публичный API AMO пока показывает 1.1.0. Нужно подтвердить итог магазина и workflow. Предыдущая автоматическая загрузка CWS отклонялась из-за OAuth; секреты не менялись.

## Invariants
Не менять прежние теги. Релиз запускается единственным коммитом v1.1.1 в main. Не отправлять тег отдельно: workflow создаст его сам. Если AMO уже принял версию, не перезапускать весь workflow ради CWS.

## Where to look
[Actions](https://github.com/a-berez/TS_switcher/actions/runs/38077008847), [релиз](https://github.com/a-berez/TS_switcher/releases/tag/v1.1.1), docs/status.md, dist/publish-1.1.1/.

## Verify
Проверить версию 1.1.1 и содержимое ZIP против релизного коммита, затем GitHub Release, Actions и отдельный результат каждого магазина.

## Next step
После отправки релизного коммита проверить Actions и зафиксировать результат.

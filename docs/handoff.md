# Handoff: авторизация Chrome Web Store
Date: 2026-10-04
Left by: Codex

## Goal
Завершить публикацию Chromium 1.0.0 в Chrome Web Store. GitHub Release и Firefox уже опубликованы.

## Done
Ветки слиты; тег v1.0.0 указывает на 6d6124c. AMO API подтверждает публичную версию 1.0.0. GitHub Release восстановлен отдельно из неизменённого тега, содержит четыре ZIP с проверенными digest. Workflow создаёт каталог XPI и публикует GitHub Release перед магазинами; audit-build проходит с новой регрессионной проверкой.

## Not done
CWS отклонил авторизацию: неверен минимум один из client_id/client_secret/refresh_token. Секреты не менялись. Новая отправка в магазины не запускалась.

## Invariants
Не менять тег v1.0.0 и не загружать заново уже опубликованную версию Firefox. Повтор старого workflow не применяет исправления нового main. Не выводить и не просить присылать значения секретов в чат.

## Where to look
[Отчёт о выпуске](publication-readiness-2026-10-04.md), `.github/workflows/tag-from-commit.yml`, [GitHub Secrets](https://github.com/a-berez/TS_switcher/settings/secrets/actions), [GitHub Release](https://github.com/a-berez/TS_switcher/releases/tag/v1.0.0).

## Verify
После восстановления авторизации выполнить только загрузку/публикацию Chromium и проверить результат CWS. Общий статус исходного Actions run — failure; успешный статус AMO-шага там не отражает ошибку скачивания XPI из-за continue-on-error.

## Open questions
Нужны действующие согласованные CWS_CLIENT_ID, CWS_CLIENT_SECRET и CWS_REFRESH_TOKEN в GitHub Secrets. Какое конкретно значение отвергнуто, лог не сообщает.

## Next step
Восстановить CWS OAuth-авторизацию и обновить соответствующие GitHub Secrets, затем выполнить отдельную отправку Chromium 1.0.0.

# Handoff: beta.7 fixes (tester feedback)
Date: 2026-08-29

Фиксы по отчёту тестера (Vivaldi 8.1 / Chromium 150).

## Сделано

1. **DNR (Chromium):** regex перехвата — все пути TS, кроме `/login` и `/logout` (раньше только главная + player/tournament/team).
2. **Bypass после switch:** убран tab-wide bypass 8 с; Chromium — DNR `allow` для `ts_switcher_direct=1`; Firefox — проверка query в `webRequest`.
3. **`convertPath`:** TS-цели сохраняют tail path + query; рейтинги — только канонический path.
4. **CSS:** в теме рейтингов ККТС приглушены, hover коричневый.
5. **README:** 8 host_permissions, благодарность авторам рейтингов, changelog beta.7.

## Verify

- preferred=info, логин на info/me: `rating.pecheny.me/venues/5508` → info с тем же path
- на `…/players/196160/statistics?role=narrator`: копия на TS — с `/statistics?role=…`; на `.gg` — `/b/player/196160/` без query
- после кнопки switch на TS — следующий клик по ссылке на другое зеркало перехватывается сразу
- `/login` на зеркале не перехватывается; после logout grace снимается
- попап на `.gg`: кнопки ККТС не доминируют визуально

## Не в scope beta.7

- Редирект логина при preferred=off (мысли на будущее).
- «Перехват сам выключился» без шагов воспроизведения.

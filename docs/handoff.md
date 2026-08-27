# Handoff: elo-chgk.uk
Date: 2026-08-27

`1.0.0-beta.5` в манифестах и `build.py`. Добавлен `elo-chgk.uk`; при уходе с elo query `sort`/`dir` отбрасываются.

Ранее в дереве: login-bounce A+B (`beta.4`).

## Verify

- с TS `/players/28751` → elo `/players/28751`; `/tournament/13017` → `/tournaments/13017`; `/teams/49804` → `/teams/49804`
- с elo `?sort=…&dir=…` на TS/другие рейтинги — без query сортировки
- с elo на `.gg` / `.fun` / `quest` и обратно
- options: видимость switch/copy для elo; попап показывает кнопку `elo`
- preferred=.me login-bounce сценарии из beta.4

# Правила разработки

Эти правила обязательны для разработчиков и AI-агентов, работающих с репозиторием.

## Версионирование

Проект использует [Semantic Versioning](https://semver.org/) в формате `MAJOR.MINOR.PATCH`.

- `PATCH` (`0.2.0` -> `0.2.1`) — исправления ошибок и небольшие внутренние изменения без новой пользовательской функциональности.
- `MINOR` (`0.2.1` -> `0.3.0`) — новая обратно совместимая функциональность, заметная переработка интерфейса или существующего сценария работы.
- `MAJOR` (`1.4.0` -> `2.0.0`) — несовместимые изменения публичных команд, настроек, API или форматов данных.
- Пока версия меньше `1.0.0`, несовместимое изменение повышает `MINOR`, а не `MAJOR`. Такое изменение обязательно отмечается в changelog.

Несколько исправлений не становятся `MINOR` только из-за их количества. Версия определяется влиянием изменений на пользователя.

### Подготовка релиза

1. Выбрать следующую версию по правилам выше.
2. Одинаково изменить `version` в `package.json`, `package-lock.json` и `packages[""].version` внутри lock-файла.
3. Добавить в начало `CHANGELOG.md` раздел `## [X.Y.Z] - YYYY-MM-DD` в формате Keep a Changelog.
4. Выполнить `npm run check:release`, затем `npm test` и `npm run package`.
5. Создать коммит `chore(release): prepare X.Y.Z` и тег `vX.Y.Z`.
6. Собрать VSIX в локальный каталог `releases/` и загрузить его через GitHub Releases. Каталог `releases/` и файлы `*.vsix` не коммитятся.

## Сообщения коммитов

Используем [Conventional Commits](https://www.conventionalcommits.org/):

```text
type(scope): short imperative description
```

Разрешённые типы:

- `feat` — новая пользовательская возможность;
- `fix` — исправление ошибки;
- `refactor` — изменение структуры без изменения поведения;
- `perf` — улучшение производительности;
- `docs` — документация;
- `test` — тесты;
- `build` — сборка и зависимости сборки;
- `ci` — автоматизация и CI;
- `chore` — обслуживание репозитория и релизы;
- `revert` — отмена предыдущего коммита.

Разрешённые области: `settings`, `logs`, `http-api`, `mcp`, `package-sync`, `database`, `explorer`, `production-tasks`, `webview`, `extension`, `release`, `repo`, `deps`, `tests`, `build`, `ci`.

Правила заголовка:

- область обязательна;
- описание пишется на английском, в нижнем регистре, без точки в конце;
- весь заголовок — не длиннее 72 символов;
- один коммит содержит одно логически завершённое изменение;
- в теле при необходимости объясняется причина решения, а не повторяется diff.

Примеры:

```text
feat(http-api): add request history
fix(logs): keep selected file after refresh
refactor(settings): use shared sidebar layout
chore(release): prepare 0.3.0
```

Несовместимое изменение отмечается `!` и поясняется в footer:

```text
feat(mcp)!: replace implicit client startup

BREAKING CHANGE: callers must start the client before listing tools.
```

## Локальная проверка

Один раз после клонирования выполните:

```powershell
npm run setup:hooks
```

Хук `commit-msg` автоматически проверит каждый новый коммит. Проверить отдельный заголовок вручную можно так:

```powershell
npm run check:commit -- "feat(settings): add compact navigation"
```

Нельзя коммитить секреты, временные профили, логи, сетевые дампы, базы диагностических инструментов и релизные артефакты. Перед коммитом обязательно проверяйте `git status` и `git diff --cached`.

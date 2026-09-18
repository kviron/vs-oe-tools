# Восточный Экспресс — инструменты разработчика

Расширение VS Code для разработки и сопровождения проектов Восточного Экспресса.

## Architecture

The extension is organized as a modular monolith with a small composition root:

- `src/extension.ts` is the VS Code entry point and contains no feature logic.
- `src/application` wires commands, views, services, and lifecycle subscriptions.
- `src/core` contains stable extension-wide identifiers and constants.
- `src/features/<feature>` owns models, view providers, panels, templates, and feature services.
- `src/infrastructure` owns external-system adapters such as `Vars.bat` configuration and PostgreSQL queries.
- `webview-ui` is a separate Vue 3 application built by Vite. Reusable controls come from the shadcn-vue registry under `webview-ui/src/components/ui`.

New large areas should be added as independent folders under `src/features`. A feature may depend on `core` and explicit infrastructure adapters; infrastructure must not depend on VS Code views. Keep SQL in repositories, webview markup in dedicated template modules, and command registration in the application layer.

Add UI primitives with `npx shadcn-vue@latest add <component>`; do not hand-build substitutes for components available in the registry. Webview code communicates with the extension host through the typed contracts in `src/core/webviewProtocol.ts`.

Полное описание текущей архитектуры, реализованных сценариев, интеграционных
границ и правил сопровождения находится в
[`docs/PROJECT_KNOWLEDGE_BASE.md`](docs/PROJECT_KNOWLEDGE_BASE.md).

Целевая архитектура развиваемой базы знаний для ИИ-агентов описана в
[`docs/KNOWLEDGE_PLATFORM.md`](docs/KNOWLEDGE_PLATFORM.md).

## Возможности

- Проводник пакетов, классов и объектов метаданных.
- Карточки классов, методов, атрибутов, свойств и объектов.
- Редактирование кода методов, модулей отчетов и SPU с поддержкой Windows-1251.
- Просмотр и редактирование DFM.
- Выполнение SQL и SQL-монитор.
- Синхронизация пакетов и просмотр SVN-изменений.
- Просмотр производственных задач.
- MCP-инструменты для безопасной работы ИИ-агентов с метаданными проекта, включая код методов и модулей отчетов, а также контролируемую привязку новых объектов к пакетам.

## Требования

- VS Code 1.134.0 или новее.
- Открытый проект Восточного Экспресса с доступными `Vars.bat` и `bin\\rdboadm.ini`.
- Доступ к PostgreSQL проекта для функций, работающих с метаданными.

## Настройки

- `vcVeTools.useFolderAsProjectRoot` — использовать открытую папку как корень проекта.
- `vcVeTools.databaseRole` — основная или тестовая база данных.
- `vcVeTools.databaseProfile` — профиль из `rdboadm.ini`.
- `vcVeTools.userId` — ID пользователя для журнала изменений.
- `vcVeTools.sqlMonitorCollectorPath` — путь к совместимому `OESQLMonCon.exe`.
- `vcVeTools.mcp.enabled` — включить локальный MCP-сервер расширения.

## Известные ограничения

- Часть функций зависит от конфигурации и доступности сервисов конкретного проекта Восточного Экспресса.
- SQL-монитор требует совместимую с версией клиента сборку `OESQLMonCon.exe`.

## Версия 0.1.0

Первая собранная версия расширения.

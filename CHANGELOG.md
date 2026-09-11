# Change Log

All notable changes to the "vc-ve-tools" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.101] - 2026-09-11

### Added

- Added a unified MCP tool catalog in the extension settings for built-in and client tools, including automatic discovery, caching, manual refresh, Russian descriptions, and compact source-colored tags.
- Added a native client log viewer and MCP tools for listing and reading East Express logs.
- Added an MCP tool for checking whether an object belongs to the expected package.

### Changed

- Client MCP startup through `OEExecTask.exe` now uses `Shell=Настройка`, allowing metadata-changing tools to run in configuration mode.
- Built-in tools that mutate database or project data are marked as deprecated ahead of their removal.
- Lifecycle method execution now passes the selected database profile through to the native client.

## [0.1.1] - 2026-09-10

### Added

- Added on-demand startup of the East Express client MCP through `OEExecTask.exe` when an agent requests its live tool catalog or invokes a client tool.
- Added automatic shutdown for a client MCP process started by the extension after an idle timeout.
- Added MCP guidance for consistent database-operation summaries with the database, action, result, object details, and a clickable East Express entity link when available.
- Added guidance to open an entity in the native East Express client through `open_client_entity` when the user asks to open or show it.
- Added lifecycle and navigation bridge coverage for starting the client MCP safely with the active database and host.

### Changed

- Changed the default client MCP address from `http://localhost:8080/mcp` to `http://localhost:8080`, while retaining normalization for the former local address.
- Unified client MCP and Postman HTTP capabilities in the client process and removed the separate Postman API controls from extension settings.
- Updated dynamic client tool descriptions to explain managed startup, idle shutdown, and confirmation requirements for mutating operations.

### Fixed

- Fixed client MCP database synchronization so a running server is restarted when its database differs from the selected extension profile.
- Fixed concurrent client MCP requests to share one startup operation instead of launching duplicate processes.

## [0.1.0] - 2026-09-09

- Initial release

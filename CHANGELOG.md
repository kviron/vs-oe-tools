# Change Log

All notable changes to the "vc-ve-tools" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.2.0] - 2026-09-14

### Added

- Added an HTTP API workspace for publishing one selected or all database `HttpMethods` through the native East Express test server, sending REST requests, inspecting headers and JSON responses, and navigating object IDs from response data.
- Added MCP tools for listing HTTP methods and explicitly starting, checking, calling, and stopping the temporary HTTP test server.
- Added searchable parameter suggestions for HTTP method requests and copy-ready request representations.
- Added shared shadcn-vue primitives used by the redesigned settings and diagnostic interfaces, including Sidebar, Sheet, Alert, Command, Dialog, Input Group, Spinner, and Tooltip.

### Changed

- Moved native logs into a dedicated panel section and opened selected files in reusable read-only editor tabs instead of rendering large log contents inside the list view.
- Increased the native-log read limit for practical inspection while retaining bounded file-size and line-count safeguards.
- Redesigned Settings around the project shadcn-vue design system with a responsive Sidebar, semantic status badges, alerts, loading indicators, grouped inputs, and clearer General, Databases, and AI/MCP sections.
- Changed client MCP access to an explicit `start_client_mcp` → `list_client_mcp_tools` → `call_client_mcp_tool` → `stop_client_mcp` lifecycle, while retaining the cached catalog for offline display.
- Added support for creating class-procedure methods through the existing validated method persistence path.
- Improved PKF reconstruction checks for meta-object identifiers and valid `file`/`data` sections.

### Fixed

- Added multi-login handling and stricter argument validation when starting native HTTP and MCP processes.
- Removed the unsupported public class-attribute creation MCP action so agents cannot invoke an incomplete package-binding workflow.
- Kept generated webview bundles intact while adding the new HTTP API and settings entry points.

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

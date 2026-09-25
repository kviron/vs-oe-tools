# Change Log

All notable changes to the "vc-ve-tools" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.7.0] - 2026-09-25

### Added

- Added automatic native compilation after saving a class method, with editor diagnostics and compilation history for editor and agent workflows.
- Added a shared table value filter for selected cells, including include and exclude shortcuts, visible filter state, and support for virtualized method lists.
- Added SQL highlighting inside tagged JavaScript and TypeScript template strings.
- Added package context and copyable class IDs to class details.

### Changed

- Reorganized extension startup, feature APIs, and MCP tools into focused modules while keeping startup stages explicit.
- Preserved rich text styling and embedded images in production task descriptions.
- Improved search and navigation across class, task, history, log, package, and settings views.

### Fixed

- Prevented concurrent DFM edits from silently overwriting a changed source.
- Improved database session and native client request handling, with targeted regression tests.

## [0.6.0] - 2026-09-18

### Added

- Added Windows-1251 report-module editing with audit history and package synchronization, plus guarded MCP tools for reading and replacing complete module source.
- Added an atomic MCP workflow for binding newly created metadata objects to a verified package file, with database identity checks, synchronization-state updates, and post-commit verification.
- Added zero-flag MCP runtime discovery for the active workspace, database profile, logs, SQL history, navigation bridge, and native-client endpoint while retaining explicit argument overrides.
- Added status-bar controls for the active database, quick client launch, and database updates. The client now starts `fme.exe` directly with validated optional arguments instead of relying on BAT wrappers.
- Added richer quick navigation across database objects, production tasks, packages, class-object views, source history, methods, and report modules.
- Added a scalable external Knowledge Platform contract, JSON Schema, validated example record, and package-time schema checks.

### Changed

- Redesigned SQL Monitor with compact cards, searchable multi-category filters, semantic states, sortable results, and clearer query details.
- Expanded the HTTP API response workbench with Body, Headers, Cookies, Raw, and Info views, formatted copying, response search, redirect metadata, and safe save-to-file handling.
- Extended code history to report modules and method-specific PKF revisions, with task references in comments and bounded concurrent SVN loading.
- Refined class-object, object, method-property, settings, Explorer, SQL, and package views around the shared responsive shadcn-vue table and detail patterns.
- Refactored the native HTTP executor so direct and listener modes share validation, parameter conversion, handler execution, and JSON serialization paths.

### Fixed

- Preserved ordinary browser text selection and copying outside the actively focused shared table, including `Ctrl+C` on Russian keyboard layouts.
- Made task-description ID references selectable and added a shared copy-ID action to task and object preview popovers without triggering navigation after text selection.
- Added a guarded temporary-file transport for oversized native `class_method_change` requests when the client advertises the required capability.
- Fixed mixed Meta/Data PKF reconstruction and default-value owner resolution without replacing unrelated owner sections.
- Prevented eager native-client MCP catalog refresh from destabilizing Extension Development Host startup; catalog refresh remains explicit.

## [0.5.0] - 2026-09-15

### Added

- Added native client MCP-backed creation and editing for class attributes, including schema validation, optimistic concurrency checks, readback verification, package-binding warnings, and guarded handling of uncertain mutation results.
- Added attribute actions to class cards and context menus for creating, opening, editing, copying IDs, and navigating to the owning class.

### Changed

- Redesigned attribute cards around the shared compact shadcn-vue interface with explicit view, edit, and creation states.
- Redesigned method property cards to show method metadata, highlighted signatures, owner and package context, responsive layout, and navigation to the separate source editor without embedding method code.

### Fixed

- Fixed production-task attachment loading for native `Smallint` flags such as `StoredFiles.Important`.
- Restored PNG and JPEG images embedded in the native `WorkDoc.Comment_Rich` RTF description while retaining plain-text fallback and object links.

### Removed

- **Breaking:** removed the extension MCP tool `create_class_method` and its navigation bridge action. Method creation from the extension UI and the native client MCP tool `class_method_add` remain available.

## [0.4.0] - 2026-09-15

### Added

- Added direct execution of selected HTTP API handlers through a separate native client process, retaining the parameter form, JSON inputs, native defaults, response viewer, and request history without starting an HTTP server.
- Added the native executor source and deployment instructions under `native/http-api/`. Direct execution requires the updated method 3200176 in the selected database; it does not emulate HTTP authentication, headers, or file streams.
- Added lossless parameter transport, execution timeouts, cancellation, and regression tests for direct calls and HTTP server switching, without automatic retries of potentially mutating handlers.

### Changed

- Made direct execution the default HTTP API panel mode while retaining the HTTP-server and manual-request workflows.
- **Breaking:** removed wildcard `*` startup for all HTTP methods; callers must select one exact method. The MCP HTTP request default changed from POST to GET; callers needing POST must specify it explicitly.

### Fixed

- Fixed template-handler execution, including `АнкетыСписок`, by supplying the selected HTTP object explicitly instead of relying on missing HTTP context, avoiding cache-object ID 0 in direct mode.
- Serialized HTTP server stop/start and switched automatically to the latest selected method, preventing stale method allowlists and overlapping starts.
- Restored the selected method's scroll position whenever the method picker opens and shared signature highlighting with the class-method view.
- Preserved HTTP verbs, headers, and request bodies across the extension MCP bridge.

## [0.3.0] - 2026-09-14

### Added

- Added a production-task workspace with responsible-user, status, project, priority, work-type, release, and overdue filters, configurable columns, summary metrics, and compact semantic badges.
- Added full production-task history details in an accessible modal opened from a history row, while keeping task and history tables single-line and scannable.
- Added HTTP API parameter documentation, reference-type hints, strict date/time controls, improved validation, and navigation from a selected method to its database object.
- Added eager class member counters, reusable class-member filtering controls, and distinct colored appearances for class groups in Explorer.

### Changed

- Redesigned Settings, HTTP API, production tasks, task details, class details, class objects, Explorer, and Package Sync around the shared compact shadcn-vue design system.
- Optimized production-task loading with a list-specific read-only query, server-side responsible-user filtering, independent user lookup, direct task-card loading, and longer query timeouts.
- Kept class detail panels alive while hidden and loaded tab counters with the class card so counts remain stable before and after tab navigation.
- Updated Hugeicons to 4.3.3 for the expanded semantic icon set.

### Fixed

- Fixed Package Sync database reconstruction for member-only meta-PKF files by resolving their owning class before serialization.
- Fixed production session import so a capture without a fresh client session key cannot silently replace only partial authentication data.
- Improved HTTP API handling for documented reference parameters and invalid calendar dates.

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

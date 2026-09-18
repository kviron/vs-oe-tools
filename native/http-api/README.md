# Direct HTTP API handler execution

`3200176.oe` is the source snapshot of
`RDBOHTTPServer.Разработка_HTTPТестСервер` (3200176). It is not a PKF import.
Deploy only through the native client MCP: verify the target database, read
`class_member_get`, save the complete source with `class_method_change`, then
read it back. Keep the existing package binding and synchronize via the normal
package workflow. The extension does not silently install database code.

## Sending large source code through client MCP

`class_method_change` still uses GET. If the encoded URL would exceed 16,000
characters, the extension checks `/health` for `methodCodeFile: vcve-code-file-v1`
and uses a one-use UTF-8 JSON file in the shared local OS temp directory.
The request carries only `arguments={"Member":"..."}` and a random 32-character
hex `codeToken`. The native adapter in `aiMCP.http_ProcessRequest` (12464784)
constructs the filename itself, checks the protocol and member, removes the
file, and delegates to the unchanged `class_method_change` tool.
Both numeric and string `Member` values are accepted by the extension and
normalized to the string form required by the file protocol.

This requires the updated native adapter and a client MCP restart. The file is
limited to 2 MiB including its JSON envelope. Other tools, remote servers, and
clients without this capability retain the existing URL limit. The extension
also removes unconsumed files on failure and never automatically retries a
mutation. Read the method back after any uncertain result.

The HTTP API panel defaults to direct execution. Each explicit invocation starts
one `OEExecTask.exe` using the configured project database and saved client login.
It passes only the selected method name and unique request/response file paths
to method 3200176. No listener, timer, modal window, or method allowlist switch is
needed. The legacy HTTP tab remains available.

## Parameters and result

The file protocol is `vcve-direct-v1`. Requests are ASCII-escaped JSON so the
native text reader preserves Unicode. Parameter values remain strings until
native metadata converts them; large IDs and leading zeros are not coerced in
JavaScript. Omitted parameters use native defaults. Unknown, duplicate and
missing required parameters fail before the handler is invoked.

JSON parameters support `wDynamicStorage` and `APIПараметр`. The latter is a
temporary object, populated by its own attribute names (not database field
names), with native type conversion and retained nested storage objects. Example:

```json
{"ЧислоСтрок":1,"СмещениеСтрок":0}
```

For the shared template handler 10893298, execution calls
`HttpМетодПоШаблону(selectedHttpObject).РассчитатьПоШаблону(...)` explicitly.
This avoids its dependency on `TryGetCurrentHttpMethod` and fixes ID 0 for this
family of methods. Other handlers are resolved from the selected HTTP object's
metadata and invoked normally. Results are UTF-8 JSON with a `result` property;
by-reference parameters are included under `outParameters` (object references
there are IDs, not recursively expanded objects).

## Boundaries

Direct execution is not an HTTP request: it does not reproduce HTTP headers,
authentication/session context or uploaded files. `HttpDataStream` parameters
and results are rejected before invocation. Other context-dependent handlers
may require an additional explicit adapter or a real HTTP endpoint. There is
no claim that every handler works without its native HTTP context.

Calls may modify data. There are no automatic retries or fallback invocations.
Timeout/cancellation cannot undo changes already made. Requests are limited to
1 MiB (before ASCII escaping), responses to 16 MiB, and execution to 120 seconds.
Per-call files are removed after process completion. Request history retains
parameter values locally in the webview, as with HTTP requests.

## Refactored source layout

The source now separates launch authorization, parameter conversion, handler
execution, and transport code:

- `CheckDeveloperAccess`: the existing username/role launch check.
- `ValidateParameterNames`, `BuildArguments`, `ConvertParameter`, and
  `CreateApiParameter`: shared validation, native defaults and JSON conversion.
- `ExecuteHandler` and `WriteResult`: one invocation and serialization path,
  retaining temporary objects through invocation and serialization.
- `ExecuteDirect`: the unchanged `vcve-direct-v1` file envelope.
- `ReadHttpParameters`, `RespondToHttpRequest`, and `RunHttpServer`: the legacy
  listener and HTTP response handling.

The HTTP branch now uses the same template-handler adapter and `APIПараметр`
conversion as the direct branch. Its successful response remains an unwrapped
JSON value; direct results retain `result` and `outParameters`. HTTP scalar
results are JSON-serialized rather than passed through `ToStr`.

This refactor does not resolve every review finding: the access check still
uses the supplied username, and the HTTP adapter still treats empty values as
omitted and gives `.json` precedence. Wildcard startup is blocked by the
extension, but the native listener's existing wildcard branch remains. These
behaviors require separate changes and native regression checks.

The refactored source must be compiled and smoke-tested in the native runtime
before it is considered verified. Recheck the following after deployment:

| Case | Expected result |
| --- | --- |
| Direct `mcpGetTools`, no parameters | Successful file envelope, unchanged catalog shape |
| Direct and HTTP `АнкетыСписок`, defaults and `ЧислоСтрок=1` | Successful template execution; one row with the limit |
| Direct and HTTP `APIПараметр` JSON | Native attribute conversion, not a storage object substituted for the parameter |
| Direct read-only `SQL_GetData` with Cyrillic and `00123` | Exact text and leading zeros retained |
| Direct unknown/duplicate/missing parameters | Error before invocation |
| HTTP method different from the allowed method | Error without invoking the handler |
| HTTP string/scalar result | Valid JSON without a `result` wrapper |
| Direct protocol/name mismatch | Error envelope; handler not invoked |

The native checks below describe the pre-refactor implementation, not the
refactored snapshot.

## Baseline verified on 2026-09-15

Native execution in `oetrunk`: `АнкетыСписок` with omitted/default parameters,
empty JSON, and `ЧислоСтрок=1` (one row); `mcpGetTools` without arguments;
`SQL_GetData` with a read-only SELECT returning Cyrillic and `00123`; missing
required SQL parameter rejected. Native tests used the existing extension launch
bridge with temporary test file paths, then restored and re-read this source.
The updated panel and Node executor have automated tests; these native checks
are not proof of a click-through in an installed updated Extension Host.

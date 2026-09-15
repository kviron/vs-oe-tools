# Direct HTTP API handler execution

`3200176.oe` is the source snapshot of
`RDBOHTTPServer.Разработка_HTTPТестСервер` (3200176). It is not a PKF import.
Deploy only through the native client MCP: verify the target database, read
`class_member_get`, save the complete source with `class_method_change`, then
read it back. Keep the existing package binding and synchronize via the normal
package workflow. The extension does not silently install database code.

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

## Verified on 2026-09-15

Native execution in `oetrunk`: `АнкетыСписок` with omitted/default parameters,
empty JSON, and `ЧислоСтрок=1` (one row); `mcpGetTools` without arguments;
`SQL_GetData` with a read-only SELECT returning Cyrillic and `00123`; missing
required SQL parameter rejected. Native tests used the existing extension launch
bridge with temporary test file paths, then restored and re-read this source.
The updated panel and Node executor have automated tests; these native checks
are not proof of a click-through in an installed updated Extension Host.

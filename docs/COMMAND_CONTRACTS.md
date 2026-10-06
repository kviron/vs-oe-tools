# Feature command contracts

Each feature's `commands.ts` declares a command schema and its typed handler
with `defineCommand`. `features/ai/commandRegistry.ts` composes the feature groups
and rejects duplicate names. It only changes when adding a new feature group.

`NavigationRequest` is a discriminated union inferred from these schemas. There
is no separate list of actions, optional field bag, validation-rule table or
per-command HTTP route. The HTTP boundary still checks its bearer token, request
size and method; dispatch uses the registered command. Parsing strips unrelated
fields and rejects invalid input before calling a handler.

`NavigationActions` is inferred from `createNavigationActions`, whose existing
feature factories supply the implementations. Adding an operation to one of
those factories does not require duplicating its signature in a central interface.
Commands and MCP may import only the dependency **type**, so the standalone MCP
process does not load VS Code or database mutation implementations.

## Adding a tool

1. Implement the operation in its feature/repository and expose it from the
   existing feature action factory if it needs Extension Host dependencies.
2. Add `defineCommand(schema, handler, tool)` to the feature's `commands.ts`.
   `tool.input` owns the public schema; `tool.prepare` maps public argument names
   and the selected connection to the command input. Reuse the same field schemas
   in both shapes. Put the description and mutation annotations here.
3. Add behavior tests for validation, dispatch and the operation's failure paths.

The generic MCP registrar discovers entries with tool metadata. No change to
the HTTP transport, `NavigationActions`, MCP domain registration list or central
description table is needed. Enum creation and editing use this complete path.

## Existing tools

All 32 bridge commands use feature-owned contracts. Twenty existing MCP adapters
reuse their feature schemas, preserving public argument aliases, defaults and
additional public size limits. Dedicated adapters remain where they implement
native client lifecycle, query confirmation, result processing or other existing
behavior. They are not forced through a generic implementation merely to reduce
file count. Tools that directly read the database do not use this bridge.

Enum repositories also validate against these schemas, eliminating independently
maintained DTO field lists and hand-written checks. Old wire action names and
response envelopes remain unchanged. The route tests now supply required database
fields explicitly; incomplete calls can no longer type-check as valid requests.

Validation includes real loopback HTTP bridge tests with stub actions, catalog
uniqueness, shared input limits, duplicate-command rejection, and enum transaction
tests. These tests do not demonstrate a running user's Extension Host or live DB
mutation.

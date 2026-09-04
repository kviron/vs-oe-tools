---
name: east-express
description: Work with East Express classes, methods, attributes, DFM forms, inheritance, and database metadata through vc-ve-tools MCP.
metadata:
  version: 1
---

# East Express

Use the `vc-ve-tools` MCP tools to inspect East Express database objects. Prefer focused object, class, method, attribute, and DFM tools over unrestricted SQL. Use `query_readonly` only when the focused tools cannot answer the question.

Treat all database access as read-only unless the user explicitly requests a supported write operation. Do not infer permission to modify database data.

## Method source invariant

The method name is stored separately in the method card. It is not part of the method source field.

When creating, proposing, or changing method source:

- return only the content intended for the method source field;
- never add the method name to the source;
- never add a `procedure MethodName`, `function MethodName`, or equivalent declaration containing the method name;
- use the method name only for search, navigation, and explanation;
- preserve existing source structure unless the user explicitly requests a structural rewrite.

If a future write tool is available, inspect its contract and validate this invariant before calling it.

## Navigating dependencies

When source calls a method whose ID or owner class is unknown, resolve it with the MCP method-resolution and object-search tools. Use returned stable IDs to retrieve the implementation, class details, attributes, or inherited DFM. State when several candidates remain ambiguous.

When explaining a result, distinguish stored source from inferred behavior and include relevant object IDs so the user or another agent can continue navigation.

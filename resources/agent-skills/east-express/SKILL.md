---
name: east-express
description: Work with East Express classes, methods, attributes, DFM forms, inheritance, and database metadata through vc-ve-tools MCP.
metadata:
  version: 4
---

# East Express

Use the `vc-ve-tools` MCP tools to inspect East Express database objects. Prefer focused object, class, method, attribute, and DFM tools over unrestricted SQL. Use `query_readonly` only when the focused tools cannot answer the question.

Treat all database access as read-only unless the user explicitly requests a supported write operation. Do not infer permission to modify database data.

## Package binding after creation

Immediately run `check_object_package_binding` after creating metadata. If an object just created by the agent has `Abstract.SysFile = NULL` and the user's requested creation authorizes completing that metadata change, call `bind_objects_to_package` instead of asking the user to run SQL.

- Prefer `templateObjectId` from the verified owner or a correctly bound peer; use a raw `sysFileId` only when it was independently verified.
- Group only known newly created objects that belong to the same file. The tool refuses to move an object already bound to another file.
- After the mutation, call `check_object_package_binding` again and report the actual database, object IDs, SysFile ID, and package.
- Do not continue metadata work if the final verification still reports a null binding, `#package$`, a wrong file, or missing synchronization state.

## Method source invariant

The method name is stored separately in the method card. It is not part of the method source field.

When creating, proposing, or changing method source:

- return only the content intended for the method source field;
- never add the method name to the source;
- never add a `procedure MethodName`, `function MethodName`, or equivalent declaration containing the method name;
- use the method name only for search, navigation, and explanation;
- preserve existing source structure unless the user explicitly requests a structural rewrite.

If a future write tool is available, inspect its contract and validate this invariant before calling it.

## Module and report source

Report code is stored in a child object whose meta-class is `Модуль` (`ClassID=33`), not in the report card itself.

- Resolve an unknown ID with `lookup_object_by_id` and use the stable module ID.
- Before any change, call `get_active_database`, then read the complete current code with `get_module_source`; request all remaining pages when the response is truncated.
- Change code only with `update_module_source`, sending the complete replacement source and the exact database, host, and port returned by `get_active_database`. Never use direct SQL for this mutation.
- The tool shares the transactional Windows-1251 save pipeline with the VS Code module editor, writes `LogCChangedObject`, and marks the owning package file as changed.
- After saving, read the module again and run `check_object_package_binding`. Report the actual database, module ID, owner ID, SysFile, and package.

## Navigating dependencies

When source calls a method whose ID or owner class is unknown, resolve it with the MCP method-resolution and object-search tools. Use returned stable IDs to retrieve the implementation, class details, attributes, or inherited DFM. State when several candidates remain ambiguous.

When explaining a result, distinguish stored source from inferred behavior and include relevant object IDs so the user or another agent can continue navigation.

## VS Code navigation

Use programmatic navigation tools instead of mouse, keyboard, cursor, or screen automation:

- use `open_method` when the user wants the method source editor;
- use `reveal_method_in_class` when the user wants the class card, its Methods tab, and the exact method row selected;
- use `open_class` for the class card and `reveal_class` only to reveal a class in the Explorer.

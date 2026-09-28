---
name: east-express
description: Use East Express project tools and internal knowledge when answering questions about its classes, methods, metadata, builds, releases, and development rules through vc-ve-tools MCP.
metadata:
  version: 13
---

# East Express

## Completed task history

When the user gives a production task number or a link such as `https://r.oe-it.ru/88405`, take `88405` from the URL path as the task reference. Do not use web search to discover the task. First call `search_completed_tasks` with that exact reference and read any matching history with `get_completed_task`. Then call `get_production_task` with `query: "88405"` to obtain the complete current task card from the East Express API, including its description and status. Do this even when local history exists: it records what was done, while the task card supplies the original requirements and current context. If local history has no match, continue directly to `get_production_task`. If the task API is unavailable, say which context is missing and use only the available history without presenting it as the full task card.

Treat task history as historical context. Verify current code and database state before using it as current evidence. If the task card and history disagree, show the difference.

For SVN evidence, read `get_task_svn_commits` by the exact task number. It searches the shared SQLite commit cache across workspaces and does not require a local task-history record. Inspect `scans` to see where and when SVN was checked. If a scan is absent or stale, call `refresh_task_svn_commits` with the relevant SVN workspace path when needed, then inspect the returned repository, revision, author, date, message, and changed paths. The task number must lead the commit's first nonempty message line; aggregate merge comments listing many tasks do not establish task ownership. A matching commit is historical evidence, not proof of deployed code. Report SVN discovery or access errors instead of inventing commits.

As soon as work on a task begins, call `save_task_progress` with its number, title, what is currently known, and status `in_progress`. Add its task card as a source when available. Update the same record with `save_task_progress` after meaningful progress, decisions, errors, or verification; use status `blocked` only when work is actually blocked. When the task is finished, call `save_completed_task` to change its status to `completed` and save one concise but complete final outcome. Include exact task number, changed object and file IDs or paths, actual verification and its limits, database profile where applicable, and source references. If the task has no production number, use a stable project-specific identifier such as an issue number or dated slug. Do not call a build or saved file a runtime verification.

Follow `docs/WORK_HISTORY_CONTRACT.md` in the vc-ve-tools repository for the full local-record contract. Keep `summary` to 1–3 sentences; write concise Markdown in `progress`, `changes`, `verification`, and `limitations` with lists, exact IDs and paths in backticks, and fenced code with a language only when needed. `changes` says what actually changed; `verification` says what was actually checked and where; `limitations` says what remains unverified or unpublished. Put stable entity IDs, concrete changes, checks, and decisions in their separate MCP tables, not only in the summary. Never paste secrets, full logs, or large source files into history. `completed` is a local work status and must not imply that the production card was closed or package files synchronized.

For every saved method source snippet, resolve and record the exact method ID first. Write `Метод ID: 123456` immediately above its fenced code block and use a fence such as ` ```pascal method=123456` or ` ```pkf method=123456` (without the leading space). Link the same ID with `link_task_entity` using `entityType: "method"`. The UI displays that ID above the code and opens it on click. Never substitute the task number or class ID for an unknown method ID; if resolution fails, state that the method ID is unknown and do not present the snippet as linked to a verified method.

After each successful task save or status change, tell the user briefly that the task record was saved in the local SQLite history and give its number and new status. Do not claim it was saved if the tool failed. The progress record may exist before the task is complete; do not describe `in_progress` as completed.

Use `record_work_event` for meaningful intermediate outcomes. Link verified object IDs with `link_task_entity`; use `record_task_change` for concrete changes and source revisions, `record_task_verification` for checks and their actual outcomes, and `record_task_decision` when the reason for a choice will matter later. Read these together with `get_task_context`. Before changing a known object, `find_tasks_for_entity` can reveal its earlier task history. MCP calls are logged separately without arguments or result bodies.

When a task yields a reusable rule or procedure, add a reviewable candidate with `propose_task_knowledge`. Use `search_task_knowledge` to review the pending queue periodically. A candidate is not verified knowledge. After the user authorizes publication through the available knowledge workflow, verify the saved article and its reference, mark the candidate with `review_task_knowledge`, then call `mark_task_knowledge_transferred` for the task when its knowledge extraction is complete. The task remains searchable. Never mark transfer based only on a proposed article.

Use the `vc-ve-tools` MCP tools to inspect East Express database objects. Prefer focused object, class, method, attribute, and DFM tools over unrestricted SQL. Use `query_readonly` only when the focused tools cannot answer the question.

## Internal knowledge

For questions about East Express development rules, build and release procedures, or other internal documentation, search the knowledge base with `knowledge__weaviate-query-hybrid`. Use the configured collection unless the user names another. Ground the answer in relevant results and identify the document or source returned by the tool. If the service is unavailable or no relevant result is found, say so instead of inventing a rule.

Knowledge documents describe procedures; verify the current project, active database, and live object state with the appropriate extension or `client__` tools before reporting them as current facts. Use the `client__` tools directly when they provide the needed native capability. The gateway handles their startup and cleanup.

Write or update knowledge with `knowledge__weaviate-objects-upsert` only when the user explicitly asks to record or change knowledge. Check the target collection and intended content before the write, then verify the saved result.

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

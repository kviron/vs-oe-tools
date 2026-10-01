---
name: map-workflow
description: Build and review editable relationship maps, then reconcile user changes with code or other systems when explicitly requested.
---

# Relationship maps

Use the `relationship-map` MCP tools to list, read, save, and compare maps. A map is a description of entities and relationships, not an executable workflow.

When building a map, inspect the relevant source first. Make each node short, give stable IDs, and attach `sourceRefs` or a verified `file` link when possible. Mark inferred or proposed nodes clearly; never present them as implemented behavior.

Use `kind` for the semantic node type, with map-local `nodeKinds` and `edgeKinds` for labels/colors/icons. Use `entityRef` (`system`, `type`, `id`, optional `scope`) for the source system's stable identity. Add node-local `attributes` when a node needs more detail; invent field names appropriate to the actual entity, such as `Сигнатура`, `Контракт`, `Ответственность`, `Вход`, `Выход`, or `Инварианты`. Their values can be multiline strings. These fields appear only in the inspector, not on canvas cards. Keep `title` and `description` short. Do not invent signatures or contracts as verified facts: derive them from source or mark inferred content clearly. A `calls` edge needs evidence from source inspection or a trustworthy call index; a matching method name alone is insufficient. Put source evidence on the node or edge. Keep layout (`x`, `y`) separate from semantics.

For an East Express class map, first prove the active database/profile. Read the class and enumerate its actual methods using the available native-client or extension MCP tools. Store exact class and method IDs in `entityRef`, and the database/profile in `scope`. Link class to methods with `contains`. Inspect method source and resolve references before adding `calls`; mark unresolved or inferred links as proposals. Do not modify database metadata while merely building a map. A saved map is not proof that methods compile or run.

Read the map before saving and pass its exact `revision` as `expectedRevision`. Use `null` only when creating a new map. If saving reports a revision conflict, reread the map and reconcile the user's changes before retrying.

When the user edits a map, use `get_map_changes` with the revision observed before their edit. Explain added, removed, and changed nodes and links. A moved node normally changes layout only; do not infer a code change from coordinates alone.

If the user asks to implement a revised architecture, trace the affected code and propose the smallest contracts and behavior-safe sequence. Apply code, database, or external changes only under the user's actual authorization and the target repository's rules. The map never automatically mutates those systems.

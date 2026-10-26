# MCP task catalogue pages

Before refactoring: `taskPage` owns strict date/cursor validation and a lightweight read-only query; `productionOenpRepository` owns protocol execution; `agent` owns source selection and response paging; command/MCP registrations expose only these contracts. No metadata changes.

`get_production_tasks_page` accepts optional paired `created_from` / `created_to` (inclusive ISO calendar dates), `after_id` and `limit` 1–99. Results are ordered by descending stable ID. Request limit+1 detects the next page without a global count. `next_after_id` is the last returned ID only when more records exist. No descriptions, attachment counts or graph aggregation in the catalogue. Individual cards retain their history contract. Concurrent changes to existing records are not a database snapshot; later-created IDs above the first page are not included on subsequent pages.

The public tasks MCP cannot guarantee date paging: reject this operation explicitly on that backend instead of treating a bounded public list as complete. Existing general MCP listing also uses lightweight server-side bounds for OENP.

The captured OENP query envelope caps returned rows at 100. Page size must be at most 99 so the lookahead row is never truncated. Studio uses 50. Never infer end-of-list from a request for 100+lookahead.

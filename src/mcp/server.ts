import { registerTools } from './tools';
import { readRoleArgument } from './arguments';

// Runtime SDK imports keep this entrypoint compatible with the extension's Node16 tsconfig.

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

readRoleArgument();

const server = new McpServer(
	{ name: 'vc-ve-tools-database', version: '0.22.0' },
	{
		instructions: [
			'For every user-facing database operation summary, use a consistent compact format: Database, Action, Result, Object when applicable, and Link when the tool returns an East Express entity URL. Preserve useful additional details after these fields. Do not claim success when the tool reports an error; if verification shows a partial side effect, state both the error and the verified state.',
			'Render returned East Express entity refs as clickable Markdown links. When the user asks to open, show, or navigate to an entity in the native East Express client, call open_client_entity with its exact type, stable ID, and the role matching the active database. Do not open the native client unless the user requests it.',
			'East Express method names are stored separately in method cards and must never be inserted into method source. Preserve the complete anonymous proc/procedure/func/function wrapper returned by get_method_source.',
			'Use focused tools before query_database when they answer the question. Resolve unknown calls with method resolution and object search tools, then follow returned stable IDs.',
			'Before database work, use get_active_database when the intended database matters. Use list_databases and switch_database to select another rdboadm.ini profile without restarting this MCP server.',
			'Use get_class_dictionary for paged dictionary rows and search_class_dictionary to find elements by ID, name, or any mapped class attribute.',
			'Use get_class_properties to inspect script properties declared by a class and optionally inherited from ancestors. Use get_property_details for the complete stored record.',
			'Before update_method_source, read the complete current source with get_method_source. Send the complete replacement including its anonymous declaration wrapper, but never add the method card name.',
			'For East Express metadata, prefer the live native client MCP for creation and changes. Use extension MCP mutations only when the native client lacks the required operation. create_class_method_checked uses native class_method_add and class_method_change, while update_method_source prefers native class_method_change before falling back to the extension save pipeline. Both compile before returning. Inspect compilation.passed, errors, and warnings; if passed is false, fix the requested method and check again. After direct native client method mutations, invoke compile_method separately before claiming completion. The check is saved and can be read with get_method_compilation_history. Verify the active database first; a saved method is not proof that compilation passed.',
			'Before update_module_source, call get_active_database, verify the object with lookup_object_by_id, and read the complete current source with get_module_source. Send the complete replacement module source and the exact expected database, host, and port. This tool supports report code stored in Модуль objects with ClassID 33.',
			'Use execute_lifecycle_method to run the allowlisted static Функции_ЖЦ.СоздатьПараметрИПраво method immediately through OEExecTask. Verify the active database first. This creates lifecycle metadata directly and does not create an SPU.',
			'Use get_package_sync_changes to inspect the same changed-object list shown by package synchronization; it returns metadata and paths, never file contents.',
			'Immediately after a user creates or saves an East Express metadata object, call check_object_package_binding with its stable ID and the source object ID when it was cloned. Treat Abstract.SysFile = NULL, placement in #package$, a missing SysPackageBase state, or a file mismatch as an error: warn the user with concrete object and file IDs before continuing.',
			'When check_object_package_binding reports Abstract.SysFile = NULL for objects just created by the agent, use bind_objects_to_package without asking for a manual SQL query. Prefer a verified templateObjectId from the intended owner or peer. The tool may bind multiple known new objects atomically, but it must never be used to move an object already bound to a different SysFile. Re-run check_object_package_binding after the mutation and report the actual database, object IDs, SysFile, and package.',
			'Use get_production_task to find a task across production by its ID, task number, or title and return the complete card. Use get_production_tasks only for the current employee compact task list and get_production_tasks_in_progress for complete cards currently in status В работе. These calls use the production OENP session held by the VS Code extension.',
			'Use get_recent_sql_queries to inspect the last 500 filtered queries captured by the SQL monitor without generating additional database traffic.',
			'For client MCP work, always call start_client_mcp first, then list_client_mcp_tools to refresh the live catalog, call the required tools with their exact live schemas, and call stop_client_mcp in cleanup even when discovery or invocation fails. The extension cache is only for offline display and must not replace live discovery before an invocation. Never use list_client_mcp_tools as a server-start command. Some client tools mutate data; invoke those only when the user explicitly requests the action.',
			'For East Express REST testing, call start_http_test_server with one exact method name, use call_http_test_server for requests, and always call stop_http_test_server in cleanup even when a request fails.',
			'For VS Code navigation, use open_method for the source editor and reveal_method_in_class to select a method on the owning class Methods tab. Never use cursor or screen automation for these actions.',
			'Use query_database for unrestricted PostgreSQL statements. Read queries run immediately. If it returns requiresApproval, show the user the exact SQL and active database, ask for explicit approval in conversation, and wait for their answer. Only after approval call query_database again with the unchanged SQL and approvalToken; the user must also confirm the exact SQL in the VS Code modal. Never infer approval from the token or a prior unrelated request. Include relevant object IDs in analysis so navigation can continue.',
		].join(' '),
	},
);

registerTools(server);

async function main(): Promise<void> {
	await server.connect(new StdioServerTransport());
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

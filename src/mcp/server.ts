import { registerTools } from './tools';
import { readArgument, readRoleArgument } from './arguments';

// Runtime SDK imports keep this entrypoint compatible with the extension's Node16 tsconfig.

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

readArgument('--workspace');
readRoleArgument();

const server = new McpServer(
	{ name: 'vc-ve-tools-database', version: '0.22.0' },
	{
		instructions: [
			'For every user-facing database operation summary, use a consistent compact format: Database, Action, Result, Object when applicable, and Link when the tool returns an East Express entity URL. Preserve useful additional details after these fields. Do not claim success when the tool reports an error; if verification shows a partial side effect, state both the error and the verified state.',
			'Render returned East Express entity refs as clickable Markdown links. When the user asks to open, show, or navigate to an entity in the native East Express client, call open_client_entity with its exact type, stable ID, and the role matching the active database. Do not open the native client unless the user requests it.',
			'East Express method names are stored separately in method cards and must never be inserted into method source. Preserve the complete anonymous proc/procedure/func/function wrapper returned by get_method_source.',
			'Use focused read-only tools before query_readonly. Resolve unknown calls with method resolution and object search tools, then follow returned stable IDs.',
			'Before database work, use get_active_database when the intended database matters. Use list_databases and switch_database to select another rdboadm.ini profile without restarting this MCP server.',
			'Use get_class_dictionary for paged dictionary rows and search_class_dictionary to find elements by ID, name, or any mapped class attribute.',
			'Use get_class_properties to inspect script properties declared by a class and optionally inherited from ancestors. Use get_property_details for the complete stored record.',
			'Before update_method_source, read the complete current source with get_method_source. Send the complete replacement including its anonymous declaration wrapper, but never add the method card name.',
			'Use create_class_attribute only for virtual attributes. It runs through the VS Code extension, allocates a developer ID, writes audit history, links the package file, updates the owning class version, and opens the created attribute card.',
			'Use create_class_method to create an interpreted method through the controlled VS Code database transaction. It mirrors the persistence side effects of Функции_Объект.СоздатьМетод (11148540), then opens the new source in the editor.',
			'Use execute_lifecycle_method to run the allowlisted static Функции_ЖЦ.СоздатьПараметрИПраво method immediately through OEExecTask. Verify the active database first. This creates lifecycle metadata directly and does not create an SPU.',
			'Use get_package_sync_changes to inspect the same changed-object list shown by package synchronization; it returns metadata and paths, never file contents.',
			'Immediately after a user creates or saves an East Express metadata object, call check_object_package_binding with its stable ID and the source object ID when it was cloned. Treat Abstract.SysFile = NULL, placement in #package$, a missing SysPackageBase state, or a file mismatch as an error: warn the user with concrete object and file IDs before continuing.',
			'Use get_production_task to find a task across production by its ID, task number, or title and return the complete card. Use get_production_tasks only for the current employee compact task list and get_production_tasks_in_progress for complete cards currently in status В работе. These calls use the production OENP session held by the VS Code extension.',
			'Use get_recent_sql_queries to inspect the last 500 filtered queries captured by the SQL monitor without generating additional database traffic.',
			'Use list_client_mcp_tools to discover the live tool catalog exposed by the running East Express client on localhost. Use call_client_mcp_tool with the exact returned name and schema. Some client tools mutate data; invoke those only when the user explicitly requests the action.',
			'For VS Code navigation, use open_method for the source editor and reveal_method_in_class to select a method on the owning class Methods tab. Never use cursor or screen automation for these actions.',
			'Direct SQL access is read-only. Controlled mutations are available only through update_method_source, create_class_method, create_class_attribute, and explicitly confirmed update_database, update_packages, and update_binaries commands in VS Code. Project updates run in a visible terminal. Include relevant object IDs in analysis so navigation can continue.',
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

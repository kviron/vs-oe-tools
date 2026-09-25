import type { ServerResponse } from 'node:http';
import type { ClassAttributeDraft } from '../classes/models';
import type { NavigationActions } from './navigationTools';
import type { NavigationAction, NavigationRequest } from './navigationRequest';

type Handler = (input: NavigationRequest, actions: NavigationActions) => Promise<Record<string, unknown>>;

const handlers = {
	confirm_sql_mutation: async (input, actions) => ({ approved: await actions.confirmSqlMutation(input.sql!, input.database!) }),
	reveal_class: async (input, actions) => {
		await actions.revealClass(input.id!);
		return { id: input.id };
	},
	open_class: async (input, actions) => {
		await actions.revealClass(input.id!);
		await actions.openClass(input.id!);
		return { id: input.id };
	},
	open_method: async (input, actions) => {
		await actions.openMethod(input.id!);
		return { id: input.id };
	},
	reveal_method: async (input, actions) => {
		await actions.revealMethod(input.classId!, input.id!);
		return { id: input.id };
	},
	update_method_source: async (input, actions) => actions.updateMethodSource(input.id!, input.code!,
		input.expectedDatabase!, input.expectedHost!, input.expectedPort!),
	update_module_source: async (input, actions) => actions.updateModuleSource(input.id!, input.code!,
		input.expectedDatabase!, input.expectedHost!, input.expectedPort!),
	compile_method: async (input, actions) => ({ result: await actions.compileMethod(input.id!,
		input.expectedDatabase!, input.expectedHost!, input.expectedPort!) }),
	get_method_compilation_history: async (input, actions) => actions.getMethodCompilationHistory(input.id, input.limit ?? 50),
	bind_objects_to_package: async (input, actions) => actions.bindObjectsToPackage({
		objectIds: input.objectIds!, templateObjectId: input.templateObjectId,
		sysFileId: input.sysFileId, expectedDatabase: input.expectedDatabase!,
		expectedHost: input.expectedHost!, expectedPort: input.expectedPort!,
	}),
	create_class_attribute: async (input, actions) => actions.createClassAttribute(input.draft as ClassAttributeDraft),
	execute_lifecycle_method: async (input, actions) => actions.executeLifecycleMethod(input.id!, input.methodParameter!,
		input.database!, input.host!),
	start_client_mcp: async (input, actions) => actions.startClientMcp(input.database!, input.host!),
	start_http_test_server: async (input, actions) => actions.startHttpTestServer(input.methodParameter!),
	stop_http_test_server: async (_input, actions) => actions.stopHttpTestServer(),
	get_http_test_server_status: async (_input, actions) => actions.getHttpTestServerStatus(),
	call_http_test_server: async (input, actions) => actions.callHttpTestServer({
		method: input.httpMethod!, methodName: input.methodParameter,
		headers: input.headers, body: input.body,
	}),
	get_svn_file_history: async (input, actions) => actions.getSvnFileHistory(input.filePath!, input.limit!),
	get_package_sync_changes: async (input, actions) => actions.getPackageSyncChanges(input.query, input.offset!, input.limit!),
	get_production_tasks: async (input, actions) => actions.getProductionTasks(input.query, input.limit!),
	get_production_task: async (input, actions) => actions.getProductionTask(input.query!, input.limit!),
	get_production_tasks_in_progress: async (_input, actions) => actions.getProductionTasksInProgress(),
	update_packages: async (_input, actions) => ({ launched: await actions.updatePackages() }),
	update_binaries: async (_input, actions) => ({ launched: await actions.updateBinaries() }),
	update_database: async (input, actions) => {
		await actions.updateDatabase(input.role!);
		return { role: input.role };
	},
	start_client: async (input, actions) => {
		await actions.startClient(input.role!);
		return { role: input.role };
	},
	open_client_entity: async (input, actions) => ({
		role: input.role, entityType: input.entityType, id: input.id,
		uri: await actions.openClientEntity(input.role!, input.entityType!, input.id!),
	}),
} satisfies Record<NavigationAction, Handler>;

export async function dispatchNavigationRequest(input: NavigationRequest, response: ServerResponse, actions: NavigationActions): Promise<void> {
	const result = await handlers[input.action](input, actions);
	respond(response, 200, { ok: true, action: input.action, ...result });
}

export function respond(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
	response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(body));
}

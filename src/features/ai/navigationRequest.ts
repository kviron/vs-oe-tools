import type { ClassAttributeDraft } from '../classes/models';
import { isNavigationAction, validateActionFields } from './navigationRequestRules';

export type NavigationAction = 'reveal_class' | 'open_class' | 'open_method' | 'reveal_method' | 'update_method_source' | 'update_module_source'
	| 'compile_method' | 'get_method_compilation_history'
	| 'bind_objects_to_package'
	| 'get_svn_file_history' | 'get_package_sync_changes' | 'update_database' | 'start_client'
	| 'open_client_entity' | 'get_production_tasks' | 'get_production_task' | 'get_production_tasks_in_progress'
	| 'update_packages' | 'update_binaries' | 'create_class_attribute' | 'execute_lifecycle_method' | 'start_client_mcp'
	| 'start_http_test_server' | 'stop_http_test_server' | 'get_http_test_server_status' | 'call_http_test_server'
	| 'confirm_sql_mutation';

export interface NavigationRequest {
	action: NavigationAction;
	id?: number;
	classId?: number;
	code?: string;
	sql?: string;
	objectIds?: number[];
	templateObjectId?: number;
	sysFileId?: number;
	expectedDatabase?: string;
	expectedHost?: string;
	expectedPort?: number;
	filePath?: string;
	limit?: number;
	query?: string;
	offset?: number;
	role?: 'main' | 'test';
	entityType?: string;
	draft?: ClassAttributeDraft;
	methodParameter?: string;
	database?: string;
	host?: string;
	httpMethod?: string;
	headers?: Record<string, string>;
	body?: string;
}

export function validateRequest(value: unknown): NavigationRequest {
	if (!value || typeof value !== 'object') {
		throw new Error('Invalid navigation request.');
	}
	const input = value as Partial<NavigationRequest>;
	const { action, id, classId, code, sql, objectIds, templateObjectId, sysFileId, expectedDatabase, expectedHost, expectedPort,
		filePath, limit, query, offset, role, entityType, draft, methodParameter, database, host, httpMethod, headers, body } = input;
	if (!isNavigationAction(action)) {
		throw new Error('Unknown navigation action.');
	}
	validateActionFields(action, input);
	return { action, id, classId, code, sql, objectIds, templateObjectId, sysFileId, expectedDatabase, expectedHost, expectedPort,
		filePath, limit, query, offset, role, entityType, draft, methodParameter, database, host, httpMethod, headers, body };
}

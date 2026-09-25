import { createLifecycleParameterMethodId } from '../lifecycle/lifecycleMethodExecution';
import type { NavigationAction, NavigationRequest } from './navigationRequest';

type Input = Partial<NavigationRequest>;
type Rule = (input: Input) => string | undefined;
interface ActionRules {
	requiresId?: true;
	rules?: readonly Rule[];
}

const valid = (test: (input: Input) => boolean, message: string): Rule => input => test(input) ? undefined : message;
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const port = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 65535;
const nonempty = (value: unknown): boolean => typeof value === 'string' && Boolean(value.trim());
const databasePattern = /^[\p{L}\p{N}_.-]+$/u;
const hostPattern = /^[\p{L}\p{N}_.:-]+$/u;

const code = (action: NavigationAction): Rule => valid(input => typeof input.code === 'string', `Code must be a string for ${action}.`);
const expectedConnection = (action: NavigationAction): Rule => valid(input =>
	nonempty(input.expectedDatabase) && nonempty(input.expectedHost) && port(input.expectedPort),
	`expectedDatabase, expectedHost and expectedPort are required for ${action}.`);
const connectionField = (action: NavigationAction, field: 'database' | 'host', pattern: RegExp): Rule => valid(input =>
	typeof input[field] === 'string' && pattern.test(input[field]), `${field} is invalid for ${action}.`);
const role = (action: NavigationAction): Rule => valid(input => input.role === 'main' || input.role === 'test',
	`Role must be main or test for ${action}.`);
const integerRange = (field: 'limit' | 'offset', min: number, max: number): ((input: Input) => boolean) =>
	input => Number.isSafeInteger(input[field]) && input[field]! >= min && input[field]! <= max;

const connectionRules = (action: NavigationAction): Rule[] => [
	connectionField(action, 'database', databasePattern),
	connectionField(action, 'host', hostPattern),
];

export const navigationRequestRules = {
	confirm_sql_mutation: { rules: [valid(input => nonempty(input.sql) && nonempty(input.database),
		'SQL and database are required for confirm_sql_mutation.')] },
	reveal_class: { requiresId: true },
	open_class: { requiresId: true },
	open_method: { requiresId: true },
	reveal_method: { requiresId: true, rules: [valid(input => positiveId(input.classId),
		'Navigation classId must be a positive integer for reveal_method.')] },
	update_method_source: { requiresId: true, rules: [code('update_method_source'), expectedConnection('update_method_source')] },
	update_module_source: { requiresId: true, rules: [code('update_module_source'), expectedConnection('update_module_source')] },
	compile_method: { requiresId: true, rules: [expectedConnection('compile_method')] },
	get_method_compilation_history: { rules: [valid(input =>
		(input.id === undefined || positiveId(input.id))
		&& (input.limit === undefined || integerRange('limit', 1, 100)(input)),
		'Invalid method ID or limit for get_method_compilation_history.')] },
	bind_objects_to_package: { rules: [
		valid(input => Array.isArray(input.objectIds) && input.objectIds.length >= 1 && input.objectIds.length <= 100
			&& input.objectIds.every(positiveId), 'objectIds must contain 1 to 100 positive integers for bind_objects_to_package.'),
		valid(input => (input.templateObjectId === undefined) !== (input.sysFileId === undefined),
			'Exactly one of templateObjectId or sysFileId is required for bind_objects_to_package.'),
		valid(input => nonempty(input.expectedDatabase), 'expectedDatabase is required for bind_objects_to_package.'),
		valid(input => nonempty(input.expectedHost) && port(input.expectedPort),
			'expectedHost and expectedPort are required for bind_objects_to_package.'),
	] },
	create_class_attribute: { rules: [valid(input => Boolean(input.draft) && typeof input.draft === 'object',
		'draft is required for create_class_attribute.')] },
	execute_lifecycle_method: { requiresId: true, rules: [
		valid(input => nonempty(input.methodParameter), 'methodParameter is required for execute_lifecycle_method.'),
		input => input.id === createLifecycleParameterMethodId ? undefined
			: `Method ${input.id} is not allowlisted for execute_lifecycle_method.`,
		...connectionRules('execute_lifecycle_method'),
	] },
	start_client_mcp: { rules: connectionRules('start_client_mcp') },
	start_http_test_server: { rules: [valid(input => nonempty(input.methodParameter),
		'An exact methodName is required for start_http_test_server.')] },
	stop_http_test_server: {},
	get_http_test_server_status: {},
	call_http_test_server: { rules: [
		valid(input => nonempty(input.httpMethod), 'httpMethod is required for call_http_test_server.'),
		valid(input => input.headers === undefined || Boolean(input.headers) && typeof input.headers === 'object'
			&& !Array.isArray(input.headers) && Object.values(input.headers).every(header => typeof header === 'string'),
			'HTTP headers must be an object with string values.'),
		valid(input => input.body === undefined || typeof input.body === 'string', 'HTTP body must be a string.'),
	] },
	get_svn_file_history: { rules: [
		valid(input => nonempty(input.filePath), 'filePath is required for get_svn_file_history.'),
		valid(integerRange('limit', 1, 500), 'SVN history limit must be an integer from 1 to 500.'),
	] },
	get_package_sync_changes: { rules: [
		valid(input => input.query === undefined || typeof input.query === 'string', 'Package synchronization query must be a string.'),
		valid(integerRange('offset', 0, Number.MAX_SAFE_INTEGER), 'Package synchronization offset must be a non-negative integer.'),
		valid(integerRange('limit', 1, 500), 'Package synchronization limit must be an integer from 1 to 500.'),
	] },
	get_production_tasks: { rules: [
		valid(input => input.query === undefined || typeof input.query === 'string', 'Production tasks query must be a string.'),
		valid(integerRange('limit', 1, 250), 'Production tasks limit must be an integer from 1 to 250.'),
	] },
	get_production_task: { rules: [
		valid(input => nonempty(input.query), 'Production task query must be a non-empty string.'),
		valid(integerRange('limit', 1, 25), 'Production task search limit must be an integer from 1 to 25.'),
	] },
	get_production_tasks_in_progress: {},
	update_packages: {},
	update_binaries: {},
	update_database: { rules: [role('update_database')] },
	start_client: { rules: [role('start_client')] },
	open_client_entity: { requiresId: true, rules: [role('open_client_entity'),
		valid(input => nonempty(input.entityType), 'entityType is required for open_client_entity.')] },
} satisfies Record<NavigationAction, ActionRules>;

export function isNavigationAction(value: unknown): value is NavigationAction {
	return typeof value === 'string' && Object.prototype.hasOwnProperty.call(navigationRequestRules, value);
}

export function validateActionFields(action: NavigationAction, input: Input): void {
	const specification: ActionRules = navigationRequestRules[action];
	if (specification.requiresId && !positiveId(input.id)) {
		throw new Error('Navigation ID must be a positive integer.');
	}
	for (const rule of specification.rules ?? []) {
		const error = rule(input);
		if (error) { throw new Error(error); }
	}
}

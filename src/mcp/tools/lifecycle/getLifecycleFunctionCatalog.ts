import { databaseToolResult } from '../../toolResult';
import { queryDatabaseRaw } from '../../database';
import { lifecycleFunctionsClassId } from '../../../features/lifecycle/lifecycleMethodExecution';
import { decodeSourceValue } from '../../queries/sourceContent';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_lifecycle_function_catalog', {
		description: 'Inspect the methods of Функции_ЖЦ (12956150), their current signatures, and which method is exposed for controlled lifecycle metadata creation.',
		inputSchema: {},
		annotations: { readOnlyHint: true },
	}, async () => databaseToolResult(async () => {
		const methods = await queryDatabaseRaw<{ id: number | string; name: string; signature: unknown; methtype: number; methkind: number }>(
			'SELECT id, name, signature, methtype, methkind FROM methods WHERE seniorid = $1 ORDER BY name, id',
			[lifecycleFunctionsClassId],
		);
		return {
			classId: String(lifecycleFunctionsClassId),
			className: 'Функции_ЖЦ',
			creationMethodId: '3143815',
			executionTool: 'execute_lifecycle_method',
			methods: methods.map(method => ({
				...method,
				id: String(method.id),
				signature: decodeSourceValue(method.signature),
				capability: Number(method.id) === 3143815 ? 'creates ParameterLC and RightLC records' : 'runtime calculation/query helper; read-only MCP inspection only',
			})),
		};
	}));
}

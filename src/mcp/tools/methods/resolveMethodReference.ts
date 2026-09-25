import { z } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { queryDatabaseRaw } from '../../database';
import { type CallerMethodRow, loadClassChain, resolveQualifierClassIds, type MethodCandidateRow } from '../../queries/methodQueries';
import { type MethodResolutionCandidate, resolveMethodCandidates } from '../../queries/methodResolution';
import { decodeSourceValue } from '../../queries/sourceContent';
import { readAttributeValue } from '../../queries/classAttributes';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('resolve_method_reference', {
		description: 'Resolve a method call found in East Express source code. Ranks exact-name candidates using the caller class, inheritance, an optional class/object qualifier and optional argument count.',
		inputSchema: {
			callerMethodId: z.number().int().positive().describe('ID of the method whose source contains the call'),
			methodName: z.string().min(1).describe('Exact called method or function name without parentheses'),
			qualifier: z.string().min(1).optional().describe('Optional qualifier from ClassName.Method or objectAttribute.Method'),
			argumentCount: z.number().int().min(0).max(100).optional().describe('Optional number of call arguments for overload ranking'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ callerMethodId, methodName, qualifier, argumentCount }: {
		callerMethodId: number;
		methodName: string;
		qualifier?: string;
		argumentCount?: number;
	}) => databaseToolResult(async () => {
		const callers = await queryDatabaseRaw<CallerMethodRow>(
			`SELECT method.id, method.name, method.seniorid AS classid, owner.name AS classname
		 FROM methods AS method LEFT JOIN abstract AS owner ON owner.id = method.seniorid
		 WHERE method.id = $1`,
			[callerMethodId],
		);
		const caller = callers[0];
		if (!caller) {
			throw new Error(`Caller method ${callerMethodId} was not found.`);
		}
		const currentChain = await loadClassChain([caller.classid]);
		const qualifierRoots = qualifier ? await resolveQualifierClassIds(qualifier, currentChain.map(item => item.id)) : [];
		const qualifierChain = qualifierRoots.length > 0 ? await loadClassChain(qualifierRoots) : [];
		const candidateRows = await queryDatabaseRaw<MethodCandidateRow>(
			`SELECT method.id, method.name, method.seniorid AS classid, owner.name AS classname, to_jsonb(method) AS data
		 FROM methods AS method LEFT JOIN abstract AS owner ON owner.id = method.seniorid
		 WHERE lower(method.name) = lower($1)
		 ORDER BY method.id LIMIT 100`,
			[methodName.trim()],
		);
		const candidates: MethodResolutionCandidate[] = candidateRows.map(row => ({
			methodId: String(row.id),
			methodName: row.name,
			classId: String(row.classid),
			className: row.classname ?? '',
			signature: decodeSourceValue(readAttributeValue(row.data, 'signature', 'methsignature', 'parameters', 'params')),
		}));
		const resolution = resolveMethodCandidates(
			candidates,
			new Map(currentChain.map(item => [String(item.id), item.depth])),
			new Map(qualifierChain.map(item => [String(item.id), item.depth])),
			Boolean(qualifier),
			argumentCount,
		);
		return {
			caller: { methodId: String(caller.id), methodName: caller.name, classId: String(caller.classid), className: caller.classname },
			reference: { methodName: methodName.trim(), qualifier: qualifier?.trim() ?? null, argumentCount: argumentCount ?? null },
			qualifierClassIds: qualifierRoots.map(String),
			...resolution,
			nextTool: resolution.selected ? { name: 'get_method_source', arguments: { methodId: resolution.selected.methodId } } : null,
		};
	}));
}

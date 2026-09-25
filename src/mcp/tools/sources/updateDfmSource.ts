import { z } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { withMcpDatabaseSession } from '../../database';
import { getDfmSourceInSession, saveDfmSourceInSession } from '../../../features/dfm/dfmRepository';
import type { McpToolServer } from '../../toolTypes';
import { createHash } from 'node:crypto';

export function registerTool(server: McpToolServer): void {
	server.registerTool('update_dfm_source', {
		description: 'Replace the complete DFM of an existing dialog class in the active database. Requires the sha256 returned by get_dfm_source to prevent overwriting another edit; saves through the same transaction as the VS Code editor and rereads the result.',
		inputSchema: {
			classId: z.number().int().positive().describe('Dialog class ID'),
			expectedSha256: z.string().regex(/^[\da-f]{64}$/i).describe('SHA-256 of complete current DFM from get_dfm_source'),
			source: z.string().max(1_500_000).describe('Complete replacement DFM in Windows-1251 repertoire'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	}, async ({ classId, expectedSha256, source }: { classId: number; expectedSha256: string; source: string }) => databaseToolResult(async () =>
		withMcpDatabaseSession(async ({ client, options }) => {
			const database = await client.query<{ current_database: string }>('SELECT current_database()');
			if (database.rows[0]?.current_database?.toLowerCase() !== options.database.toLowerCase()) {
				throw new Error(`Подключение к ${database.rows[0]?.current_database}, ожидалась ${options.database}.`);
			}
			const current = await getDfmSourceInSession(client, options, classId);
			if (createHash('sha256').update(current.text, 'utf8').digest('hex') !== expectedSha256.toLowerCase()) { throw new Error(`DFM класса ${classId} изменился. Прочитайте его заново.`); }
			const saved = await saveDfmSourceInSession(client, options, current, source);
			return { classId, valueId: saved.valueId, database: options.database, saved: saved.text === source, length: saved.text.length };
		}),
	));
}

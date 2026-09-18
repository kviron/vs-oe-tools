import { readOptionalArgument } from './arguments';
import { readFile } from 'node:fs/promises';
import { readMcpRuntimeStateSync } from '../core/mcpRuntimeState';

const explicitLogsPath = readOptionalArgument('--logs');

export async function logToolResult(level: string | undefined, limit: number) {
	const logsPath = explicitLogsPath ?? readMcpRuntimeStateSync()?.logsPath;
	if (!logsPath) {
		return { content: [{ type: 'text' as const, text: 'Extension log path is not configured.' }], isError: true };
	}
	try {
		const content = await readFile(logsPath, 'utf8');
		const records = content.split(/\r?\n/).filter(Boolean).flatMap(line => {
			try { return [JSON.parse(line) as Record<string, unknown>]; } catch { return []; }
		});
		const filtered = records.filter(record => !level || record.level === level).slice(-limit).reverse();
		return {
			content: [{ type: 'text' as const, text: JSON.stringify({ count: filtered.length, records: filtered }, null, 2) }],
			structuredContent: { count: filtered.length, records: filtered },
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return { content: [{ type: 'text' as const, text: JSON.stringify({ count: 0, records: [] }) }], structuredContent: { count: 0, records: [] } };
		}
		return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
	}
}

import { readOptionalArgument } from './arguments';
import { synchronizeDatabaseSelection, workspacePath } from './databaseSession';
import { getNavigationInfoPath } from '../core/navigationInfo';
import { readFile } from 'node:fs/promises';

const explicitNavigationInfoPath = readOptionalArgument('--navigation-info');

export async function navigationToolResult(action: 'reveal_class' | 'open_class' | 'open_method' | 'reveal_method', id: number, classId?: number) {
	return bridgeToolResult({ action, id, classId });
}

export async function bridgeToolResult(body: Record<string, unknown>) {
	try {
		await synchronizeDatabaseSelection();
		const navigationInfoPath = explicitNavigationInfoPath ?? getNavigationInfoPath(workspacePath);
		const connection = JSON.parse(await readFile(navigationInfoPath, 'utf8')) as { url?: unknown; token?: unknown };
		if (typeof connection.url !== 'string' || typeof connection.token !== 'string') {
			throw new Error('VS Code navigation bridge information is invalid.');
		}
		const response = await fetch(connection.url, {
			method: 'POST',
			headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(30_000),
		});
		const result = await response.json() as Record<string, unknown>;
		if (!response.ok) {
			throw new Error(typeof result.error === 'string' ? result.error : `Navigation bridge returned HTTP ${response.status}.`);
		}
		return {
			content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
			structuredContent: result,
		};
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		const message = (error as NodeJS.ErrnoException).code === 'ENOENT'
			? `VS Code extension bridge is not running for workspace ${workspacePath}. Open this workspace in VS Code with vc-ve-tools enabled.`
			: `VS Code extension bridge failed: ${detail}`;
		return { content: [{ type: 'text' as const, text: message }], isError: true };
	}
}

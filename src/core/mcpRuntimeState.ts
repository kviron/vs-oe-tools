import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { DatabaseRole } from './database';

export interface McpRuntimeState {
	workspacePath: string;
	databaseRole: DatabaseRole;
	databaseProfile?: string;
	databaseSelectionPath: string;
	logsPath: string;
	sqlMonitorHistoryPath: string;
	navigationInfoPath: string;
	clientMcpUrl: string;
	updatedAt: string;
}

export function getMcpRuntimeStatePath(): string {
	return path.join(tmpdir(), 'vc-ve-tools', 'mcp-runtime.json');
}

export async function writeMcpRuntimeState(state: McpRuntimeState): Promise<void> {
	const statePath = getMcpRuntimeStatePath();
	await mkdir(path.dirname(statePath), { recursive: true });
	await writeFile(statePath, JSON.stringify(state), 'utf8');
}

export async function readMcpRuntimeState(): Promise<McpRuntimeState | undefined> {
	try {
		return parseMcpRuntimeState(JSON.parse(await readFile(getMcpRuntimeStatePath(), 'utf8')));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) { return undefined; }
		throw error;
	}
}

export function readMcpRuntimeStateSync(): McpRuntimeState | undefined {
	try {
		return parseMcpRuntimeState(JSON.parse(readFileSync(getMcpRuntimeStatePath(), 'utf8')));
	} catch {
		return undefined;
	}
}

export function parseMcpRuntimeState(value: unknown): McpRuntimeState | undefined {
	if (!value || typeof value !== 'object') { return undefined; }
	const state = value as Partial<McpRuntimeState>;
	if (typeof state.workspacePath !== 'string' || !path.isAbsolute(state.workspacePath)
		|| (state.databaseRole !== 'main' && state.databaseRole !== 'test')
		|| typeof state.databaseSelectionPath !== 'string'
		|| typeof state.logsPath !== 'string'
		|| typeof state.sqlMonitorHistoryPath !== 'string'
		|| typeof state.navigationInfoPath !== 'string'
		|| typeof state.clientMcpUrl !== 'string'
		|| typeof state.updatedAt !== 'string') {
		return undefined;
	}
	return state as McpRuntimeState;
}

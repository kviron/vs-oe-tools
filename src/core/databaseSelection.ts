import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

export interface DatabaseSelectionState { workspacePath: string; profile: string; updatedAt: string }

export function getDatabaseSelectionPath(storagePath: string, workspacePath: string): string {
	const workspaceId = createHash('sha256').update(path.resolve(workspacePath).toLowerCase()).digest('hex').slice(0, 16);
	return path.join(storagePath, `database-selection-${workspaceId}.json`);
}

export async function writeDatabaseSelection(selectionPath: string, workspacePath: string, profile: string): Promise<void> {
	await mkdir(path.dirname(selectionPath), { recursive: true });
	await writeFile(selectionPath, JSON.stringify({ workspacePath, profile, updatedAt: new Date().toISOString() } satisfies DatabaseSelectionState), 'utf8');
}

export async function readDatabaseSelection(selectionPath: string): Promise<DatabaseSelectionState> {
	return JSON.parse(await readFile(selectionPath, 'utf8')) as DatabaseSelectionState;
}

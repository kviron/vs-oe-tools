import { readOptionalArgument } from './arguments';
import { getActiveDatabaseSelectionPath, readDatabaseSelection } from '../core/databaseSelection';
import { readMcpRuntimeStateSync } from '../core/mcpRuntimeState';
import { normalizeRow } from './toolResult';
import { Pool, type PoolClient } from 'pg';
import type { DatabaseConnectionOptions } from '../core/database';
import { loadRdboadmDatabases, rdboadmDatabaseOptions, type RdboadmDatabase } from '../infrastructure/configuration/rdboadmIni';
import { loadMcpDatabaseOptions } from './databaseConfig';
import * as path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { DatabaseRole } from '../core/database';

const initialRuntimeState = readMcpRuntimeStateSync();
const explicitWorkspacePath = readOptionalArgument('--workspace');
const explicitDatabaseRole = readOptionalArgument('--database-role');
const explicitDatabaseProfile = readOptionalArgument('--database-profile');
const explicitDatabaseSelectionPath = readOptionalArgument('--database-selection');

export let workspacePath = explicitWorkspacePath ?? initialRuntimeState?.workspacePath ?? '';

let databaseRole: DatabaseRole = explicitDatabaseRole === 'test' || (!explicitDatabaseRole && initialRuntimeState?.databaseRole === 'test') ? 'test' : 'main';

export let activeDatabaseProfile = explicitDatabaseProfile ?? initialRuntimeState?.databaseProfile;

let lastDatabaseSelectionUpdate: string | undefined;

let lastWorkspaceDatabaseProfile: string | undefined;

let lastRuntimeStateUpdate = initialRuntimeState?.updatedAt;

const databaseSelectionPath = explicitDatabaseSelectionPath ?? initialRuntimeState?.databaseSelectionPath ?? getActiveDatabaseSelectionPath();

interface McpPoolEntry {
	pool: Pool;
	lastUsedAt: number;
}

const pools = new Map<string, McpPoolEntry>();
const maximumPools = 8;

export interface McpDatabaseSession {
	client: PoolClient;
	options: DatabaseConnectionOptions;
}

export async function withMcpDatabaseSession<T>(
	action: (session: McpDatabaseSession) => Promise<T>,
	options?: DatabaseConnectionOptions,
	applicationName = 'vc-ve-tools-mcp',
): Promise<T> {
	// Resolve the active profile for every tool call so UI and agent switches
	// remain dynamic. The resolved connection determines the pool key.
	const resolvedOptions = options ?? await loadActiveDatabaseOptions();
	const entry = await getPool(resolvedOptions, applicationName);
	entry.lastUsedAt = Date.now();
	const client = await entry.pool.connect();
	try {
		return await action({ client, options: resolvedOptions });
	} finally {
		client.release();
	}
}

export async function queryDatabase(text: string, values: unknown[]): Promise<Record<string, unknown>[]> {
	return (await queryDatabaseRaw<Record<string, unknown>>(text, values)).map(normalizeRow);
}

export async function queryDatabaseRaw<Row extends Record<string, unknown>>(text: string, values: unknown[]): Promise<Row[]> {
	return withMcpDatabaseSession(async ({ client }) => {
		try {
		await client.query('BEGIN READ ONLY');
		await client.query("SET LOCAL statement_timeout = '10s'");
		await client.query("SET LOCAL lock_timeout = '2s'");
		const result = await client.query<Row>(text, values);
		return result.rows;
		} finally {
			await client.query('ROLLBACK').catch(() => undefined);
		}
	});
}

export async function loadActiveDatabaseOptions() {
	await synchronizeDatabaseSelection();
	try {
		const { databases } = await loadRdboadmDatabases(workspacePath);
		const database = findDatabaseProfile(databases, activeDatabaseProfile);
		activeDatabaseProfile = database.id;
		return rdboadmDatabaseOptions(database);
	} catch (error) {
		if (activeDatabaseProfile) { throw error; }
		return loadMcpDatabaseOptions(workspacePath, databaseRole);
	}
}

export async function synchronizeDatabaseSelection(): Promise<void> {
	const runtimeState = readMcpRuntimeStateSync();
	if (runtimeState && runtimeState.updatedAt !== lastRuntimeStateUpdate) {
		lastRuntimeStateUpdate = runtimeState.updatedAt;
		if (!explicitWorkspacePath) { workspacePath = runtimeState.workspacePath; }
		if (!explicitDatabaseRole) { databaseRole = runtimeState.databaseRole; }
		if (!explicitDatabaseProfile && runtimeState.databaseProfile) { activeDatabaseProfile = runtimeState.databaseProfile; }
	}
	if (databaseSelectionPath) {
		try {
			const selection = await readDatabaseSelection(databaseSelectionPath);
			if (selection.updatedAt !== lastDatabaseSelectionUpdate) {
				if (!path.isAbsolute(selection.workspacePath)) {
					throw new Error(`Active workspace path is not absolute: ${selection.workspacePath}`);
				}
				const selectedWorkspacePath = path.resolve(selection.workspacePath);
				const workspaceChanged = selectedWorkspacePath.toLowerCase() !== path.resolve(workspacePath).toLowerCase();
				lastDatabaseSelectionUpdate = selection.updatedAt;
				workspacePath = selectedWorkspacePath;
				lastWorkspaceDatabaseProfile = undefined;
				if (workspaceChanged) {
					activeDatabaseProfile = selection.profile || undefined;
				} else if (selection.profile) {
					activeDatabaseProfile = selection.profile;
				}
			}
			return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
		}
	}

	// Older copied MCP configurations do not contain --database-selection.
	// Read the workspace setting directly so an already configured agent still follows the UI.
	try {
		const settings = await readFile(path.join(workspacePath, '.vscode', 'settings.json'), 'utf8');
		const match = settings.match(/["']vcVeTools\.databaseProfile["']\s*:\s*["']([^"']+)["']/);
		const profile = match?.[1];
		if (profile && profile !== lastWorkspaceDatabaseProfile) {
			lastWorkspaceDatabaseProfile = profile;
			activeDatabaseProfile = profile;
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
	}
}

export function findDatabaseProfile(databases: RdboadmDatabase[], profile: string | undefined): RdboadmDatabase {
	const database = databases.find(item => item.id.toLowerCase() === profile?.toLowerCase()) ?? (!profile ? databases[0] : undefined);
	if (!database) {
		throw new Error(`Database profile [${profile ?? ''}] was not found in rdboadm.ini. Use list_databases to get valid profile IDs.`);
	}
	return database;
}

export function databaseSummary(database: RdboadmDatabase): Record<string, unknown> {
	const options = rdboadmDatabaseOptions(database);
	return { profile: database.id, name: database.name, database: options.database, server: options.host, port: options.port, user: options.user };
}

export function setActiveDatabaseProfile(profile: string): void {
	activeDatabaseProfile = profile;
}

async function getPool(options: DatabaseConnectionOptions, applicationName: string): Promise<McpPoolEntry> {
	const key = JSON.stringify([applicationName, options.host, options.port, options.database, options.user, options.password]);
	const existing = pools.get(key);
	if (existing) { return existing; }

	if (pools.size >= maximumPools) {
		const oldest = [...pools.entries()].sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt)[0];
		if (oldest) {
			pools.delete(oldest[0]);
			await oldest[1].pool.end().catch(() => undefined);
		}
	}

	const pool = new Pool({
		...options,
		application_name: applicationName,
		connectionTimeoutMillis: 5000,
		idleTimeoutMillis: 30_000,
		max: 4,
		allowExitOnIdle: true,
	});
	pool.on('error', () => undefined);
	const entry = { pool, lastUsedAt: Date.now() };
	pools.set(key, entry);
	return entry;
}

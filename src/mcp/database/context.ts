import type { PoolClient } from 'pg';
import type { DatabaseConnectionOptions } from '../../core/database';
import { loadActiveDatabaseOptions } from './profile';
import { withDatabaseClient } from './pool';

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
	return withDatabaseClient(resolvedOptions, applicationName,
		client => action({ client, options: resolvedOptions }));
}

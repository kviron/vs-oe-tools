import { Pool, type PoolClient } from 'pg';
import type { DatabaseConnectionOptions } from '../../core/database';

interface McpPoolEntry {
	pool: Pool;
	lastUsedAt: number;
}

const pools = new Map<string, McpPoolEntry>();
const maximumPools = 8;

export async function withDatabaseClient<T>(
	options: DatabaseConnectionOptions,
	applicationName: string,
	action: (client: PoolClient) => Promise<T>,
): Promise<T> {
	const entry = await getPool(options, applicationName);
	entry.lastUsedAt = Date.now();
	const client = await entry.pool.connect();
	try {
		return await action(client);
	} finally {
		client.release();
	}
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

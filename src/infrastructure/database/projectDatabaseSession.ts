import { Pool, type PoolClient } from 'pg';
import type { DatabaseConnectionOptions } from '../../core/database';
import { getProjectDatabaseOptions } from '../configuration/projectDatabaseOptions';

interface PoolEntry {
	pool: Pool;
	lastUsedAt: number;
}

export interface ProjectDatabaseSession {
	client: PoolClient;
	options: DatabaseConnectionOptions;
}

const pools = new Map<string, PoolEntry>();
const maximumPools = 8;

/**
 * Resolves the currently selected database for every operation, then leases a
 * client from the pool belonging to that exact connection profile.
 */
export async function withProjectDatabaseSession<T>(
	action: (session: ProjectDatabaseSession) => Promise<T>,
	options?: DatabaseConnectionOptions,
	applicationName = 'vc-ve-tools',
): Promise<T> {
	const resolvedOptions = options ?? await getProjectDatabaseOptions();
	const entry = await getPool(resolvedOptions, applicationName);
	entry.lastUsedAt = Date.now();
	const client = await entry.pool.connect();
	try {
		return await action({ client, options: resolvedOptions });
	} finally {
		client.release();
	}
}

export function disposeProjectDatabaseSessions(): void {
	const activePools = [...pools.values()].map(entry => entry.pool);
	pools.clear();
	void Promise.all(activePools.map(pool => pool.end().catch(() => undefined)));
}

async function getPool(options: DatabaseConnectionOptions, applicationName: string): Promise<PoolEntry> {
	const key = JSON.stringify([applicationName, options.host, options.port, options.database, options.user, options.password]);
	const existing = pools.get(key);
	if (existing) {
		return existing;
	}

	if (pools.size >= maximumPools) {
		const oldest = [...pools.entries()].sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt)[0];
		if (oldest) {
			pools.delete(oldest[0]);
			await oldest[1].pool.end().catch(() => undefined);
		}
	}

	const entry: PoolEntry = {
		pool: createPool({
			...options,
			application_name: applicationName,
			connectionTimeoutMillis: 5000,
			idleTimeoutMillis: 30_000,
			max: 4,
			allowExitOnIdle: true,
		}),
		lastUsedAt: Date.now(),
	};
	pools.set(key, entry);
	return entry;
}

function createPool(options: ConstructorParameters<typeof Pool>[0]): Pool {
	const pool = new Pool(options);
	// pg emits idle-client failures through EventEmitter. A listener prevents an
	// unreachable database from turning into an uncaught extension-host error.
	pool.on('error', () => undefined);
	return pool;
}

import type { OrderedToolRegistration } from '../registrationTypes';
import { registerTool as listDatabases } from './listDatabases';
import { registerTool as getActiveDatabase } from './getActiveDatabase';
import { registerTool as switchDatabase } from './switchDatabase';
import { registerTool as lookupObjectById } from './lookupObjectById';
import { registerTool as searchDatabaseObjects } from './searchDatabaseObjects';
import { registerTool as queryReadonly } from './queryReadonly';
import { registerTool as queryDatabase } from './queryDatabase';

/** Owns the database tool catalog and its stable public positions. */
export const databaseToolRegistrations: readonly OrderedToolRegistration[] = [
	[10, listDatabases],
	[20, getActiveDatabase],
	[30, switchDatabase],
	[40, lookupObjectById],
	[70, searchDatabaseObjects],
	[480, queryReadonly],
	[490, queryDatabase],
];

import type { OrderedToolRegistration } from '../registrationTypes';
import { registerTool as getRecentExtensionErrors } from './getRecentExtensionErrors';
import { registerTool as getExtensionLogs } from './getExtensionLogs';
import { registerTool as getRecentSqlQueries } from './getRecentSqlQueries';

/** Owns the diagnostics tool catalog and its stable public positions. */
export const diagnosticsToolRegistrations: readonly OrderedToolRegistration[] = [
	[500, getRecentExtensionErrors],
	[510, getExtensionLogs],
	[520, getRecentSqlQueries],
];

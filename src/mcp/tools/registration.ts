import { registerRelationshipMapTools } from './relationship-maps/registration';
import type { McpToolServer } from '../toolTypes';
import { registerWorkHistoryTools } from '../workHistory/tools';
import { databaseToolRegistrations } from './database/registration';
import { packagesToolRegistrations } from './packages/registration';
import { classesToolRegistrations } from './classes/registration';
import { methodsToolRegistrations } from './methods/registration';
import { sourcesToolRegistrations } from './sources/registration';
import { lifecycleToolRegistrations } from './lifecycle/registration';
import { projectToolRegistrations } from './project/registration';
import { clientToolRegistrations } from './client/registration';
import { navigationToolRegistrations } from './navigation/registration';
import { diagnosticsToolRegistrations } from './diagnostics/registration';
import { httpToolRegistrations } from './http/registration';
import { registerCommandTools } from './commandTools';

const registrations = [
	...databaseToolRegistrations,
	...packagesToolRegistrations,
	...classesToolRegistrations,
	...methodsToolRegistrations,
	...sourcesToolRegistrations,
	...lifecycleToolRegistrations,
	...projectToolRegistrations,
	...clientToolRegistrations,
	...navigationToolRegistrations,
	...diagnosticsToolRegistrations,
	...httpToolRegistrations,
].sort(([left], [right]) => left - right);

/** Composes domain catalogs without changing the public registration order. */
export function registerTools(server: McpToolServer): void {
	registerWorkHistoryTools(server);
	registerCommandTools(server);
	for (const [, register] of registrations) { register(server); }
	registerRelationshipMapTools(server);
}

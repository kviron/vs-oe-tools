import type { OrderedToolRegistration } from '../registrationTypes';
import { registerTool as getLifecycleFunctionCatalog } from './getLifecycleFunctionCatalog';
import { registerTool as executeLifecycleMethod } from './executeLifecycleMethod';

/** Owns the lifecycle tool catalog and its stable public positions. */
export const lifecycleToolRegistrations: readonly OrderedToolRegistration[] = [
	[280, getLifecycleFunctionCatalog],
	[290, executeLifecycleMethod],
];

import type { OrderedToolRegistration } from '../registrationTypes';
import { registerTool as updateDatabase } from './updateDatabase';
import { registerTool as updatePackages } from './updatePackages';
import { registerTool as updateBinaries } from './updateBinaries';
import { registerTool as getProductionTasks } from './getProductionTasks';
import { registerTool as getProductionTask } from './getProductionTask';
import { registerTool as getProductionTasksInProgress } from './getProductionTasksInProgress';

/** Owns the project tool catalog and its stable public positions. */
export const projectToolRegistrations: readonly OrderedToolRegistration[] = [
	[300, updateDatabase],
	[310, updatePackages],
	[320, updateBinaries],
	[380, getProductionTasks],
	[390, getProductionTask],
	[400, getProductionTasksInProgress],
];

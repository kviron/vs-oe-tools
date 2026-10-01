import type { OrderedToolRegistration } from '../registrationTypes';
import { registerTool as checkObjectPackageBinding } from './checkObjectPackageBinding';
import { registerTool as bindObjectsToPackage } from './bindObjectsToPackage';
import { registerTool as getSvnFileHistory } from './getSvnFileHistory';
import { registerTool as getPackageSyncChanges } from './getPackageSyncChanges';

/** Owns the packages tool catalog and its stable public positions. */
export const packagesToolRegistrations: readonly OrderedToolRegistration[] = [
	[50, checkObjectPackageBinding],
	[60, bindObjectsToPackage],
	[360, getSvnFileHistory],
	[370, getPackageSyncChanges],
];

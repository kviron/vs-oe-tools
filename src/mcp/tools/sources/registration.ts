import type { OrderedToolRegistration } from '../registrationTypes';
import { registerTool as getModuleSource } from './getModuleSource';
import { registerTool as updateModuleSource } from './updateModuleSource';
import { registerTool as getDfmSource } from './getDfmSource';
import { registerTool as getDfmInheritance } from './getDfmInheritance';
import { registerTool as updateDfmSource } from './updateDfmSource';

/** Owns the sources tool catalog and its stable public positions. */
export const sourcesToolRegistrations: readonly OrderedToolRegistration[] = [
	[260, getModuleSource],
	[270, updateModuleSource],
	[410, getDfmSource],
	[420, getDfmInheritance],
	[430, updateDfmSource],
];

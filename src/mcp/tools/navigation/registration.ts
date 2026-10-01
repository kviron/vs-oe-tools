import type { OrderedToolRegistration } from '../registrationTypes';
import { registerTool as revealClass } from './revealClass';
import { registerTool as openClass } from './openClass';
import { registerTool as openMethod } from './openMethod';
import { registerTool as revealMethodInClass } from './revealMethodInClass';

/** Owns the navigation tool catalog and its stable public positions. */
export const navigationToolRegistrations: readonly OrderedToolRegistration[] = [
	[440, revealClass],
	[450, openClass],
	[460, openMethod],
	[470, revealMethodInClass],
];

import type { OrderedToolRegistration } from '../registrationTypes';
import { registerTool as searchClasses } from './searchClasses';
import { registerTool as getClassDetails } from './getClassDetails';
import { registerTool as createLocalToolClass } from './createLocalToolClass';
import { registerTool as getClassDictionary } from './getClassDictionary';
import { registerTool as searchClassDictionary } from './searchClassDictionary';
import { registerTool as getClassAttributes } from './getClassAttributes';
import { registerTool as getAttributeDetails } from './getAttributeDetails';
import { registerTool as getAttributeCreationOptions } from './getAttributeCreationOptions';
import { registerTool as getClassProperties } from './getClassProperties';
import { registerTool as getPropertyDetails } from './getPropertyDetails';

/** Owns the classes tool catalog and its stable public positions. */
export const classesToolRegistrations: readonly OrderedToolRegistration[] = [
	[80, searchClasses],
	[90, getClassDetails],
	[100, createLocalToolClass],
	[110, getClassDictionary],
	[120, searchClassDictionary],
	[130, getClassAttributes],
	[140, getAttributeDetails],
	[150, getAttributeCreationOptions],
	[170, getClassProperties],
	[180, getPropertyDetails],
];

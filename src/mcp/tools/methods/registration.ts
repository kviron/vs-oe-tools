import type { OrderedToolRegistration } from '../registrationTypes';
import { registerTool as getMethodCreationOptions } from './getMethodCreationOptions';
import { registerTool as searchMethods } from './searchMethods';
import { registerTool as resolveMethodReference } from './resolveMethodReference';
import { registerTool as getMethodSource } from './getMethodSource';
import { registerTool as updateMethodSource } from './updateMethodSource';
import { registerTool as createClassMethodChecked } from './createClassMethodChecked';
import { registerTool as compileMethod } from './compileMethod';
import { registerTool as getMethodCompilationHistory } from './getMethodCompilationHistory';

/** Owns the methods tool catalog and its stable public positions. */
export const methodsToolRegistrations: readonly OrderedToolRegistration[] = [
	[160, getMethodCreationOptions],
	[190, searchMethods],
	[200, resolveMethodReference],
	[210, getMethodSource],
	[220, updateMethodSource],
	[230, createClassMethodChecked],
	[240, compileMethod],
	[250, getMethodCompilationHistory],
];

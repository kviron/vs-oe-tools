import type { OrderedToolRegistration } from '../registrationTypes';
import { registerTool as listHttpMethods } from './listHttpMethods';
import { registerTool as startHttpTestServer } from './startHttpTestServer';
import { registerTool as getHttpTestServerStatus } from './getHttpTestServerStatus';
import { registerTool as callHttpTestServer } from './callHttpTestServer';
import { registerTool as stopHttpTestServer } from './stopHttpTestServer';

/** Owns the http tool catalog and its stable public positions. */
export const httpToolRegistrations: readonly OrderedToolRegistration[] = [
	[590, listHttpMethods],
	[600, startHttpTestServer],
	[610, getHttpTestServerStatus],
	[620, callHttpTestServer],
	[630, stopHttpTestServer],
];

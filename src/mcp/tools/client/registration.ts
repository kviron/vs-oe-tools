import type { OrderedToolRegistration } from '../registrationTypes';
import { registerTool as startClient } from './startClient';
import { registerTool as getClientStatus } from './getClientStatus';
import { registerTool as openClientEntity } from './openClientEntity';
import { registerTool as startClientMcp } from './startClientMcp';
import { registerTool as listClientMcpTools } from './listClientMcpTools';
import { registerTool as callClientMcpTool } from './callClientMcpTool';
import { registerTool as stopClientMcp } from './stopClientMcp';
import { registerTool as listNativeClientLogs } from './listNativeClientLogs';
import { registerTool as readNativeClientLog } from './readNativeClientLog';

/** Owns the client tool catalog and its stable public positions. */
export const clientToolRegistrations: readonly OrderedToolRegistration[] = [
	[330, startClient],
	[340, getClientStatus],
	[350, openClientEntity],
	[530, startClientMcp],
	[540, listClientMcpTools],
	[550, callClientMcpTool],
	[560, stopClientMcp],
	[570, listNativeClientLogs],
	[580, readNativeClientLog],
];

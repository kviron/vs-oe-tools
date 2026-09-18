import type { McpToolServer } from '../toolTypes';
import { registerTool as listDatabases } from './listDatabases';
import { registerTool as getActiveDatabase } from './getActiveDatabase';
import { registerTool as switchDatabase } from './switchDatabase';
import { registerTool as lookupObjectById } from './lookupObjectById';
import { registerTool as checkObjectPackageBinding } from './checkObjectPackageBinding';
import { registerTool as bindObjectsToPackage } from './bindObjectsToPackage';
import { registerTool as searchDatabaseObjects } from './searchDatabaseObjects';
import { registerTool as searchClasses } from './searchClasses';
import { registerTool as getClassDetails } from './getClassDetails';
import { registerTool as getClassDictionary } from './getClassDictionary';
import { registerTool as searchClassDictionary } from './searchClassDictionary';
import { registerTool as getClassAttributes } from './getClassAttributes';
import { registerTool as getAttributeDetails } from './getAttributeDetails';
import { registerTool as getAttributeCreationOptions } from './getAttributeCreationOptions';
import { registerTool as getMethodCreationOptions } from './getMethodCreationOptions';
import { registerTool as getClassProperties } from './getClassProperties';
import { registerTool as getPropertyDetails } from './getPropertyDetails';
import { registerTool as searchMethods } from './searchMethods';
import { registerTool as resolveMethodReference } from './resolveMethodReference';
import { registerTool as getMethodSource } from './getMethodSource';
import { registerTool as updateMethodSource } from './updateMethodSource';
import { registerTool as getModuleSource } from './getModuleSource';
import { registerTool as updateModuleSource } from './updateModuleSource';
import { registerTool as getLifecycleFunctionCatalog } from './getLifecycleFunctionCatalog';
import { registerTool as executeLifecycleMethod } from './executeLifecycleMethod';
import { registerTool as updateDatabase } from './updateDatabase';
import { registerTool as updatePackages } from './updatePackages';
import { registerTool as updateBinaries } from './updateBinaries';
import { registerTool as startClient } from './startClient';
import { registerTool as openClientEntity } from './openClientEntity';
import { registerTool as getSvnFileHistory } from './getSvnFileHistory';
import { registerTool as getPackageSyncChanges } from './getPackageSyncChanges';
import { registerTool as getProductionTasks } from './getProductionTasks';
import { registerTool as getProductionTask } from './getProductionTask';
import { registerTool as getProductionTasksInProgress } from './getProductionTasksInProgress';
import { registerTool as getDfmSource } from './getDfmSource';
import { registerTool as getDfmInheritance } from './getDfmInheritance';
import { registerTool as revealClass } from './revealClass';
import { registerTool as openClass } from './openClass';
import { registerTool as openMethod } from './openMethod';
import { registerTool as revealMethodInClass } from './revealMethodInClass';
import { registerTool as queryReadonly } from './queryReadonly';
import { registerTool as getRecentExtensionErrors } from './getRecentExtensionErrors';
import { registerTool as getExtensionLogs } from './getExtensionLogs';
import { registerTool as getRecentSqlQueries } from './getRecentSqlQueries';
import { registerTool as listClientMcpTools } from './listClientMcpTools';
import { registerTool as callClientMcpTool } from './callClientMcpTool';
import { registerTool as startClientMcp } from './startClientMcp';
import { registerTool as stopClientMcp } from './stopClientMcp';
import { registerTool as listNativeClientLogs } from './listNativeClientLogs';
import { registerTool as readNativeClientLog } from './readNativeClientLog';
import { registerTool as startHttpTestServer } from './startHttpTestServer';
import { registerTool as stopHttpTestServer } from './stopHttpTestServer';
import { registerTool as getHttpTestServerStatus } from './getHttpTestServerStatus';
import { registerTool as callHttpTestServer } from './callHttpTestServer';
import { registerTool as listHttpMethods } from './listHttpMethods';
import { deprecatedMcpToolNames, russianMcpToolDescriptions } from './toolPresentation';

/** Register the public MCP tools in a stable order. */
export function registerTools(server: McpToolServer): void {
	listDatabases(server);
	getActiveDatabase(server);
	switchDatabase(server);
	lookupObjectById(server);
	checkObjectPackageBinding(server);
	bindObjectsToPackage(server);
	searchDatabaseObjects(server);
	searchClasses(server);
	getClassDetails(server);
	getClassDictionary(server);
	searchClassDictionary(server);
	getClassAttributes(server);
	getAttributeDetails(server);
	getAttributeCreationOptions(server);
	getMethodCreationOptions(server);
	getClassProperties(server);
	getPropertyDetails(server);
	searchMethods(server);
	resolveMethodReference(server);
	getMethodSource(server);
	updateMethodSource(server);
	getModuleSource(server);
	updateModuleSource(server);
	getLifecycleFunctionCatalog(server);
	executeLifecycleMethod(server);
	updateDatabase(server);
	updatePackages(server);
	updateBinaries(server);
	startClient(server);
	openClientEntity(server);
	getSvnFileHistory(server);
	getPackageSyncChanges(server);
	getProductionTasks(server);
	getProductionTask(server);
	getProductionTasksInProgress(server);
	getDfmSource(server);
	getDfmInheritance(server);
	revealClass(server);
	openClass(server);
	openMethod(server);
	revealMethodInClass(server);
	queryReadonly(server);
	getRecentExtensionErrors(server);
	getExtensionLogs(server);
	getRecentSqlQueries(server);
	startClientMcp(server);
	listClientMcpTools(server);
	callClientMcpTool(server);
	stopClientMcp(server);
	listNativeClientLogs(server);
	readNativeClientLog(server);
	listHttpMethods(server);
	startHttpTestServer(server);
	getHttpTestServerStatus(server);
	callHttpTestServer(server);
	stopHttpTestServer(server);
}

export interface RegisteredMcpToolCatalogItem {
	name: string;
	description: string;
	deprecated: boolean;
}

let registeredToolCatalog: RegisteredMcpToolCatalogItem[] | undefined;

/** Build the public tool catalog from the same registrations used by the MCP server. */
export function getRegisteredToolCatalog(): RegisteredMcpToolCatalogItem[] {
	if (registeredToolCatalog) { return registeredToolCatalog; }
	const tools: RegisteredMcpToolCatalogItem[] = [];
	const catalogServer: McpToolServer = {
		registerTool: (name, config) => {
			tools.push({
				name,
				description: russianMcpToolDescriptions[name] ?? config.description.trim(),
				deprecated: deprecatedMcpToolNames.has(name),
			});
		},
	};
	registerTools(catalogServer);
	registeredToolCatalog = tools;
	return registeredToolCatalog;
}

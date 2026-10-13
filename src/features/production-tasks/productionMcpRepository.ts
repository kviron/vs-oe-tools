import { mapProductionTask } from './mapping';
import { ProductionMcpClient, type ProductionMcpTask } from './productionMcpClient';
import type { ProductionMcpOptions, ProductionTaskSummary } from './models';

export const productionMcpLimit = 500;
export function mapProductionMcpTask(task: ProductionMcpTask): ProductionTaskSummary {
	const date = task.date.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/);
	return { ...mapProductionTask({ id: task.id, number: task.number || '', title: task.subject,
		created: date ? `${date[3]}.${date[2]}.${date[1]} ${date[4]}` : task.date,
		workdescription: (task.content ?? '').replace(/\\u000[dD]/g, '\r').replace(/\\u000[aA]/g, '\n') }), source: 'mcp' };
}
export async function listMcpTasks(options: ProductionMcpOptions, folderUri?: string): Promise<ProductionTaskSummary[]> {
	return (await new ProductionMcpClient(options.token).list({ ...(folderUri ? { folder_uri: folderUri } : {}), limit: productionMcpLimit })).map(mapProductionMcpTask);
}
export async function readMcpTask(options: ProductionMcpOptions, id: number): Promise<ProductionTaskSummary | undefined> {
	return (await new ProductionMcpClient(options.token).view([id])).map(mapProductionMcpTask)[0];
}
export async function searchMcpTasks(options: ProductionMcpOptions, query: string, limit: number, folderUri?: string): Promise<ProductionTaskSummary[]> {
	const client = new ProductionMcpClient(options.token);
	const value = query.trim();
	const bound = Math.max(1, Math.min(productionMcpLimit, limit));
	if (/^\d+$/.test(value)) {
		const numbered = await client.list({ numbers: [value], ...(folderUri ? { folder_uri: folderUri } : {}), limit: bound });
		const numericId = Number(value);
		const direct = !folderUri && Number.isSafeInteger(numericId) && numericId > 0 ? await client.view([numericId]) : [];
		const ids = [...new Set([...numbered, ...direct].map(task => task.id))].slice(0, bound);
		return (await client.view(ids)).map(mapProductionMcpTask);
	}
	const groups = value ? await Promise.all([
		client.list({ subject_fragments: [value], ...(folderUri ? { folder_uri: folderUri } : {}), limit: bound }),
		client.list({ content_fragments: [value], ...(folderUri ? { folder_uri: folderUri } : {}), limit: bound }),
	]) : [await client.list({ ...(folderUri ? { folder_uri: folderUri } : {}), limit: bound })];
	const ids = [...new Set(groups.flat().map(task => task.id))].slice(0, bound);
	return (await client.view(ids)).map(mapProductionMcpTask);
}

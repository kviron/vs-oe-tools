import type { OeMethodCredentials } from '../lifecycle/oeStaticMethodExecutor';
import { executePackageSyncMethod } from '../lifecycle/oeStaticMethodExecutor';
import type { PackageSyncItem } from './models';
import { getProjectDatabaseOptions } from '../../infrastructure/configuration/projectDatabaseOptions';
import { loadPackageSyncItems, loadPackageSyncRoot, mapPackageSyncRows, type PackageSyncRow } from '../../infrastructure/database/packageSyncRepository';

const responseMarker = 'VCVE_PACKAGE_SYNC_JSON=';

/** The OE method is preferred; the existing SQL query remains available during migration. */
export async function loadPackageSyncItemsFromMethod(
	workspacePath: string | undefined,
	getCredentials: () => Promise<OeMethodCredentials>,
): Promise<PackageSyncItem[]> {
	try {
		if (!workspacePath) { throw new Error('Не открыта папка Восточного Экспресса.'); }
		const options = await getProjectDatabaseOptions();
		const output = await executePackageSyncMethod(workspacePath, options.database, options.host, await getCredentials());
		const rows = parsePackageSyncMethodOutput(output);
		return mapPackageSyncRows(rows, await loadPackageSyncRoot());
	} catch (error) {
		console.warn('Метод синхронизации пакетов недоступен; используется прежний запрос:', error);
		return loadPackageSyncItems();
	}
}

export function parsePackageSyncMethodOutput(output: string): PackageSyncRow[] {
	const markerIndex = output.lastIndexOf(responseMarker);
	if (markerIndex < 0) { throw new Error('Метод не вернул маркер списка синхронизации.'); }
	const json = output.slice(markerIndex + responseMarker.length).split(/\r?\n/u, 1)[0].trim();
	const rows: unknown = JSON.parse(json);
	if (!Array.isArray(rows) || !rows.every(row => row && typeof row === 'object'
		&& Number.isSafeInteger(Number((row as Record<string, unknown>).objectid))
		&& Number.isSafeInteger(Number((row as Record<string, unknown>).objectclassid)))) {
		throw new Error('Метод вернул список синхронизации в неожиданном формате.');
	}
	return rows as PackageSyncRow[];
}

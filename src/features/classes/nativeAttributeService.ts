import * as vscode from 'vscode';
import { getProjectDatabaseOptions } from '../../infrastructure/configuration/projectDatabaseOptions';
import { withProjectDatabaseSession } from '../../infrastructure/database/projectDatabaseSession';
import { getClassAttributeDetails } from '../../infrastructure/database/classRepository';
import { callClientMcpTool, getClientMcpHealth, listClientMcpTools, stopClientMcpServer } from '../../mcp/client/http';
import { startClientMcpProcess, type OeMethodCredentials } from '../lifecycle/oeStaticMethodExecutor';
import { assertAttributeTool, attributeDraft, nativeAttributeArguments, nativeAttributeResult, type NativeAttributeDraft } from './nativeAttributeEditing';

let credentials: (() => Promise<OeMethodCredentials>) | undefined;
let pending: Promise<unknown> = Promise.resolve();
export function configureNativeAttributeClient(getCredentials: () => Promise<OeMethodCredentials>): vscode.Disposable {
	credentials = getCredentials;
	return new vscode.Disposable(() => { credentials = undefined; });
}
export async function attributeDatabaseKey(): Promise<string> {
	const options = await getProjectDatabaseOptions();
	return JSON.stringify([vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, options.host, options.port, options.database]);
}
export async function attributePackage(id: number): Promise<{ name: string; valid: boolean }> {
	return withProjectDatabaseSession(async ({ client }) => {
		const result = await client.query(`SELECT p.packagename, f.filename, b.objectid FROM abstract a
		 LEFT JOIN sysfile f ON f.id=a.sysfile LEFT JOIN sysgroups g ON g.id=f.sysgroup
		 LEFT JOIN syspackages p ON p.id=g.package LEFT JOIN syspackagebase b ON b.objectid=f.id WHERE a.id=$1`, [id]);
		const row = result.rows[0];
		return { name: row?.packagename ?? '', valid: Boolean(row?.objectid && row.filename && row.filename !== '#package$') };
	});
}
export class AttributeSaveUncertainError extends Error {
	constructor(message: string, public readonly attributeId?: number) { super(message); }
}
export function saveNativeAttribute(draft: NativeAttributeDraft, databaseKey: string, baseline?: NativeAttributeDraft, id?: number): Promise<{ id: number; warning?: string }> {
	const operation = pending.then(() => performSave(draft, databaseKey, baseline, id));
	pending = operation.catch(() => undefined);
	return operation;
}
async function performSave(draft: NativeAttributeDraft, databaseKey: string, baseline?: NativeAttributeDraft, id?: number): Promise<{ id: number; warning?: string }> {
	const args = nativeAttributeArguments(draft, id);
	if (id === undefined && !draft.sysPackage.trim()) {throw new Error('Укажите пакет для нового атрибута.');}
	if (await attributeDatabaseKey() !== databaseKey) {throw new Error('База или проект изменились. Закройте карточку и откройте её заново.');}
	const options = await getProjectDatabaseOptions();
	const url = vscode.workspace.getConfiguration('vcVeTools').get<string>('mcp.clientUrl', 'http://localhost:8080');
	let owned = false;
	try {
		let health = await getClientMcpHealth(url).catch(() => undefined);
		if (!health) {
			const endpoint = new URL(url);
			if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) || endpoint.protocol !== 'http:' || endpoint.port !== '8080' || !['', '/'].includes(endpoint.pathname)) {
				throw new Error('Клиентский MCP недоступен по настроенному адресу. Запустите его или укажите локальный http://localhost:8080.');
			}
			const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspace || !credentials) {throw new Error('Недоступен запуск клиентского MCP. Откройте проект ВЭ.');}
			await startClientMcpProcess(workspace, options.database, options.host, await credentials());
			owned = true;
			for (let i = 0; i < 10; i++) {
				health = await getClientMcpHealth(url).catch(() => undefined);
				if (health) {break;}
				await new Promise(resolve => setTimeout(resolve, 500));
			}
		}
		const checkDatabase = async () => {
			const current = await getClientMcpHealth(url);
			if (current.status.toLowerCase() !== 'ok' || current.database?.toLowerCase() !== options.database.toLowerCase()
				|| await attributeDatabaseKey() !== databaseKey) {throw new Error('Клиентский MCP подключён не к базе этой карточки. Сохранение отменено.');}
		};
		await checkDatabase();
		const tools = await listClientMcpTools(url);
		const name = id === undefined ? 'class_attribute_add' : 'class_attribute_change';
		assertAttributeTool(tools, name, args);
		assertAttributeTool(tools, 'class_member_get', { Members: [] });
		if (id !== undefined) {
			const current = await getClassAttributeDetails(id);
			if (!baseline || JSON.stringify(attributeDraft(current)) !== JSON.stringify(baseline)) {throw new Error('Атрибут изменён вне карточки. Обновите данные перед редактированием.');}
			const before = nativeAttributeResult(await callClientMcpTool('class_member_get', { Members: [String(id)] }, url));
			if (Number(before.id) !== id) { throw new Error('Клиент не подтвердил ID редактируемого атрибута.'); }
		}
		await checkDatabase();
		let savedId = id;
		try {
			const result = nativeAttributeResult(await callClientMcpTool(name, args, url));
			savedId = Number(result.id);
			if (!Number.isSafeInteger(savedId) || savedId <= 0 || (id !== undefined && savedId !== id)) {throw new Error('Исполнитель не вернул ожидаемый ID атрибута.');}
			const readback = nativeAttributeResult(await callClientMcpTool('class_member_get', { Members: [String(savedId)] }, url));
			if (Number(readback.id) !== savedId || readback.name !== draft.name.trim()) {throw new Error('Проверка сохранённого атрибута не прошла.');}
			await checkDatabase();
			const binding = await attributePackage(savedId);
			return { id: savedId, ...(!binding.valid ? { warning: `Атрибут ${savedId} сохранён, но привязка к пакетному файлу требует проверки. Не создавайте следующий атрибут до исправления привязки.` } : {}) };
		} catch (error) {
			throw new AttributeSaveUncertainError(`Результат сохранения требует проверки. Автоматического повтора нет. ${error instanceof Error ? error.message : String(error)}`, savedId);
		}
	} finally {
		if (owned) {
			const health = await getClientMcpHealth(url).catch(() => undefined);
			if (health?.database?.toLowerCase() === options.database.toLowerCase()) { await stopClientMcpServer(url).catch(() => undefined); }
		}
	}
}

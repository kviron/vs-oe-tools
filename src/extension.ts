// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { readFile } from 'node:fs/promises';
import * as iconv from 'iconv-lite';
import { Client } from 'pg';

const projectRootSetting = 'useFolderAsProjectRoot';
const databaseRoleSetting = 'databaseRole';
const sourceLanguageIds = ['ve-pkf', 've-pascal', 'bat'];
const previousEncodingsKey = 'vcVeTools.previousWorkspaceLanguageEncodings';

interface PreviousEncoding {
	languageId: string;
	hadValue: boolean;
	value?: string;
}

type DatabaseRole = 'main' | 'test';

interface DatabaseConnectionOptions {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
}

interface ClassRow {
	id: number;
	name: string;
	seniorid: number | null;
	ord: number | null;
}

interface ClassCommentRow {
	id: number;
	name: string | null;
	seniorid: number;
	ord: number | null;
}

interface ObjectMetaDataCountRow {
	seniorid: number;
	count: string;
}

interface ClassTreeRow extends ClassRow {
	comments: ClassCommentRow[];
	objectMetaDataCount: number;
}

interface ClassDetails extends ClassRow {
	aliases: string | null;
	title: string | null;
	dbtablename: string | null;
	dispexpression: string | null;
	adddispexpression: string | null;
	childclassid: number | null;
	parentclassid: number | null;
	cacheobjclass: number | null;
	refintegritycheck: number | null;
	defaultdbalias: string | null;
	isabstract: number | null;
	virtual: number | null;
	isinheritable: number | null;
	cached: number | null;
	onedbtable: number | null;
	tableshared: number | null;
	ordered: number | null;
	isview: number | null;
	unreferenced: number | null;
	childclassname: string | null;
	parentclassname: string | null;
}

interface ClassDetailPanel {
	panel: vscode.WebviewPanel;
	pinned: boolean;
}

const classDetailPanels = new Map<number, ClassDetailPanel>();
let previewClassPanelId: number | undefined;

class SettingsItem extends vscode.TreeItem {
	constructor(enabled: boolean) {
		super('Использовать папку как корень проекта');
		this.checkboxState = enabled
			? vscode.TreeItemCheckboxState.Checked
			: vscode.TreeItemCheckboxState.Unchecked;
		this.tooltip = 'Открывать файлы PKF, Pascal/Delphi и BAT в кодировке Cyrillic (Windows 1251)';
	}
}

class SettingsProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
	private readonly changeEmitter = new vscode.EventEmitter<vscode.TreeItem>();
	private readonly projectRootItem: SettingsItem;
	private readonly databaseRoleItem: vscode.TreeItem;
	private readonly testDatabaseConnectionItem: vscode.TreeItem;

	readonly onDidChangeTreeData = this.changeEmitter.event;

	constructor(enabled: boolean, databaseRole: DatabaseRole) {
		this.projectRootItem = new SettingsItem(enabled);
		this.databaseRoleItem = new vscode.TreeItem('База данных');
		this.databaseRoleItem.command = {
			command: 'vc-ve-tools.selectDatabaseRole',
			title: 'Выбрать базу данных',
		};
		this.databaseRoleItem.iconPath = new vscode.ThemeIcon('database');
		this.setDatabaseRole(databaseRole);
		this.testDatabaseConnectionItem = new vscode.TreeItem('Проверить подключение к базе');
		this.testDatabaseConnectionItem.command = {
			command: 'vc-ve-tools.testDatabaseConnection',
			title: 'Проверить подключение к базе',
		};
		this.testDatabaseConnectionItem.iconPath = new vscode.ThemeIcon('plug');
		this.testDatabaseConnectionItem.tooltip = 'Проверить подключение к PostgreSQL по данным из Vars.bat';
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
		return element ? [] : [this.databaseRoleItem, this.projectRootItem, this.testDatabaseConnectionItem];
	}

	setProjectRootEnabled(enabled: boolean): void {
		this.projectRootItem.checkboxState = enabled
			? vscode.TreeItemCheckboxState.Checked
			: vscode.TreeItemCheckboxState.Unchecked;
		this.changeEmitter.fire(this.projectRootItem);
	}

	setDatabaseRole(databaseRole: DatabaseRole): void {
		this.databaseRoleItem.description = databaseRole === 'main' ? 'Основная' : 'Тестовая';
		this.databaseRoleItem.tooltip = 'Нажмите, чтобы переключить базу данных';
		this.changeEmitter.fire(this.databaseRoleItem);
	}

	dispose(): void {
		this.changeEmitter.dispose();
	}
}

function parseVarsFile(content: string): Map<string, string> {
	const variables = new Map<string, string>();

	for (const sourceLine of content.split(/\r?\n/)) {
		const match = sourceLine.match(/^\s*@?set\s+(.+?)\s*$/i);
		if (!match) {
			continue;
		}

		let assignment = match[1];
		if (assignment.startsWith('"') && assignment.endsWith('"')) {
			assignment = assignment.slice(1, -1);
		}

		const separator = assignment.indexOf('=');
		if (separator < 1) {
			continue;
		}

		const name = assignment.slice(0, separator).trim().toLowerCase();
		const value = assignment.slice(separator + 1).trim();
		variables.set(name, value);
	}

	return variables;
}

function getDatabaseRole(): DatabaseRole {
	return vscode.workspace.getConfiguration('vcVeTools').get(databaseRoleSetting) === 'test'
		? 'test'
		: 'main';
}

function getRoleVariable(variables: Map<string, string>, name: string, role: DatabaseRole): string | undefined {
	return variables.get(`${name}_${role}`) ?? variables.get(name);
}

async function getProjectDatabaseOptions(): Promise<DatabaseConnectionOptions> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		throw new Error('Сначала откройте папку проекта.');
	}

	const varsPath = vscode.Uri.joinPath(workspaceFolder.uri, 'Vars.bat');
	let varsContent: string;
	try {
		varsContent = iconv.decode(await readFile(varsPath.fsPath), 'win1251');
	} catch {
		throw new Error('В корне проекта не найден или недоступен файл Vars.bat.');
	}

	const variables = parseVarsFile(varsContent);
	const databaseRole = getDatabaseRole();
	const password = getRoleVariable(variables, 'oedbmspassword', databaseRole);
	const database = variables.get(`devdbname_${databaseRole}`);
	const port = Number(getRoleVariable(variables, 'oedbmsport', databaseRole) ?? '5432');

	if (!database) {
		throw new Error('В Vars.bat не указано devDBName_main.');
	}
	if (!password) {
		throw new Error('В Vars.bat не указан oeDBMSPassword.');
	}
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('В Vars.bat указан некорректный oeDBMSPort.');
	}

	return {
		host: getRoleVariable(variables, 'oedbmshost', databaseRole) ?? 'localhost',
		port,
		database,
		user: getRoleVariable(variables, 'oedbmsusername', databaseRole) ?? 'postgres',
		password,
	};
}

async function testDatabaseConnection(): Promise<{ database: string; user: string }> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({
		...options,
		application_name: 'vc-ve-tools',
		connectionTimeoutMillis: 5000,
	});

	try {
		await client.connect();
		const result = await client.query<{ database: string; user: string }>(
			'SELECT current_database() AS database, current_user AS user',
		);
		const row = result.rows[0];
		if (!row) {
			throw new Error('База не вернула результат проверки.');
		}
		return row;
	} finally {
		await client.end().catch(() => undefined);
	}
}

async function loadClasses(): Promise<ClassTreeRow[]> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({
		...options,
		application_name: 'vc-ve-tools',
		connectionTimeoutMillis: 5000,
	});

	try {
		await client.connect();
		const classesResult = await client.query<ClassRow>(
			`SELECT id, name, seniorid, ord
			 FROM classes
			 ORDER BY ord NULLS LAST, name`,
		);
		const commentsResult = await client.query<ClassCommentRow>(
			`SELECT comments.id, comments.name, comments.seniorid, comments.ord
			 FROM objcomments AS comments
			 INNER JOIN classes ON classes.id = comments.seniorid
			 ORDER BY comments.ord NULLS LAST, comments.name`,
		);
		const metaDataCountsResult = await client.query<ObjectMetaDataCountRow>(
			`SELECT map.seniorid, COUNT(map.id) AS count
			 FROM objectmetadatamap AS map
			 INNER JOIN classes ON classes.id = map.seniorid
			 WHERE map.metaobjectclassid = 5
			 GROUP BY map.seniorid`,
		);

		const commentsBySeniorId = new Map<number, ClassCommentRow[]>();
		for (const comment of commentsResult.rows) {
			const comments = commentsBySeniorId.get(comment.seniorid) ?? [];
			comments.push(comment);
			commentsBySeniorId.set(comment.seniorid, comments);
		}
		const metaDataCountBySeniorId = new Map(
			metaDataCountsResult.rows.map((item) => [item.seniorid, Number(item.count)]),
		);

		return classesResult.rows.map((classRow) => ({
			...classRow,
			comments: commentsBySeniorId.get(classRow.id) ?? [],
			objectMetaDataCount: metaDataCountBySeniorId.get(classRow.id) ?? 0,
		}));
	} finally {
		await client.end().catch(() => undefined);
	}
}

function escapeHtml(value: string | number | null): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function isEnabled(value: number | null): string {
	return value ? 'checked' : '';
}

function classDetailField(label: string, value: string | number | null): string {
	return `<label class="field"><span>${escapeHtml(label)}:</span><input readonly value="${escapeHtml(value)}"></label>`;
}

function getClassDetailsHtml(webview: vscode.Webview, extensionUri: vscode.Uri, classDetails: ClassDetails): string {
	const classIconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'class.svg'));
	const property = (label: string, value: number | null) => `<label class="property"><input type="checkbox" disabled ${isEnabled(value)}><span>${escapeHtml(label)}</span></label>`;

	return /* html */ `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${webview.cspSource};">
<style>
	:root { color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
	body { margin: 0; padding: 0 14px 16px; }
	.tabs { border-bottom: 1px solid var(--vscode-panel-border); display: flex; margin-bottom: 16px; }
	.tab { align-items: center; border-bottom: 2px solid var(--vscode-focusBorder); display: flex; gap: 6px; padding: 8px 10px 6px; }
	.class-icon { background-color: var(--vscode-symbolIcon-classForeground); height: 16px; mask: url('${classIconUri}') center / contain no-repeat; -webkit-mask: url('${classIconUri}') center / contain no-repeat; width: 16px; }
	.details { display: grid; gap: 12px 36px; grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr); max-width: 1060px; }
	.field { align-items: center; display: grid; gap: 10px; grid-template-columns: 130px minmax(0, 1fr); min-height: 28px; }
	.field input { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); color: var(--vscode-input-foreground); font: inherit; min-width: 0; padding: 4px 6px; }
	.properties { border: 1px solid var(--vscode-panel-border); margin-top: 16px; max-width: 620px; padding: 8px 10px 10px; }
	.properties legend { padding: 0 4px; }
	.properties-grid { display: grid; gap: 5px 20px; grid-template-columns: repeat(3, minmax(145px, 1fr)); }
	.property { align-items: center; display: flex; gap: 5px; }
	.property input { accent-color: var(--vscode-checkbox-selectBorder); margin: 0; }
	.description { border: 1px solid var(--vscode-panel-border); margin-top: 16px; padding: 8px 10px 10px; }
	.description textarea { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); box-sizing: border-box; color: var(--vscode-input-foreground); font: inherit; margin-top: 6px; min-height: 105px; resize: vertical; width: 100%; }
	@media (max-width: 760px) { .details { grid-template-columns: 1fr; } .properties-grid { grid-template-columns: 1fr 1fr; } }
</style>
</head>
<body>
	<nav class="tabs"><span class="tab"><span class="class-icon"></span>Класс</span></nav>
	<section class="details">
		<div>
			${classDetailField('Имя', classDetails.name)}
			${classDetailField('Псевдонимы', classDetails.aliases)}
			${classDetailField('Полное имя', classDetails.title)}
			${classDetailField('Имя объекта', classDetails.dbtablename)}
			${classDetailField('Вывод', classDetails.dispexpression)}
			${classDetailField('Доп. вывод', classDetails.adddispexpression)}
		</div>
		<div>
			${classDetailField('Ид', classDetails.id)}
			${classDetailField('Таблица', classDetails.dbtablename)}
			${classDetailField('Класс детей', classDetails.childclassname)}
			${classDetailField('Класс владельца', classDetails.parentclassname)}
			${classDetailField('Кэш-объекты', classDetails.cacheobjclass)}
			${classDetailField('Пров. ссылочн. цел.', classDetails.refintegritycheck)}
			${classDetailField('Алиас по умолчанию', classDetails.defaultdbalias)}
		</div>
	</section>
	<fieldset class="properties">
		<legend>Свойства</legend>
		<div class="properties-grid">
			${property('Абстрактный', classDetails.isabstract)}
			${property('Виртуальный', classDetails.virtual)}
			${property('Наследуемый', classDetails.isinheritable)}
			${property('Кэшируемый', classDetails.cached)}
			${property('Одна таблица', classDetails.onedbtable)}
			${property('Общая таблица', classDetails.tableshared)}
			${property('Упорядочиваемый', classDetails.ordered)}
			${property('Класс-представление', classDetails.isview)}
			${property('Неиспользуемый', classDetails.unreferenced)}
		</div>
	</fieldset>
	<fieldset class="description"><legend>Описание</legend><textarea readonly></textarea></fieldset>
</body>
</html>`;
}

async function getClassDetails(id: number): Promise<ClassDetails> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	let classDetails: ClassDetails | undefined;
	try {
		await client.connect();
		const result = await client.query<ClassDetails>(
			`SELECT class.*, child.name AS childclassname, parent.name AS parentclassname
			 FROM classes AS class
			 LEFT JOIN classes AS child ON child.id = class.childclassid
			 LEFT JOIN classes AS parent ON parent.id = class.parentclassid
			 WHERE class.id = $1`,
			[id],
		);
		classDetails = result.rows[0];
	} finally {
		await client.end().catch(() => undefined);
	}

	if (!classDetails) {
		throw new Error('Класс не найден в базе.');
	}
	return classDetails;
}

function updateClassDetailPanel(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, classDetails: ClassDetails): void {
	panel.title = `Класс ${classDetails.name}`;
	panel.webview.html = getClassDetailsHtml(panel.webview, context.extensionUri, classDetails);
	panel.reveal(vscode.ViewColumn.Active);
}

async function openClassDetails(context: vscode.ExtensionContext, id: number, pinned: boolean): Promise<void> {
	const existingPanel = classDetailPanels.get(id);
	if (existingPanel) {
		if (pinned && !existingPanel.pinned) {
			existingPanel.pinned = true;
			previewClassPanelId = undefined;
		}
		existingPanel.panel.reveal(vscode.ViewColumn.Active);
		return;
	}

	const classDetails = await getClassDetails(id);
	const previousPreviewPanelId = previewClassPanelId;
	const previewPanel = previousPreviewPanelId === undefined
		? undefined
		: classDetailPanels.get(previousPreviewPanelId);

	if (previewPanel && previousPreviewPanelId !== undefined && !previewPanel.pinned) {
		classDetailPanels.delete(previousPreviewPanelId);
		classDetailPanels.set(id, previewPanel);
		previewPanel.pinned = pinned;
		previewClassPanelId = pinned ? undefined : id;
		updateClassDetailPanel(previewPanel.panel, context, classDetails);
		return;
	}

	const panel = vscode.window.createWebviewPanel(
		'vc-ve-tools.classDetails',
		`Класс ${classDetails.name}`,
		vscode.ViewColumn.Active,
		{ localResourceRoots: [context.extensionUri] },
	);
	panel.webview.html = getClassDetailsHtml(panel.webview, context.extensionUri, classDetails);
	classDetailPanels.set(id, { panel, pinned });
	if (!pinned) {
		previewClassPanelId = id;
	}
	panel.onDidDispose(() => {
		for (const [panelId, entry] of classDetailPanels) {
			if (entry.panel === panel) {
				classDetailPanels.delete(panelId);
				if (previewClassPanelId === panelId) {
					previewClassPanelId = undefined;
				}
			}
		}
	});
}

function isOpenClassMessage(message: unknown): message is { command: 'openClass'; id: number; pinned: boolean } {
	return typeof message === 'object'
		&& message !== null
		&& 'command' in message
		&& 'id' in message
		&& 'pinned' in message
		&& message.command === 'openClass'
		&& typeof message.id === 'number'
		&& typeof message.pinned === 'boolean';
}

function closeClassDetailPanels(): void {
	for (const { panel } of [...classDetailPanels.values()]) {
		panel.dispose();
	}
	classDetailPanels.clear();
	previewClassPanelId = undefined;
}

class ExplorerViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly getClasses: () => Promise<ClassTreeRow[]>,
		private readonly openClass: (id: number, pinned: boolean) => Promise<void>,
	) {}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};
		webviewView.webview.html = this.getHtml(webviewView.webview);
		webviewView.webview.onDidReceiveMessage((message: unknown) => {
			if (message === 'loadClasses') {
				void this.sendClasses();
			}
			if (isOpenClassMessage(message)) {
				void this.openClass(message.id, message.pinned).catch((error) => {
					const detail = error instanceof Error ? error.message : String(error);
					void vscode.window.showErrorMessage(`Не удалось открыть класс: ${detail}`);
				});
			}
		});
	}

	dispose(): void {
		this.view = undefined;
	}

	refreshClasses(): void {
		void this.view?.webview.postMessage({ command: 'resetClasses' });
	}

	private async sendClasses(): Promise<void> {
		try {
			const classes = await this.getClasses();
			await this.view?.webview.postMessage({ command: 'classesLoaded', classes });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.view?.webview.postMessage({ command: 'classesLoadFailed', message });
		}
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = Math.random().toString(36).slice(2);
		const classIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'resources', 'class.svg'));

		return /* html */ `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
	:root { color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
	body { margin: 0; padding: 0 8px 12px; }
	button { color: inherit; font: inherit; }
	.explorer-tabs { border-bottom: 1px solid var(--vscode-panel-border); display: flex; gap: 0; margin: 4px 0 12px; }
	.explorer-tab { background: transparent; border: 0; border-bottom: 2px solid transparent; cursor: pointer; padding: 6px 9px 5px; }
	.explorer-tab:hover { background: var(--vscode-toolbar-hoverBackground); }
	.explorer-tab.active { border-bottom-color: var(--vscode-focusBorder); color: var(--vscode-tab-activeForeground); }
	.empty { color: var(--vscode-descriptionForeground); line-height: 1.5; padding: 14px 6px; }
	.class-tree, .class-tree ul { list-style: none; margin: 0; padding-left: 16px; }
	.class-tree { padding-left: 0; }
	.class-row { align-items: center; border-radius: 3px; cursor: default; display: flex; gap: 4px; min-height: 22px; padding: 0 4px; }
	.class-row:hover { background: var(--vscode-list-hoverBackground); }
	.class-toggle { align-items: center; background: transparent; border: 0; color: var(--vscode-foreground); cursor: pointer; display: flex; height: 20px; justify-content: center; padding: 0; width: 16px; }
	.class-toggle svg { fill: currentColor; height: 16px; transition: transform 80ms linear; width: 16px; }
	.class-toggle.expanded svg { transform: rotate(90deg); }
	.class-toggle.empty { cursor: default; visibility: hidden; }
	.class-icon { background-color: var(--vscode-symbolIcon-classForeground); height: 14px; mask: url('${classIconUri}') center / contain no-repeat; -webkit-mask: url('${classIconUri}') center / contain no-repeat; width: 14px; }
	.object-icon { color: var(--vscode-symbolIcon-variableForeground); font-size: 13px; text-align: center; width: 14px; }
	.class-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.class-children[hidden] { display: none; }
</style>
</head>
<body>
	<nav class="explorer-tabs" aria-label="Проводник">
		<button class="explorer-tab active" data-explorer-tab="packages" type="button">Пакеты</button>
		<button class="explorer-tab" data-explorer-tab="objects" type="button">Объекты</button>
		<button class="explorer-tab" data-explorer-tab="classes" type="button">Классы</button>
	</nav>
	<div class="explorer-content" data-explorer-content="packages"><div class="empty">Пакеты пока не загружены.</div></div>
	<div class="explorer-content" data-explorer-content="objects" hidden><div class="empty">Объекты пока не загружены.</div></div>
	<div class="explorer-content" data-explorer-content="classes" hidden><div id="classes-status" class="empty">Откройте вкладку, чтобы загрузить классы.</div><div id="classes-tree"></div></div>
<script nonce="${nonce}">
	const vscode = acquireVsCodeApi();
	let classesLoaded = false;
	let classesLoading = false;
	let classClickTimer;
	let activeExplorerTab = 'packages';
	const requestClasses = () => {
		if (classesLoaded || classesLoading) return;
		classesLoading = true;
		document.getElementById('classes-status').textContent = 'Загрузка классов…';
		vscode.postMessage('loadClasses');
	};
	const switchTab = (selector, attribute, value) => {
		document.querySelectorAll(selector).forEach((element) => element.classList.toggle('active', element.dataset[attribute] === value));
	};
	document.querySelectorAll('[data-explorer-tab]').forEach((button) => button.addEventListener('click', () => {
		const tab = button.dataset.explorerTab;
		switchTab('[data-explorer-tab]', 'explorerTab', tab);
		document.querySelectorAll('[data-explorer-content]').forEach((element) => { element.hidden = element.dataset.explorerContent !== tab; });
		activeExplorerTab = tab;
		if (tab === 'classes') requestClasses();
	}));
	function renderClassTree(classes) {
		const byId = new Map(classes.map((item) => [item.id, { ...item, kind: 'class', children: [] }]));
		const roots = [];
		byId.forEach((item) => {
			const parent = byId.get(item.seniorid);
			if (parent && parent !== item) parent.children.push(item);
			else roots.push(item);
		});
		byId.forEach((item) => {
			const additionalChildren = item.comments.map((comment) => ({
				id: 'comment-' + comment.id,
				name: comment.name || 'Комментарий #' + comment.id,
				kind: 'comment',
				children: [],
			}));
			if (item.objectMetaDataCount > 0) {
				additionalChildren.push({
					id: 'metadata-' + item.id,
					name: 'Объекты метаданных (' + item.objectMetaDataCount + ')',
					kind: 'metadata',
					children: [],
				});
			}
			item.children.unshift(...additionalChildren);
		});
		const tree = document.createElement('ul');
		tree.className = 'class-tree';
		const root = {
			id: 'root',
			name: 'Root',
			kind: 'root',
			children: roots.length === 1 ? roots[0].children : roots,
		};
		function createNode(item, expanded = false) {
			const entry = document.createElement('li');
			const row = document.createElement('div');
			row.className = 'class-row';
			const toggle = document.createElement('button');
			toggle.className = 'class-toggle';
			toggle.type = 'button';
			const hasChildren = item.children.length > 0;
			toggle.classList.toggle('expanded', expanded);
			if (!hasChildren) toggle.classList.add('empty');
			const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			chevron.setAttribute('viewBox', '0 0 16 16');
			chevron.setAttribute('aria-hidden', 'true');
			const chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			chevronPath.setAttribute('d', 'M5.7 4.7 9 8l-3.3 3.3.7.7 4-4-4-4-.7.7Z');
			chevron.append(chevronPath);
			toggle.append(chevron);
			const icon = document.createElement('span');
			if (item.kind === 'class' || item.kind === 'root') {
				icon.className = 'class-icon';
			} else {
				icon.className = 'object-icon';
				icon.textContent = item.kind === 'comment' ? '◌' : '▣';
			}
			const name = document.createElement('span');
			name.className = 'class-name';
			name.textContent = item.name;
			row.append(toggle, icon, name);
			if (item.kind === 'class') {
				row.style.cursor = 'pointer';
				row.addEventListener('click', () => {
					clearTimeout(classClickTimer);
					classClickTimer = setTimeout(() => vscode.postMessage({ command: 'openClass', id: item.id, pinned: false }), 180);
				});
				row.addEventListener('dblclick', () => {
					clearTimeout(classClickTimer);
					vscode.postMessage({ command: 'openClass', id: item.id, pinned: true });
				});
			}
			entry.append(row);
			if (hasChildren) {
				const children = document.createElement('ul');
				children.className = 'class-children';
				children.hidden = !expanded;
				item.children.forEach((child) => children.append(createNode(child)));
				const toggleChildren = () => {
					children.hidden = !children.hidden;
					toggle.classList.toggle('expanded', !children.hidden);
				};
				toggle.addEventListener('click', (event) => { event.stopPropagation(); toggleChildren(); });
				if (item.kind !== 'class') row.addEventListener('dblclick', toggleChildren);
				entry.append(children);
			}
			return entry;
		}
		tree.append(createNode(root, true));
		document.getElementById('classes-tree').replaceChildren(tree);
	}
	window.addEventListener('message', (event) => {
		const message = event.data;
		if (message.command === 'classesLoaded') {
			classesLoading = false;
			classesLoaded = true;
			document.getElementById('classes-status').textContent = message.classes.length ? '' : 'Классы не найдены.';
			renderClassTree(message.classes);
		}
		if (message.command === 'classesLoadFailed') {
			classesLoading = false;
			document.getElementById('classes-status').textContent = 'Не удалось загрузить классы: ' + message.message;
		}
		if (message.command === 'resetClasses') {
			classesLoaded = false;
			classesLoading = false;
			document.getElementById('classes-tree').replaceChildren();
			document.getElementById('classes-status').textContent = 'Данные базы изменены.';
			if (activeExplorerTab === 'classes') requestClasses();
		}
	});
</script>
</body>
</html>`;
	}
}

async function applyProjectEncoding(context: vscode.ExtensionContext, enabled: boolean): Promise<void> {
	let previousEncodings = context.workspaceState.get<PreviousEncoding[]>(previousEncodingsKey);

	if (enabled && !previousEncodings) {
		previousEncodings = sourceLanguageIds.map((languageId) => {
			const encoding = vscode.workspace
				.getConfiguration('files', { languageId })
				.inspect<string>('encoding')?.workspaceLanguageValue;

			return {
				languageId,
				hadValue: encoding !== undefined,
				value: encoding,
			};
		});
		await context.workspaceState.update(previousEncodingsKey, previousEncodings);
	}

	for (const languageId of sourceLanguageIds) {
		const configuration = vscode.workspace.getConfiguration('files', { languageId });
		const previousEncoding = previousEncodings?.find((item) => item.languageId === languageId);
		const encoding = enabled
			? 'windows1251'
			: previousEncoding?.hadValue
				? previousEncoding.value
				: undefined;

		await configuration.update(
			'encoding',
			encoding,
			vscode.ConfigurationTarget.Workspace,
			true,
		);
	}

	if (!enabled) {
		await context.workspaceState.update(previousEncodingsKey, undefined);
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const extensionConfiguration = vscode.workspace.getConfiguration('vcVeTools');
	let isUpdatingSetting = false;
	const settingsProvider = new SettingsProvider(
		extensionConfiguration.get(projectRootSetting, false),
		getDatabaseRole(),
	);
	const settingsView = vscode.window.createTreeView('vc-ve-tools.settings', {
		treeDataProvider: settingsProvider,
	});

	const updateProjectRootSetting = async (enabled: boolean): Promise<void> => {

		if (!vscode.workspace.workspaceFolders?.length) {
			settingsProvider.setProjectRootEnabled(false);
			void vscode.window.showWarningMessage('Сначала откройте папку проекта.');
			return;
		}

		try {
			isUpdatingSetting = true;
			await vscode.workspace.getConfiguration('vcVeTools').update(
				projectRootSetting,
				enabled,
				vscode.ConfigurationTarget.Workspace,
			);
			await applyProjectEncoding(context, enabled);
			settingsProvider.setProjectRootEnabled(enabled);
			void vscode.window.showInformationMessage(
				enabled
					? 'PKF, Pascal и BAT-файлы будут открываться в кодировке Cyrillic (Windows 1251).'
					: 'Кодировка PKF, Pascal и BAT-файлов восстановлена.',
			);
		} catch (error) {
			const currentValue = vscode.workspace.getConfiguration('vcVeTools').get(projectRootSetting, false);
			settingsProvider.setProjectRootEnabled(currentValue);
			void vscode.window.showErrorMessage(`Не удалось изменить кодировку проекта: ${String(error)}`);
		} finally {
			isUpdatingSetting = false;
		}
	};

	const explorerProvider = new ExplorerViewProvider(
		context.extensionUri,
		loadClasses,
		(id, pinned) => openClassDetails(context, id, pinned),
	);
	const explorerRegistration = vscode.window.registerWebviewViewProvider(
		'vc-ve-tools.explorer',
		explorerProvider,
	);
	const checkboxListener = settingsView.onDidChangeCheckboxState((event) => {
		const enabled = event.items[0]?.[1] === vscode.TreeItemCheckboxState.Checked;
		void updateProjectRootSetting(enabled);
	});

	const configurationListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
		if (event.affectsConfiguration(`vcVeTools.${databaseRoleSetting}`)) {
			settingsProvider.setDatabaseRole(getDatabaseRole());
			closeClassDetailPanels();
			explorerProvider.refreshClasses();
		}

		if (!isUpdatingSetting && event.affectsConfiguration(`vcVeTools.${projectRootSetting}`)) {
			const enabled = vscode.workspace.getConfiguration('vcVeTools').get(projectRootSetting, false);
			settingsProvider.setProjectRootEnabled(enabled);
			try {
				await applyProjectEncoding(context, enabled);
			} catch (error) {
				void vscode.window.showErrorMessage(`Не удалось изменить кодировку проекта: ${String(error)}`);
			}
		}
	});

	if (extensionConfiguration.get(projectRootSetting, false) && vscode.workspace.workspaceFolders?.length) {
		await applyProjectEncoding(context, true);
	}

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vc-ve-tools" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('vc-ve-tools.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Восточный Экспресс расширение!');
	});
	const testDatabaseConnectionCommand = vscode.commands.registerCommand(
		'vc-ve-tools.testDatabaseConnection',
		async () => {
			try {
				const result = await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Проверка подключения к базе',
					},
					testDatabaseConnection,
				);
				void vscode.window.showInformationMessage(
					`Подключение установлено: ${result.database}, пользователь ${result.user}.`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				void vscode.window.showErrorMessage(`Не удалось подключиться к базе: ${message}`);
			}
		},
	);
	const selectDatabaseRoleCommand = vscode.commands.registerCommand(
		'vc-ve-tools.selectDatabaseRole',
		async () => {
			if (!vscode.workspace.workspaceFolders?.length) {
				void vscode.window.showWarningMessage('Сначала откройте папку проекта.');
				return;
			}

			const selected = await vscode.window.showQuickPick(
				[
					{ label: 'Основная', description: 'devDBName_main', role: 'main' as const },
					{ label: 'Тестовая', description: 'devDBName_test', role: 'test' as const },
				],
				{ placeHolder: 'Выберите базу данных' },
			);
			if (!selected || selected.role === getDatabaseRole()) {
				return;
			}

			await vscode.workspace.getConfiguration('vcVeTools').update(
				databaseRoleSetting,
				selected.role,
				vscode.ConfigurationTarget.Workspace,
			);
		},
	);

	context.subscriptions.push(
		settingsProvider,
		settingsView,
		explorerProvider,
		explorerRegistration,
		checkboxListener,
		configurationListener,
		disposable,
		testDatabaseConnectionCommand,
		selectDatabaseRoleCommand,
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}

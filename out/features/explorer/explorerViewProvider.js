"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExplorerViewProvider = void 0;
const vscode = __importStar(require("vscode"));
function isOpenClassMessage(message) {
    return typeof message === 'object' && message !== null && 'command' in message && 'id' in message && 'pinned' in message
        && message.command === 'openClass' && typeof message.id === 'number' && typeof message.pinned === 'boolean';
}
class ExplorerViewProvider {
    extensionUri;
    getClasses;
    openClass;
    view;
    constructor(extensionUri, getClasses, openClass) {
        this.extensionUri = extensionUri;
        this.getClasses = getClasses;
        this.openClass = openClass;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };
        webviewView.webview.html = this.getHtml(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message) => {
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
    dispose() {
        this.view = undefined;
    }
    refreshClasses() {
        void this.view?.webview.postMessage({ command: 'resetClasses' });
    }
    async sendClasses() {
        try {
            const classes = await this.getClasses();
            await this.view?.webview.postMessage({ command: 'classesLoaded', classes });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.view?.webview.postMessage({ command: 'classesLoadFailed', message });
        }
    }
    getHtml(webview) {
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
exports.ExplorerViewProvider = ExplorerViewProvider;
//# sourceMappingURL=explorerViewProvider.js.map
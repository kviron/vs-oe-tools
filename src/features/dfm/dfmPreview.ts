import * as vscode from 'vscode';
import { getDfmInheritance } from './dfmRepository';

interface Control { name: string; type: string; props: Record<string, string>; children: Control[] }
let panel: vscode.WebviewPanel | undefined;

export async function openDfmPreview(context: vscode.ExtensionContext, classId: number): Promise<void> {
	const sources = await getDfmInheritance(classId);
	const source = sources.at(-1)!;
	if (!panel) {
		panel = vscode.window.createWebviewPanel('vc-ve-tools.dfmPreview', 'Просмотр DFM', vscode.ViewColumn.Active, { enableScripts: false });
		panel.onDidDispose(() => { panel = undefined; }, undefined, context.subscriptions);
	} else panel.reveal(vscode.ViewColumn.Active, true);
	panel.title = `Диалог: ${source.className}`;
	const roots = sources.map(item => parseDfm(item.text)).filter((item): item is Control => Boolean(item));
	panel.webview.html = render(roots.reduce((merged, current) => mergeControls(merged, current)), source.className);
}

function mergeControls(base: Control, override: Control): Control {
	const children = base.children.map(child => ({ ...child, props: { ...child.props }, children: [...child.children] }));
	for (const child of override.children) {
		const index = children.findIndex(candidate => candidate.name.toLocaleLowerCase('ru') === child.name.toLocaleLowerCase('ru'));
		if (index >= 0) children[index] = mergeControls(children[index], child);
		else children.push(child);
	}
	return { name: override.name || base.name, type: override.type || base.type, props: { ...base.props, ...override.props }, children };
}

function parseDfm(text: string): Control | undefined {
	const stack: Control[] = []; let root: Control | undefined; let collectionItemDepth = 0;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (/^item\s*$/i.test(line)) { collectionItemDepth++; continue; }
		const start = line.match(/^(object|inherited|inline)\s+([^:]+)(?::\s*(\S+))?/i);
		if (start) { const node = { name: start[2].trim(), type: start[3] ?? (start[1].toLowerCase() === 'object' ? 'TForm' : ''), props: {}, children: [] }; if (stack.length) stack.at(-1)!.children.push(node); else root = node; stack.push(node); continue; }
		if (/^end\s*$/i.test(line)) { if (collectionItemDepth > 0) collectionItemDepth--; else stack.pop(); continue; }
		const prop = line.match(/^([\w.]+)\s*=\s*(.*)$/); if (prop && stack.length) stack.at(-1)!.props[prop[1]] = prop[2];
	}
	return root;
}

function render(root: Control | undefined, title: string): string {
	const body = root ? controlHtml(root, true) : '<p>Не удалось разобрать структуру DFM.</p>';
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
	body{margin:0;padding:20px;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family)}
	.stage{position:relative;min-width:100%;min-height:calc(100vh - 40px);overflow:auto}.form{position:relative;background:var(--vscode-input-background);border:1px solid var(--vscode-panel-border);box-shadow:0 8px 24px #0004}.caption{height:28px;padding:5px 9px;box-sizing:border-box;background:var(--vscode-titleBar-activeBackground);border-bottom:1px solid var(--vscode-panel-border)}.client{position:absolute;left:0;top:28px;overflow:hidden}
	.control{position:absolute;box-sizing:border-box;font:12px var(--vscode-font-family)}.label{border:0;background:transparent;white-space:normal;line-height:14px}.button{display:flex;align-items:center;justify-content:center;border:1px solid var(--vscode-button-border,var(--vscode-panel-border));background:var(--vscode-button-secondaryBackground);padding:2px 6px}.input,.memo,.combo{border:1px solid var(--vscode-input-border,var(--vscode-panel-border));background:var(--vscode-input-background);padding:2px 4px;color:var(--vscode-input-foreground)}.combo{display:flex;align-items:center;justify-content:space-between}.checkbox{display:flex;align-items:flex-start;gap:4px}.checkmark{width:13px;height:13px;flex:none;border:1px solid var(--vscode-checkbox-border,var(--vscode-input-border));background:var(--vscode-checkbox-background)}.group{border:1px solid var(--vscode-panel-border);background:transparent;padding:10px 4px 4px}.group>legend{font-size:12px;padding:0 3px}.panel{border:1px solid var(--vscode-panel-border);background:transparent}.memo{white-space:pre-wrap}.unknown{border:1px dashed var(--vscode-descriptionForeground);padding:2px 4px}.hint{opacity:.7;font-size:10px}
	</style><title>${esc(title)}</title></head><body><div class="stage">${body}</div></body></html>`;
}
function controlHtml(node: Control, isRoot = false): string {
	const type = node.type.toLowerCase(); const caption = clean(node.props.Caption ?? node.props.Text ?? '');
	if (!isRoot && (!isVisible(node) || isNonVisual(type))) return '';
	const defaultWidth = /label|statictext/.test(type) ? Math.max(20, caption.length * 7) : 100;
	const defaultHeight = /label|statictext/.test(type) ? 16 : /checkbox|radiobutton/.test(type) ? 17 : 24;
	const width = numberProp(node, 'ClientWidth', numberProp(node, 'Width', isRoot ? 500 : defaultWidth)); const height = numberProp(node, 'ClientHeight', numberProp(node, 'Height', isRoot ? 350 : defaultHeight));
	if (isRoot) return `<section class="form" style="width:${width}px;height:${height + 28}px"><header class="caption">${esc(caption || node.name)}</header><div class="client" style="width:${width}px;height:${height}px">${node.children.map(child => controlHtml(child)).join('')}</div></section>`;
	const left = numberProp(node, 'Left', 0); const top = numberProp(node, 'Top', 0); let kind = 'unknown'; let tag = 'div';
	if (/label|statictext/.test(type)) kind = 'label'; else if (/button/.test(type)) kind = 'button'; else if (/groupbox/.test(type)) { kind = 'group'; tag = 'fieldset'; } else if (/panel/.test(type)) kind = 'panel'; else if (/memo/.test(type)) kind = 'memo'; else if (/combobox|lookupcombo/.test(type)) kind = 'combo'; else if (/checkbox|radiobutton/.test(type)) kind = 'checkbox'; else if (/edit|datetime|spin/.test(type)) kind = 'input';
	const children = node.children.map(child => controlHtml(child)).join(''); const hint = kind === 'unknown' && caption ? `<span class="hint">${esc(node.type)}</span>` : '';
	const content = kind === 'checkbox' ? `<span class="checkmark"></span><span>${esc(caption)}</span>` : kind === 'combo' ? `<span>${esc(caption)}</span><span>⌄</span>` : tag === 'fieldset' ? `<legend>${esc(caption)}</legend>` : esc(caption);
	return `<${tag} class="control ${kind}" title="${esc(node.name + ': ' + node.type)}" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px">${content}${hint}${children}</${tag}>`;
}
function isVisible(node: Control): boolean {
	const value = clean(node.props.Visible ?? '').trim().toLocaleLowerCase('ru');
	return value !== 'false' && value !== 'ложь' && value !== '0';
}
function isNonVisual(type: string): boolean {
	return /(action|menuitem|popupmenu|mainmenu|imagelist|datasource|timer|applicationevents|openpicturedialog|savedialog|opendialog|colorDialog|fontdialog|dataset|query|table|connection|transaction|provider)/i.test(type);
}
function numberProp(node: Control, name: string, fallback: number): number { const value = Number.parseInt(node.props[name] ?? '', 10); return Number.isFinite(value) ? Math.max(0, value) : fallback; }
function clean(value: string): string { return value.replace(/^'(.*)'$/, '$1').replace(/''/g, "'"); }
function esc(value: string): string { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }

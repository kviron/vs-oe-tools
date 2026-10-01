import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { createMapStore } from './store';
import { mapSchema } from './schema';

const nameSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/i);
const requestSchema = z.discriminatedUnion('operation', [
 z.object({ operation: z.literal('list') }),
 z.object({ operation: z.literal('read'), name: nameSchema }),
 z.object({ operation: z.literal('open'), name: nameSchema.optional() }),
 z.object({ operation: z.literal('save'), name: nameSchema, map: mapSchema, expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).nullable() }),
 z.object({ operation: z.literal('changes'), name: nameSchema, fromRevision: z.string().regex(/^[a-f0-9]{64}$/) }),
]);

/** Owns map persistence and editor panels for this workspace. */
export function registerRelationshipMaps(context: vscode.ExtensionContext): (request: unknown) => Promise<Record<string, unknown>> {
 const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
 const directory = folder ? vscode.Uri.joinPath(folder, '.vscode', 'relationship-maps') : vscode.Uri.joinPath(context.globalStorageUri, 'relationship-maps');
 const store = createMapStore(directory.fsPath);
 const panels = new Set<vscode.WebviewPanel>();
 let ready: Promise<void> | undefined;
 const initialize = () => ready ??= (async () => {
  await mkdir(directory.fsPath, { recursive: true });
  try { await copyFile(context.asAbsolutePath('resources/relationship-maps/extension.json'), path.join(directory.fsPath, 'extension.json'), 1); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') { throw error; } }
 })();
 const notify = (name: string) => { for (const panel of panels) { void panel.webview.postMessage({ type: 'mapChanged', name }); } };
 const handle = async (value: unknown): Promise<Record<string, unknown>> => {
  await initialize();
  const request = requestSchema.parse(value);
  switch (request.operation) {
   case 'list': return { maps: await store.listMaps(), directory: directory.fsPath };
   case 'read': return store.readMap(request.name);
   case 'changes': return store.changesSince(request.name, request.fromRevision);
   case 'save': { const result = await store.saveMap(request.name, request.map, request.expectedRevision); notify(request.name); return result; }
   case 'open': {
    if (request.name) { await store.readMap(request.name); }
    const assets = vscode.Uri.joinPath(context.extensionUri, 'dist', 'relationship-map');
    const panel = vscode.window.createWebviewPanel('vcVeTools.relationshipMap', 'Карты взаимосвязей', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [assets] });
    panels.add(panel);
    panel.onDidDispose(() => panels.delete(panel));
    let editorReady: () => void = () => undefined;
    const readyPromise = new Promise<void>(resolve => { editorReady = resolve; });
    const nonce = randomBytes(18).toString('hex');
    let html = await readFile(vscode.Uri.joinPath(assets, 'index.html').fsPath, 'utf8');
    html = html.replace(/(src|href)="\.\/([^"<>]+)"/g, (_, attribute: string, relative: string) => attribute + '="' + panel.webview.asWebviewUri(vscode.Uri.joinPath(assets, relative)) + '"');
    const csp = "default-src 'none'; img-src " + panel.webview.cspSource + " data: blob:; style-src " + panel.webview.cspSource + " 'unsafe-inline'; script-src 'nonce-" + nonce + "'; font-src " + panel.webview.cspSource + ";";
    html = html.replace('<head>', '<head><meta name="initial-map" content="' + (request.name || '') + '"><meta http-equiv="Content-Security-Policy" content="' + csp + '">').replace(/<script /g, '<script nonce="' + nonce + '" ');
    panel.webview.onDidReceiveMessage(async (message: { id?: unknown; request?: unknown }) => {
     if (typeof message.id !== 'string') { return; }
     try {
      const input = message.request as Record<string, unknown>;
      let result: unknown;
      if (input?.operation === 'ready') { editorReady(); result = { ready: true }; }
      else if (input?.operation === 'prompt') {
       result = await vscode.window.showInputBox({ prompt: z.string().max(200).parse(input.prompt), value: z.string().max(500).parse(input.value) });
      } else if (input?.operation === 'newName') {
       result = await vscode.window.showInputBox({ prompt: 'Имя новой карты', validateInput: value => nameSchema.safeParse(value).success ? undefined : 'Используйте латинские буквы, цифры, _ и -' });
      } else if (input?.operation === 'confirmDiscard') {
       result = await vscode.window.showWarningMessage('Отбросить несохранённые изменения карты?', { modal: true }, 'Отбросить') === 'Отбросить';
       } else if (input?.operation === 'openSource') {
       const file = z.string().parse(input.file);
       const root = typeof input.root === 'string' ? input.root : folder?.fsPath;
       if (!root) { throw new Error('Нет каталога исходников'); }
       const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.resolve(root, file)));
       const line = Math.max(0, z.number().int().positive().optional().parse(input.line || undefined) ? Number(input.line) - 1 : 0);
       await vscode.window.showTextDocument(document, { selection: new vscode.Range(line, 0, line, 0) });
       result = { opened: true };
      } else if (input?.operation === 'export') {
       const map = mapSchema.parse(input.map);
       const target = await vscode.window.showSaveDialog({ filters: { JSON: ['json'] }, defaultUri: vscode.Uri.joinPath(folder || context.globalStorageUri, nameSchema.parse(input.name) + '.json') });
       if (target && path.dirname(target.fsPath).toLowerCase() === directory.fsPath.toLowerCase()) { throw new Error('Для карты в хранилище используйте «Сохранить», чтобы проверить ревизию.'); }
       if (target) { await vscode.workspace.fs.writeFile(target, Buffer.from(JSON.stringify(map, null, 2) + '\n')); }
       result = { exported: Boolean(target) };
      } else { result = await handle(input); }
      await panel.webview.postMessage({ id: message.id, result });
     } catch (error) { await panel.webview.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) }); }
    });
    panel.webview.html = html;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([readyPromise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Редактор карты не загрузился за 15 секунд')), 15000); })]); }
    catch (error) { panel.dispose(); throw error; }
    finally { clearTimeout(timer); }
    return { opened: true, name: request.name, directory: directory.fsPath };
   }
  }
 };
 context.subscriptions.push(vscode.commands.registerCommand('vc-ve-tools.openRelationshipMap', (name?: string) => handle({ operation: 'open', name })), { dispose: () => { for (const panel of panels) { panel.dispose(); } } });
 return handle;
}

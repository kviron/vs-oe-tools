import { readFileSync, statSync } from 'node:fs';
import * as vscode from 'vscode';
import { webviewSnapshotDirectory } from '../../core/webview/assetManifest';

/** Resolves build identity once per view, independently of feature behavior. */
export function getWebviewAssetsRoot(extensionUri: vscode.Uri, entry: string): vscode.Uri {
	const root = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
	let manifest: unknown;
	try { manifest = JSON.parse(readFileSync(vscode.Uri.joinPath(root, 'manifest.json').fsPath, 'utf8')); }
	catch { throw new Error('Не найден манифест сборки WebView. Выполните npm run build:webview.'); }
	const directory = webviewSnapshotDirectory(manifest, entry);
	const assets = vscode.Uri.joinPath(root, ...directory.split('/'));
	for (const file of [`${entry}.js`, 'webview.css']) {
		if (!statSync(vscode.Uri.joinPath(assets, file).fsPath).isFile()) { throw new Error(`Неполная сборка WebView ${entry}.`); }
	}
	return assets;
}

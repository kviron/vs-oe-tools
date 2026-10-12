import * as assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import * as vscode from 'vscode';
import { webviewSnapshotDirectory, type WebviewAssetManifest } from '../core/webview/assetManifest';
import { getWebviewAssetsRoot } from '../infrastructure/webview/assets';

suite('Webview asset contract', () => {
	test('selects a complete versioned snapshot independently for each view', () => {
		const manifest: WebviewAssetManifest = { version: 1, entries: {
			explorer: { directory: `explorer/${'a'.repeat(64)}` },
			settings: { directory: `settings/${'b'.repeat(64)}` },
		} };
		assert.equal(webviewSnapshotDirectory(manifest, 'explorer'), manifest.entries.explorer.directory);
		assert.equal(webviewSnapshotDirectory(manifest, 'settings'), manifest.entries.settings.directory);
	});
	test('rejects missing entries, unknown versions, traversal and cross-view paths', () => {
		for (const value of [null, { version: 2, entries: {} }, { version: 1, entries: {} },
			{ version: 1, entries: { explorer: { directory: '../settings' } } },
			{ version: 1, entries: { explorer: { directory: `settings/${'a'.repeat(64)}` } } }]) {
			assert.throws(() => webviewSnapshotDirectory(value, 'explorer'));
		}
		assert.throws(() => webviewSnapshotDirectory({ version: 1, entries: {} }, '../explorer'));
	});
	test('keeps the resolved old view usable after another manifest is published', () => {
		const root = mkdtempSync(join(tmpdir(), 'vc-ve-webview-runtime-'));
		try {
			const output = join(root, 'dist', 'webview');
			const first = `explorer/${'a'.repeat(64)}`;
			const second = `explorer/${'b'.repeat(64)}`;
			for (const directory of [first, second]) {
				mkdirSync(join(output, directory), { recursive: true });
				writeFileSync(join(output, directory, 'explorer.js'), directory);
				writeFileSync(join(output, directory, 'webview.css'), '');
			}
			writeFileSync(join(output, 'manifest.json'), JSON.stringify({ version: 1, entries: { explorer: { directory: first } } }));
			const old = getWebviewAssetsRoot(vscode.Uri.file(root), 'explorer');
			writeFileSync(join(output, 'manifest.json'), JSON.stringify({ version: 1, entries: { explorer: { directory: second } } }));
			const current = getWebviewAssetsRoot(vscode.Uri.file(root), 'explorer');
			assert.notEqual(current.fsPath, old.fsPath);
			assert.equal(readFileSync(join(old.fsPath, 'explorer.js'), 'utf8'), first);
			assert.equal(readFileSync(join(current.fsPath, 'explorer.js'), 'utf8'), second);
		} finally {
			assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); rmSync(root, { recursive: true, force: true });
		}
	});
	test('resolves the checked assets for every registered bundled screen', () => {
		const root = resolve(__dirname, '../..');
		const entries: string[] = JSON.parse(readFileSync(join(root, 'webview-ui', 'entries.json'), 'utf8'));
		for (const entry of entries) {
			const assets = getWebviewAssetsRoot(vscode.Uri.file(root), entry);
			assert.ok(assets.fsPath.includes(entry), entry);
		}
	});
});

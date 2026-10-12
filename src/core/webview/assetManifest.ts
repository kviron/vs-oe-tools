export interface WebviewAssetManifest {
	version: 1;
	entries: Record<string, { directory: string }>;
}

/** Selects a published snapshot and confines its path to the named entry. */
export function webviewSnapshotDirectory(value: unknown, entry: string): string {
	if (!/^[a-z][a-z0-9-]*$/.test(entry) || typeof value !== 'object' || value === null
		|| !('version' in value) || value.version !== 1 || !('entries' in value)
		|| typeof value.entries !== 'object' || value.entries === null) {
		throw new Error('Некорректный манифест сборки WebView. Выполните npm run build:webview.');
	}
	const snapshot = Object.hasOwn(value.entries, entry) ? (value.entries as Record<string, unknown>)[entry] : undefined;
	if (typeof snapshot !== 'object' || snapshot === null || !('directory' in snapshot)
		|| typeof snapshot.directory !== 'string' || !new RegExp(`^${entry}/[a-f0-9]{64}$`).test(snapshot.directory)) {
		throw new Error(`В манифесте нет готовой сборки WebView ${entry}. Выполните npm run build:webview.`);
	}
	return snapshot.directory;
}

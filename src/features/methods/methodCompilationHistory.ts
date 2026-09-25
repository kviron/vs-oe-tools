import { appendFile, mkdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { MethodCompilationDiagnostic } from './methodCompilation';

export interface MethodCompilationRecord {
	timestamp: string;
	methodId: number;
	source: 'editor' | 'agent';
	database: string;
	host: string;
	status: 'ok' | 'diagnostics' | 'failed';
	passed: boolean;
	errorCount: number;
	warningCount: number;
	diagnostics: MethodCompilationDiagnostic[];
	error?: string;
}

export class MethodCompilationHistory {
	private pending = Promise.resolve();

	constructor(readonly filePath: string) {}

	append(record: MethodCompilationRecord): Promise<void> {
		const write = this.pending.then(async () => {
			await mkdir(path.dirname(this.filePath), { recursive: true });
			await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
		});
		this.pending = write.catch(() => undefined);
		return write;
	}

	async recent(methodId?: number, limit = 50): Promise<MethodCompilationRecord[]> {
		await this.pending;
		let content: string;
		try { content = await readFile(this.filePath, 'utf8'); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return []; }
			throw error;
		}
		const records: MethodCompilationRecord[] = [];
		for (const line of content.trimEnd().split('\n').reverse()) {
			if (!line) { continue; }
			try {
				const record = JSON.parse(line) as MethodCompilationRecord;
				if (methodId === undefined || record.methodId === methodId) { records.push(record); }
				if (records.length >= limit) { break; }
			} catch { /* Ignore an incomplete trailing record. */ }
		}
		return records;
	}
}

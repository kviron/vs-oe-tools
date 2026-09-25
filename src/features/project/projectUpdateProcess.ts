import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import * as vscode from 'vscode';

/** Writes one update run to both the VS Code output channel and its disk journal. */
export class UpdateLog {
	private pending = Promise.resolve();
	private writeError: unknown;
	constructor(private readonly output: vscode.OutputChannel, readonly path: string) {}
	appendLine(line: string): void {
		const safe = line.replace(/(password\s*[=:]\s*)[^\s;]+/gi, '$1<redacted>');
		this.output.appendLine(safe);
		this.pending = this.pending.then(() => appendFile(this.path, `${new Date().toISOString()} ${safe}\n`))
			.catch(error => { this.writeError ??= error; });
	}
	async flush(): Promise<void> {
		await this.pending;
		if (this.writeError) { throw this.writeError; }
	}
}

/** Runs a native OE executable and captures its Windows-1251 output. */
export function runProjectProcess(
	executable: string,
	args: string[],
	cwd: string,
	log: UpdateLog,
	token?: vscode.CancellationToken,
	extraEnv?: NodeJS.ProcessEnv,
	encoding: 'win1251' | 'cp866' = 'win1251',
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(executable, args, { cwd, windowsHide: true, shell: false, env: { ...process.env, ...extraEnv } });
		let cancelled = false;
		const cancel = token?.onCancellationRequested(() => { cancelled = true; child.kill(); });
		const streamLog = () => {
			const decoder = iconv.getDecoder(encoding);
			let tail = '';
			return {
				append(chunk: Buffer) {
					tail += decoder.write(chunk);
					const lines = tail.split(/\r?\n/);
					tail = lines.pop() ?? '';
					for (const line of lines) { log.appendLine(line); }
				},
				flush() { if (tail) { log.appendLine(tail); } },
			};
		};
		const stdoutLog = streamLog();
		const stderrLog = streamLog();
		child.stdout?.on('data', chunk => stdoutLog.append(chunk));
		child.stderr?.on('data', chunk => stderrLog.append(chunk));
		child.once('error', error => { cancel?.dispose(); reject(error); });
		child.once('close', code => {
			cancel?.dispose();
			stdoutLog.flush();
			stderrLog.flush();
			if (cancelled) { reject(new Error('Операция отменена.')); }
			else if (code !== 0) { reject(new Error(`${path.basename(executable)} завершился с кодом ${code}.`)); }
			else { resolve(); }
		});
	});
}

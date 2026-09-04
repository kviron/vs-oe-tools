import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { join } from 'node:path';

export function getNavigationInfoPath(workspacePath: string): string {
	const normalized = process.platform === 'win32'
		? resolve(workspacePath).toLocaleLowerCase('en-US')
		: resolve(workspacePath);
	const workspaceHash = createHash('sha256').update(normalized).digest('hex').slice(0, 24);
	return join(tmpdir(), 'vc-ve-tools', `navigation-${workspaceHash}.json`);
}

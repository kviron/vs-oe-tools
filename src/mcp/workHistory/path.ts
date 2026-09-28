import path from 'node:path';
import { readMcpRuntimeStateSync, type McpRuntimeState } from '../../core/mcpRuntimeState';
import { readOptionalArgument } from '../arguments';

/** Share one history across workspaces when a VS Code extension has published its storage path. */
export function resolveWorkHistoryPath(explicit: string | undefined, workspace: string,
	runtime: McpRuntimeState | undefined): string {
	if (explicit) { return path.resolve(explicit); }
	if (runtime) {
		if (runtime.workHistoryPath) { return runtime.workHistoryPath; }
		return path.join(path.dirname(runtime.logsPath), 'work-history.sqlite');
	}
	return path.join(workspace, '.vc-ve-tools', 'work-history.sqlite');
}

export function currentWorkHistoryPath(): string {
	return resolveWorkHistoryPath(readOptionalArgument('--work-history'),
		readOptionalArgument('--workspace') ?? process.cwd(), readMcpRuntimeStateSync());
}

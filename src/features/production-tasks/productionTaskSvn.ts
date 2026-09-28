import { WorkHistoryStore } from '../../mcp/workHistory/store';
import { findTaskSvnCommits, type SvnTaskCommit } from '../../mcp/workHistory/svnCommits';
import type { ProductionTaskSvnResult, ProductionTaskSvnRow } from './productionTaskSvnModels';

function row(commit: SvnTaskCommit): ProductionTaskSvnRow {
	return { id: `${commit.repositoryRoot}#${commit.revision}`, repository_root: commit.repositoryRoot,
		revision: commit.revision, author: commit.author, committed_at: commit.committedAt,
		message: commit.message, paths_json: JSON.stringify(commit.paths) };
}

export class ProductionTaskSvnHistory {
	private commits = new Map<string, ProductionTaskSvnRow>();
	private lastResult: ProductionTaskSvnResult = { commits: [], scannedAt: null };
	constructor(private readonly historyPath: string, private readonly workspace: string, private readonly taskNumber: string) {}

	cached(): ProductionTaskSvnResult {
		const store = new WorkHistoryStore(this.historyPath);
		try {
			const commits = store.getSvnCommits(this.taskNumber).map(value => ({
				id: `${value.repository_root}#${value.revision}`, repository_root: String(value.repository_root),
				revision: Number(value.revision), author: String(value.author), committed_at: String(value.committed_at),
				message: String(value.message), paths_json: String(value.paths_json),
			}));
			this.commits = new Map(commits.map(commit => [commit.id, commit]));
			this.lastResult = { commits, scannedAt: String(store.getSvnScan(this.taskNumber, this.workspace)?.scanned_at ?? '') || null };
			return this.lastResult;
		} finally { store.close(); }
	}

	async refresh(): Promise<ProductionTaskSvnResult> {
		const found = await findTaskSvnCommits(this.workspace, this.taskNumber);
		let commits = found.commits.map(row);
		let scannedAt = new Date().toISOString();
		const store = new WorkHistoryStore(this.historyPath);
		try {
			store.saveSvnCommits(this.workspace, this.taskNumber, found.roots, found.commits);
			commits = store.getSvnCommits(this.taskNumber).map(value => ({
					id: `${value.repository_root}#${value.revision}`, repository_root: String(value.repository_root),
					revision: Number(value.revision), author: String(value.author), committed_at: String(value.committed_at),
					message: String(value.message), paths_json: String(value.paths_json),
				}));
			scannedAt = String(store.getSvnScan(this.taskNumber, this.workspace)?.scanned_at ?? scannedAt);
		} finally { store.close(); }
		this.commits = new Map(commits.map(commit => [commit.id, commit]));
		this.lastResult = { commits, scannedAt };
		return this.lastResult;
	}

	commit(id: string): ProductionTaskSvnRow | undefined { return this.commits.get(id); }
}

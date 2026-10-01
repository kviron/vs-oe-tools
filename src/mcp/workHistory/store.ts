import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SvnTaskCommit } from './svnCommits';
import { isTaskSvnCommitMessage } from './svnCommits';

export interface CompletedTask {
	taskNumber: string;
	workspace: string;
	title: string;
	summary: string;
	changes: string;
	verification: string;
	limitations: string;
	databaseProfile?: string;
	sources?: string[];
}

export interface TaskProgress {
	taskNumber: string;
	workspace: string;
	title: string;
	summary?: string;
	progress: string;
	changes?: string;
	verification?: string;
	limitations?: string;
	databaseProfile?: string;
	sources?: string[];
	status: 'in_progress' | 'blocked';
	agentWorking?: boolean;
}

export class WorkHistoryStore {
	private readonly db: DatabaseSync;

	constructor(filePath: string) {
		mkdirSync(path.dirname(filePath), { recursive: true });
		this.db = new DatabaseSync(filePath);
		const legacy = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='completed_tasks'").get();
		const current = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tasks'").get();
		if (legacy && !current) { this.db.exec('ALTER TABLE completed_tasks RENAME TO tasks'); }
		this.db.exec(`PRAGMA journal_mode=WAL;
			PRAGMA busy_timeout=5000;
			CREATE TABLE IF NOT EXISTS tasks (
				id INTEGER PRIMARY KEY, workspace TEXT NOT NULL, task_number TEXT NOT NULL,
				title TEXT NOT NULL, summary TEXT NOT NULL, changes TEXT NOT NULL,
				verification TEXT NOT NULL, limitations TEXT NOT NULL,
				database_profile TEXT, sources_json TEXT NOT NULL,
				knowledge_transferred INTEGER NOT NULL DEFAULT 0,
				knowledge_reference TEXT,
				created_at TEXT NOT NULL DEFAULT (datetime('now')),
				updated_at TEXT NOT NULL DEFAULT (datetime('now')),
				UNIQUE(workspace, task_number)
			);
			CREATE INDEX IF NOT EXISTS tasks_number ON tasks(task_number);
			CREATE TABLE IF NOT EXISTS work_events (
				id INTEGER PRIMARY KEY, task_id INTEGER REFERENCES tasks(id),
				workspace TEXT NOT NULL, event_type TEXT NOT NULL, details TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
			CREATE TABLE IF NOT EXISTS tool_calls (
				id INTEGER PRIMARY KEY, tool_name TEXT NOT NULL, success INTEGER NOT NULL,
				duration_ms INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
			CREATE TABLE IF NOT EXISTS task_entities (
				id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id),
				entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, relation TEXT NOT NULL,
				label TEXT NOT NULL DEFAULT '',
				UNIQUE(task_id, entity_type, entity_id, relation)
			);
			CREATE INDEX IF NOT EXISTS task_entities_lookup ON task_entities(entity_type, entity_id);
			CREATE TABLE IF NOT EXISTS task_changes (
				id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id),
				description TEXT NOT NULL, source_locator TEXT NOT NULL,
				revision TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
			CREATE TABLE IF NOT EXISTS task_verifications (
				id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id),
				method TEXT NOT NULL, result TEXT NOT NULL, outcome TEXT NOT NULL,
				database_profile TEXT, release TEXT, source_locator TEXT,
				verified_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
			CREATE TABLE IF NOT EXISTS task_decisions (
				id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id),
				decision TEXT NOT NULL, rationale TEXT NOT NULL, alternatives TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
			CREATE TABLE IF NOT EXISTS knowledge_candidates (
				id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id),
				title TEXT NOT NULL, summary TEXT NOT NULL, reason TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending', knowledge_reference TEXT,
				source_revision TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
				updated_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
			CREATE INDEX IF NOT EXISTS knowledge_candidates_status ON knowledge_candidates(status, updated_at);
			CREATE INDEX IF NOT EXISTS task_changes_task ON task_changes(task_id);
			CREATE INDEX IF NOT EXISTS task_verifications_task ON task_verifications(task_id);
			CREATE INDEX IF NOT EXISTS task_decisions_task ON task_decisions(task_id);`);
		this.db.exec(`CREATE TABLE IF NOT EXISTS task_svn_commits (
			id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id),
			repository_root TEXT NOT NULL, revision INTEGER NOT NULL, author TEXT NOT NULL,
			committed_at TEXT NOT NULL, message TEXT NOT NULL, paths_json TEXT NOT NULL,
			discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(task_id, repository_root, revision));
			CREATE INDEX IF NOT EXISTS task_svn_commits_task ON task_svn_commits(task_id, committed_at DESC);
			CREATE TABLE IF NOT EXISTS task_svn_scans (
			 task_id INTEGER PRIMARY KEY REFERENCES tasks(id), scanned_at TEXT NOT NULL,
			 roots_json TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS svn_task_commits (
			 id INTEGER PRIMARY KEY, task_number TEXT NOT NULL, repository_root TEXT NOT NULL,
			 revision INTEGER NOT NULL, author TEXT NOT NULL, committed_at TEXT NOT NULL,
			 message TEXT NOT NULL, paths_json TEXT NOT NULL,
			 discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
			 UNIQUE(task_number, repository_root, revision));
			CREATE INDEX IF NOT EXISTS svn_task_commits_number ON svn_task_commits(task_number, committed_at DESC);
			CREATE TABLE IF NOT EXISTS svn_task_scans (
			 task_number TEXT NOT NULL, workspace TEXT NOT NULL, scanned_at TEXT NOT NULL,
			 roots_json TEXT NOT NULL, PRIMARY KEY(task_number, workspace));
			CREATE TABLE IF NOT EXISTS work_history_migrations (name TEXT PRIMARY KEY);`);
		if (!this.db.prepare("SELECT 1 FROM work_history_migrations WHERE name='svn_task_commits_v1'").get()) {
			this.db.exec(`BEGIN;
				INSERT OR IGNORE INTO svn_task_commits
				(task_number, repository_root, revision, author, committed_at, message, paths_json, discovered_at)
				SELECT t.task_number, c.repository_root, c.revision, c.author, c.committed_at,
				 c.message, c.paths_json, c.discovered_at FROM task_svn_commits c JOIN tasks t ON t.id=c.task_id;
				INSERT OR IGNORE INTO svn_task_scans(task_number, workspace, scanned_at, roots_json)
				SELECT t.task_number, t.workspace, s.scanned_at, s.roots_json
				 FROM task_svn_scans s JOIN tasks t ON t.id=s.task_id;
				INSERT INTO work_history_migrations(name) VALUES ('svn_task_commits_v1');
				COMMIT;`);
		}
		const columns = new Set((this.db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map(column => column.name));
		if (!columns.has('status')) { this.db.exec("ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'"); }
		if (!columns.has('progress')) { this.db.exec("ALTER TABLE tasks ADD COLUMN progress TEXT NOT NULL DEFAULT ''"); }
		if (!columns.has('completed_at')) { this.db.exec('ALTER TABLE tasks ADD COLUMN completed_at TEXT'); }
		if (!columns.has('agent_working')) { this.db.exec('ALTER TABLE tasks ADD COLUMN agent_working INTEGER NOT NULL DEFAULT 0'); }
	}

	close(): void { this.db.close(); }

	saveTask(task: CompletedTask): Record<string, unknown> {
		this.db.prepare(`INSERT INTO tasks
			(workspace, task_number, title, summary, changes, verification, limitations, database_profile, sources_json)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(workspace, task_number) DO UPDATE SET
				title=excluded.title, summary=excluded.summary, changes=excluded.changes,
				verification=excluded.verification, limitations=excluded.limitations,
				database_profile=excluded.database_profile, sources_json=excluded.sources_json,
				status='completed', agent_working=0, completed_at=datetime('now'),
				knowledge_transferred=0, knowledge_reference=NULL, updated_at=datetime('now')`).run(
			task.workspace, task.taskNumber, task.title, task.summary, task.changes,
			task.verification, task.limitations, task.databaseProfile ?? null, JSON.stringify(task.sources ?? []));
		this.db.prepare("UPDATE tasks SET status='completed', agent_working=0, completed_at=COALESCE(completed_at, datetime('now')) WHERE workspace=? AND task_number=?")
			.run(task.workspace, task.taskNumber);
		return this.getTask(task.workspace, task.taskNumber)!;
	}

	saveProgress(task: TaskProgress): Record<string, unknown> {
		this.db.prepare(`INSERT INTO tasks
			(workspace, task_number, title, summary, progress, changes, verification, limitations, database_profile, sources_json, status, agent_working)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(workspace, task_number) DO UPDATE SET
				title=excluded.title, summary=COALESCE(NULLIF(excluded.summary, ''), tasks.summary),
				progress=excluded.progress, changes=COALESCE(NULLIF(excluded.changes, ''), tasks.changes),
				verification=COALESCE(NULLIF(excluded.verification, ''), tasks.verification),
				limitations=COALESCE(NULLIF(excluded.limitations, ''), tasks.limitations),
				database_profile=COALESCE(excluded.database_profile, tasks.database_profile),
				sources_json=CASE WHEN excluded.sources_json='[]' THEN tasks.sources_json ELSE excluded.sources_json END,
				status=excluded.status, agent_working=excluded.agent_working, completed_at=NULL, knowledge_transferred=0,
				knowledge_reference=NULL, updated_at=datetime('now')`).run(
			task.workspace, task.taskNumber, task.title, task.summary ?? '', task.progress,
			task.changes ?? '', task.verification ?? '', task.limitations ?? '',
			task.databaseProfile ?? null, JSON.stringify(task.sources ?? []), task.status,
			task.status === 'in_progress' && task.agentWorking !== false ? 1 : 0);
		return this.getTask(task.workspace, task.taskNumber)!;
	}

	getTask(workspace: string, taskNumber: string): Record<string, unknown> | undefined {
		return this.db.prepare('SELECT * FROM tasks WHERE workspace=? AND task_number=?')
			.get(workspace, taskNumber) as Record<string, unknown> | undefined;
	}

	findTask(taskNumber: string, workspace?: string): Record<string, unknown> | undefined {
		if (workspace) { return this.getTask(workspace, taskNumber); }
		const matches = this.db.prepare('SELECT * FROM tasks WHERE task_number=? LIMIT 2')
			.all(taskNumber) as Record<string, unknown>[];
		if (matches.length > 1) { throw new Error(`Task ${taskNumber} exists in several workspaces. Specify workspace.`); }
		return matches[0];
	}

	searchTasks(search: string, limit: number, pendingOnly: boolean): Record<string, unknown>[] {
		const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
		return this.db.prepare(`SELECT t.* FROM tasks t WHERE
			(? = 0 OR knowledge_transferred = 0) AND
			(t.task_number LIKE ? ESCAPE '\\' OR t.title LIKE ? ESCAPE '\\' OR t.summary LIKE ? ESCAPE '\\'
			OR t.changes LIKE ? ESCAPE '\\' OR t.progress LIKE ? ESCAPE '\\'
			OR EXISTS (SELECT 1 FROM task_entities e WHERE e.task_id=t.id AND (e.entity_id LIKE ? ESCAPE '\\' OR e.label LIKE ? ESCAPE '\\'))
			OR EXISTS (SELECT 1 FROM task_changes c WHERE c.task_id=t.id AND (c.description LIKE ? ESCAPE '\\' OR c.source_locator LIKE ? ESCAPE '\\'))
			OR EXISTS (SELECT 1 FROM task_decisions d WHERE d.task_id=t.id AND d.rationale LIKE ? ESCAPE '\\'))
			ORDER BY t.updated_at DESC, t.id DESC LIMIT ?`).all(pendingOnly ? 1 : 0,
			pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, limit) as Record<string, unknown>[];
	}

	markTransferred(workspace: string, taskNumber: string, reference: string): Record<string, unknown> | undefined {
		this.db.prepare(`UPDATE tasks SET knowledge_transferred=1,
			knowledge_reference=?, updated_at=datetime('now') WHERE workspace=? AND task_number=?`)
			.run(reference, workspace, taskNumber);
		return this.getTask(workspace, taskNumber);
	}

	addEvent(workspace: string, eventType: string, details: string, taskNumber?: string): void {
		const task = taskNumber ? this.getTask(workspace, taskNumber) : undefined;
		this.db.prepare('INSERT INTO work_events(task_id, workspace, event_type, details) VALUES (?, ?, ?, ?)')
			.run(typeof task?.id === 'number' ? task.id : null, workspace, eventType, details);
	}

	getEvents(workspace: string, taskNumber: string, limit: number): Record<string, unknown>[] {
		return this.db.prepare(`SELECT e.* FROM work_events e JOIN tasks t ON t.id=e.task_id
			WHERE t.workspace=? AND t.task_number=? ORDER BY e.id DESC LIMIT ?`)
			.all(workspace, taskNumber, limit) as Record<string, unknown>[];
	}

	logToolCall(name: string, success: boolean, durationMs: number): void {
		this.db.prepare('INSERT INTO tool_calls(tool_name, success, duration_ms) VALUES (?, ?, ?)')
			.run(name, success ? 1 : 0, durationMs);
	}

	recentToolCalls(limit: number): Record<string, unknown>[] {
		return this.db.prepare('SELECT * FROM tool_calls ORDER BY id DESC LIMIT ?').all(limit) as Record<string, unknown>[];
	}

	private taskId(workspace: string, taskNumber: string): number {
		const task = this.getTask(workspace, taskNumber);
		if (typeof task?.id !== 'number') { throw new Error(`Task ${taskNumber} was not found in ${workspace}.`); }
		return task.id;
	}

	saveSvnCommits(workspace: string, taskNumber: string, roots: string[], commits: SvnTaskCommit[]): void {
		this.db.exec('BEGIN');
		try {
			const insert = this.db.prepare(`INSERT INTO svn_task_commits
				(task_number, repository_root, revision, author, committed_at, message, paths_json)
				VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(task_number, repository_root, revision)
				DO UPDATE SET author=excluded.author, committed_at=excluded.committed_at,
				message=excluded.message, paths_json=excluded.paths_json, discovered_at=datetime('now')`);
			const expected = new Set<string>();
			for (const commit of commits) {
				if (!isTaskSvnCommitMessage(commit.message, taskNumber)) { continue; }
				expected.add(`${commit.repositoryRoot}#${commit.revision}`);
				insert.run(taskNumber, commit.repositoryRoot, commit.revision, commit.author, commit.committedAt,
					commit.message, JSON.stringify(commit.paths));
			}
			const cached = this.db.prepare('SELECT id, repository_root, revision, message FROM svn_task_commits WHERE task_number=?')
				.all(taskNumber) as Array<{ id: number; repository_root: string; revision: number; message: string }>;
			const remove = this.db.prepare('DELETE FROM svn_task_commits WHERE id=?');
			for (const row of cached) {
				if (!isTaskSvnCommitMessage(row.message, taskNumber)
					|| (roots.includes(row.repository_root) && !expected.has(`${row.repository_root}#${row.revision}`))) { remove.run(row.id); }
			}
			this.db.prepare(`INSERT INTO svn_task_scans(task_number, workspace, scanned_at, roots_json)
				VALUES (?, ?, datetime('now'), ?) ON CONFLICT(task_number, workspace) DO UPDATE SET
				scanned_at=excluded.scanned_at, roots_json=excluded.roots_json`).run(taskNumber, workspace, JSON.stringify(roots));
			this.db.exec('COMMIT');
		} catch (error) { this.db.exec('ROLLBACK'); throw error; }
	}

	getTaskSvnCommits(workspace: string, taskNumber: string): Record<string, unknown>[] {
		this.taskId(workspace, taskNumber);
		return this.getSvnCommits(taskNumber);
	}

	getTaskSvnScan(workspace: string, taskNumber: string): Record<string, unknown> | undefined {
		this.taskId(workspace, taskNumber);
		return this.getSvnScan(taskNumber, workspace);
	}

	getSvnCommits(taskNumber: string): Record<string, unknown>[] {
		const rows = this.db.prepare(`SELECT * FROM svn_task_commits WHERE task_number=?
			ORDER BY committed_at DESC, revision DESC`).all(taskNumber) as Record<string, unknown>[];
		return rows.filter(row => isTaskSvnCommitMessage(String(row.message), taskNumber));
	}

	getSvnScans(taskNumber: string): Record<string, unknown>[] {
		return this.db.prepare('SELECT * FROM svn_task_scans WHERE task_number=? ORDER BY scanned_at DESC')
			.all(taskNumber) as Record<string, unknown>[];
	}

	getSvnScan(taskNumber: string, workspace?: string): Record<string, unknown> | undefined {
		if (workspace) {
			return this.db.prepare('SELECT * FROM svn_task_scans WHERE task_number=? AND workspace=?')
				.get(taskNumber, workspace) as Record<string, unknown> | undefined;
		}
		return this.getSvnScans(taskNumber)[0];
	}

	addEntity(workspace: string, taskNumber: string, entityType: string, entityId: string, relation: string, label = ''): void {
		this.db.prepare(`INSERT INTO task_entities(task_id, entity_type, entity_id, relation, label)
			VALUES (?, ?, ?, ?, ?) ON CONFLICT(task_id, entity_type, entity_id, relation)
			DO UPDATE SET label=excluded.label`).run(this.taskId(workspace, taskNumber), entityType, entityId, relation, label);
	}

	addChange(workspace: string, taskNumber: string, description: string, sourceLocator: string, revision?: string): void {
		this.db.prepare('INSERT INTO task_changes(task_id, description, source_locator, revision) VALUES (?, ?, ?, ?)')
			.run(this.taskId(workspace, taskNumber), description, sourceLocator, revision ?? null);
	}

	addVerification(workspace: string, taskNumber: string, method: string, result: string, outcome: string,
		databaseProfile?: string, release?: string, sourceLocator?: string): void {
		this.db.prepare(`INSERT INTO task_verifications
			(task_id, method, result, outcome, database_profile, release, source_locator)
			VALUES (?, ?, ?, ?, ?, ?, ?)`).run(this.taskId(workspace, taskNumber), method, result, outcome,
				databaseProfile ?? null, release ?? null, sourceLocator ?? null);
	}

	addDecision(workspace: string, taskNumber: string, decision: string, rationale: string, alternatives: string): void {
		this.db.prepare('INSERT INTO task_decisions(task_id, decision, rationale, alternatives) VALUES (?, ?, ?, ?)')
			.run(this.taskId(workspace, taskNumber), decision, rationale, alternatives);
	}

	addKnowledgeCandidate(workspace: string, taskNumber: string, title: string, summary: string,
		reason: string, sourceRevision?: string): Record<string, unknown> {
		const inserted = this.db.prepare(`INSERT INTO knowledge_candidates
			(task_id, title, summary, reason, source_revision) VALUES (?, ?, ?, ?, ?)`).run(
			this.taskId(workspace, taskNumber), title, summary, reason, sourceRevision ?? null);
		return this.db.prepare('SELECT * FROM knowledge_candidates WHERE id=?').get(inserted.lastInsertRowid) as Record<string, unknown>;
	}

	getTaskContext(workspace: string, taskNumber: string): Record<string, unknown> {
		const id = this.taskId(workspace, taskNumber);
		const rows = (table: string) => this.db.prepare(`SELECT * FROM ${table} WHERE task_id=? ORDER BY id DESC`).all(id);
		return {
			task: this.getTask(workspace, taskNumber)!, events: rows('work_events'),
			entities: rows('task_entities'), changes: rows('task_changes'),
			verifications: rows('task_verifications'), decisions: rows('task_decisions'),
			knowledgeCandidates: rows('knowledge_candidates'),
			svnCommits: this.getTaskSvnCommits(workspace, taskNumber),
			svnScan: this.getTaskSvnScan(workspace, taskNumber) ?? null,
		};
	}

	searchKnowledgeCandidates(search: string, status: string | undefined, limit: number): Record<string, unknown>[] {
		const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
		return this.db.prepare(`SELECT c.*, t.task_number, t.workspace FROM knowledge_candidates c
			JOIN tasks t ON t.id=c.task_id WHERE (? IS NULL OR c.status=?)
			AND (c.title LIKE ? ESCAPE '\\' OR c.summary LIKE ? ESCAPE '\\'
			OR c.reason LIKE ? ESCAPE '\\' OR t.task_number LIKE ? ESCAPE '\\')
			ORDER BY c.updated_at DESC, c.id DESC LIMIT ?`)
			.all(status ?? null, status ?? null, pattern, pattern, pattern, pattern, limit) as Record<string, unknown>[];
	}

	markKnowledgeCandidate(id: number, status: 'transferred' | 'dismissed', reference?: string): Record<string, unknown> {
		if (status === 'transferred' && !reference?.trim()) { throw new Error('Transferred knowledge requires a saved article reference.'); }
		const result = this.db.prepare(`UPDATE knowledge_candidates SET status=?, knowledge_reference=?,
			updated_at=datetime('now') WHERE id=?`).run(status, reference ?? null, id);
		if (!result.changes) { throw new Error(`Knowledge candidate ${id} was not found.`); }
		return this.db.prepare('SELECT * FROM knowledge_candidates WHERE id=?').get(id) as Record<string, unknown>;
	}

	findTasksForEntity(entityType: string, entityId: string, limit: number): Record<string, unknown>[] {
		return this.db.prepare(`SELECT t.*, e.relation, e.label FROM task_entities e
			JOIN tasks t ON t.id=e.task_id WHERE e.entity_type=? AND e.entity_id=?
			ORDER BY t.updated_at DESC LIMIT ?`).all(entityType, entityId, limit) as Record<string, unknown>[];
	}
}

import * as assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WorkHistoryStore } from '../mcp/workHistory/store';
import { parseTaskSvnLog } from '../mcp/workHistory/svnCommits';

suite('Work history', () => {
	test('matches task number in SVN message, not neighboring digits or path alone', () => {
		const xml = '<log><logentry revision="1"><msg>88405: change &amp; check</msg><paths><path>/88405/file</path></paths></logentry>'
			+ '<logentry revision="2"><msg>884050: unrelated</msg></logentry>'
			+ '<logentry revision="3"><msg>other</msg><paths><path>/88405/file</path></paths></logentry>'
			+ '<logentry revision="4"><msg>Merged revisions from trunk:\n88405: included in merge</msg></logentry></log>';
		const commits = parseTaskSvnLog(xml, 'https://svn.example/repo', '88405');
		assert.deepEqual(commits.map(commit => commit.revision), [1]);
		assert.equal(commits[0].message, '88405: change & check');
	});
	test('stores task outcome separately from events and call audit', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'vc-ve-work-history-'));
		const store = new WorkHistoryStore(path.join(directory, 'history.sqlite'));
		try {
			const task = {
				workspace: 'C:/OE/trunk', taskNumber: '89315', title: 'Parameter conversion',
				summary: 'Updated conversion', changes: 'SQL patch', verification: 'Checked target rows',
				limitations: 'Native runtime not checked', sources: ['task:89315'],
			};
			store.saveProgress({ workspace: task.workspace, taskNumber: task.taskNumber,
				title: task.title, progress: 'Requirements inspected', status: 'in_progress' });
			assert.equal(store.getTask(task.workspace, task.taskNumber)?.status, 'in_progress');
			store.saveProgress({ workspace: task.workspace, taskNumber: task.taskNumber,
				title: task.title, progress: 'Waiting for client', status: 'blocked' });
			assert.equal(store.getTask(task.workspace, task.taskNumber)?.status, 'blocked');
			store.saveTask(task);
			store.saveSvnCommits(task.workspace, task.taskNumber, ['https://svn.example/repo'], [
				{ repositoryRoot: 'https://svn.example/repo', revision: 42, author: 'dev', committedAt: '2026-09-28T09:00:00Z', message: '89315: change', paths: ['/trunk/file'] },
			]);
			store.saveSvnCommits(task.workspace, task.taskNumber, ['https://svn.example/repo'], [
				{ repositoryRoot: 'https://svn.example/repo', revision: 42, author: 'dev', committedAt: '2026-09-28T09:00:00Z', message: '89315: updated', paths: ['/trunk/file'] },
			]);
			assert.equal(store.getTaskSvnCommits(task.workspace, task.taskNumber).length, 1);
			assert.equal(store.getTaskSvnCommits(task.workspace, task.taskNumber)[0].message, '89315: updated');
			store.saveSvnCommits(task.workspace, task.taskNumber, ['https://svn.example/repo'], [
				{ repositoryRoot: 'https://svn.example/repo', revision: 43, author: 'dev', committedAt: '2026-09-28T10:00:00Z', message: 'Merged revisions:\n89315: included', paths: [] },
			]);
			assert.equal(store.getTaskSvnCommits(task.workspace, task.taskNumber).length, 0);
			const legacyCache = new DatabaseSync(path.join(directory, 'history.sqlite'));
			try {
				legacyCache.prepare(`INSERT INTO svn_task_commits
					(task_number, repository_root, revision, author, committed_at, message, paths_json)
					VALUES (?, ?, ?, ?, ?, ?, ?)`).run(task.taskNumber,
					'https://svn.example/repo', 44, 'dev', '2026-09-28T11:00:00Z', 'Merged revisions:\n89315: included', '[]');
			} finally { legacyCache.close(); }
			assert.equal(store.getTaskSvnCommits(task.workspace, task.taskNumber).length, 0);
			assert.ok(store.getTaskSvnScan(task.workspace, task.taskNumber)?.scanned_at);
			assert.equal(store.getTask(task.workspace, task.taskNumber)?.status, 'completed');
			assert.ok(store.getTask(task.workspace, task.taskNumber)?.completed_at);
			store.addEvent(task.workspace, 'verification', 'Target rows checked', task.taskNumber);
			store.logToolCall('query_database', true, 12);
			assert.equal(store.searchTasks('89315', 10, false).length, 1);
			assert.equal(store.getEvents(task.workspace, task.taskNumber, 10).length, 1);
			assert.equal(store.recentToolCalls(10)[0].tool_name, 'query_database');
			assert.equal(store.searchTasks('', 10, true).length, 1);
			store.markTransferred(task.workspace, task.taskNumber, 'knowledge:conversion-89315');
			assert.equal(store.searchTasks('', 10, true).length, 0);
			assert.equal(store.getTask(task.workspace, task.taskNumber)?.knowledge_reference, 'knowledge:conversion-89315');
			store.saveTask({ ...task, changes: 'Revised SQL patch' });
			assert.equal(store.searchTasks('', 10, true).length, 1);
			assert.equal(store.getTask(task.workspace, task.taskNumber)?.changes, 'Revised SQL patch');
			store.saveTask({ ...task, workspace: 'C:/OE/R306' });
			assert.throws(() => store.findTask(task.taskNumber), /several workspaces/);
			assert.equal(store.findTask(task.taskNumber, 'C:/OE/R306')?.workspace, 'C:/OE/R306');
		} finally {
			store.close();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('shares SVN commits without requiring a local task record', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'vc-ve-svn-cache-'));
		const store = new WorkHistoryStore(path.join(directory, 'history.sqlite'));
		try {
			store.saveSvnCommits('C:/OE/trunk', '88405', ['https://svn.example/repo'], [
				{ repositoryRoot: 'https://svn.example/repo', revision: 77, author: 'dev', committedAt: '2026-09-28T12:00:00Z', message: '88405 - fix', paths: ['/trunk/file'] },
			]);
			assert.equal(store.getTask('C:/OE/trunk', '88405'), undefined);
			assert.equal(store.getSvnCommits('88405')[0].revision, 77);
			assert.equal(store.getSvnScans('88405')[0].workspace, 'C:/OE/trunk');
		} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
	});

	test('migrates earlier completed task records and linked events', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'vc-ve-work-migrate-'));
		const file = path.join(directory, 'history.sqlite');
		const legacy = new DatabaseSync(file);
		legacy.exec(`CREATE TABLE completed_tasks (
			id INTEGER PRIMARY KEY, workspace TEXT NOT NULL, task_number TEXT NOT NULL,
			title TEXT NOT NULL, summary TEXT NOT NULL, changes TEXT NOT NULL,
			verification TEXT NOT NULL, limitations TEXT NOT NULL,
			database_profile TEXT, sources_json TEXT NOT NULL,
			knowledge_transferred INTEGER NOT NULL DEFAULT 0, knowledge_reference TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(workspace, task_number));
			CREATE TABLE work_events (id INTEGER PRIMARY KEY,
				task_id INTEGER REFERENCES completed_tasks(id), workspace TEXT NOT NULL,
				event_type TEXT NOT NULL, details TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT (datetime('now')));
			INSERT INTO completed_tasks(workspace, task_number, title, summary, changes,
				verification, limitations, sources_json)
				VALUES ('C:/OE/trunk', '88405', 'Old task', 'Done', 'Patch', 'Checked', '', '[]');
			INSERT INTO work_events(task_id, workspace, event_type, details)
				VALUES (1, 'C:/OE/trunk', 'verification', 'Checked');
			CREATE TABLE task_svn_commits (id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL,
			 repository_root TEXT NOT NULL, revision INTEGER NOT NULL, author TEXT NOT NULL,
			 committed_at TEXT NOT NULL, message TEXT NOT NULL, paths_json TEXT NOT NULL,
			 discovered_at TEXT NOT NULL DEFAULT (datetime('now')));
			INSERT INTO task_svn_commits(task_id, repository_root, revision, author, committed_at, message, paths_json)
			VALUES (1, 'https://svn.example/repo', 66, 'dev', '2026-09-28T12:00:00Z', '88405 - old', '[]');`);
		legacy.close();
		const store = new WorkHistoryStore(file);
		try {
			assert.equal(store.getTask('C:/OE/trunk', '88405')?.status, 'completed');
			assert.equal(store.getEvents('C:/OE/trunk', '88405', 10).length, 1);
			assert.equal(store.getSvnCommits('88405')[0].revision, 66);
		} finally {
			store.close();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('links task evidence and finds knowledge candidates', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'vc-ve-work-context-'));
		const store = new WorkHistoryStore(path.join(directory, 'history.sqlite'));
		try {
			const workspace = 'C:/OE/trunk';
			store.saveProgress({ workspace, taskNumber: '88405', title: 'Dialog rule',
				progress: 'Inspecting source', status: 'in_progress' });
			store.addEntity(workspace, '88405', 'method', '3200110', 'changed_by', 'Validate');
			store.addEntity(workspace, '88405', 'method', '3200110', 'changed_by', 'Validate updated');
			store.addChange(workspace, '88405', 'Changed validation', 'method:3200110', 'r145924');
			store.addVerification(workspace, '88405', 'compile_method', 'Passed', 'passed', 'oetest3_6', '3.6');
			store.addDecision(workspace, '88405', 'Keep existing signature', 'Caller compatibility', 'New method');
			const candidate = store.addKnowledgeCandidate(workspace, '88405', 'Dialog validation',
				'Reusable validation rule', 'Repeated requirement', 'r145924');
			const context = store.getTaskContext(workspace, '88405');
			assert.equal((context.entities as unknown[]).length, 1);
			assert.equal((context.changes as unknown[]).length, 1);
			assert.equal((context.verifications as unknown[]).length, 1);
			assert.equal((context.decisions as unknown[]).length, 1);
			assert.equal(store.findTasksForEntity('method', '3200110', 10)[0].task_number, '88405');
			assert.equal(store.searchKnowledgeCandidates('88405', 'pending', 10).length, 1);
			assert.throws(() => store.markKnowledgeCandidate(candidate.id as number, 'transferred'), /requires a saved article/);
			store.markKnowledgeCandidate(candidate.id as number, 'transferred', 'knowledge:dialog-validation');
			assert.equal(store.searchKnowledgeCandidates('', 'pending', 10).length, 0);
			assert.equal(store.searchKnowledgeCandidates('', 'transferred', 10)[0].knowledge_reference, 'knowledge:dialog-validation');
			assert.throws(() => store.addChange(workspace, '99999', 'Missing', 'path'), /was not found/);
		} finally {
			store.close();
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

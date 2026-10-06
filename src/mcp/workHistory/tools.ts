import { readOptionalArgument } from '../arguments';
import { z } from '../schemas';
import type { McpToolServer, McpToolResult } from '../toolTypes';
import { WorkHistoryStore } from './store';
import type { CompletedTask, TaskProgress } from './store';
import { currentWorkHistoryPath } from './path';
import { findTaskSvnCommits } from './svnCommits';

const workspace = readOptionalArgument('--workspace') ?? process.cwd();
const historyPath = currentWorkHistoryPath();

function run<T extends Record<string, unknown>>(work: (store: WorkHistoryStore) => T): Promise<McpToolResult> {
	try {
		const store = new WorkHistoryStore(historyPath);
		try {
			const result = work(store);
			return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result });
		} finally { store.close(); }
	} catch (error) {
		return Promise.resolve({ content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true });
	}
}

export function registerWorkHistoryTools(server: McpToolServer): void {
	server.registerTool<{ taskNumber: string; workspace?: string }>('get_task_svn_commits', {
		description: 'Read all cached SVN commits for a task number across repositories and workspaces, even without a local task record. Includes scan metadata.',
		inputSchema: { taskNumber: z.string().regex(/^\d+$/), workspace: z.string().optional() },
		annotations: { readOnlyHint: true },
	}, async input => run(store => {
		return { commits: store.getSvnCommits(input.taskNumber), scans: store.getSvnScans(input.taskNumber),
			scan: store.getSvnScan(input.taskNumber, input.workspace) ?? null };
	}));

	server.registerTool<{ taskNumber: string; workspace?: string }>('refresh_task_svn_commits', {
		description: 'Search SVN repositories under a workspace for commits whose messages start with the task number, then update the shared cache. Does not require a local task record.',
		inputSchema: { taskNumber: z.string().regex(/^\d+$/), workspace: z.string().optional() },
	}, async input => {
		try {
			const store = new WorkHistoryStore(historyPath);
			let selectedWorkspace: string;
			try { selectedWorkspace = input.workspace ?? String(store.getSvnScan(input.taskNumber)?.workspace ?? workspace); }
			finally { store.close(); }
			const found = await findTaskSvnCommits(selectedWorkspace, input.taskNumber);
			return run(db => {
				db.saveSvnCommits(selectedWorkspace, input.taskNumber, found.roots, found.commits);
				return { commits: db.getSvnCommits(input.taskNumber), scans: db.getSvnScans(input.taskNumber),
					scan: db.getSvnScan(input.taskNumber, selectedWorkspace) ?? null };
			});
		} catch (error) {
			return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
		}
	});
	server.registerTool<{ taskNumber: string; entityType: string; entityId: string; relation: string; label?: string }>('link_task_entity', {
		description: 'Link a saved task to a stable class, method, package, release, profile, or other entity ID.',
		inputSchema: { taskNumber: z.string().min(1), entityType: z.string().min(1), entityId: z.string().min(1),
			relation: z.string().min(1), label: z.string().optional() },
	}, async input => run(store => {
		store.addEntity(workspace, input.taskNumber, input.entityType, input.entityId, input.relation, input.label);
		return { saved: true };
	}));

	server.registerTool<{ taskNumber: string; description: string; sourceLocator: string; revision?: string }>('record_task_change', {
		description: 'Record a concrete task change with its file, object, commit, or SVN source locator.',
		inputSchema: { taskNumber: z.string().min(1), description: z.string().min(1),
			sourceLocator: z.string().min(1), revision: z.string().optional() },
	}, async input => run(store => {
		store.addChange(workspace, input.taskNumber, input.description, input.sourceLocator, input.revision);
		return { saved: true };
	}));

	server.registerTool<{ taskNumber: string; method: string; result: string; outcome: 'passed' | 'failed' | 'partial'; databaseProfile?: string; release?: string; sourceLocator?: string }>('record_task_verification', {
		description: 'Record what was actually checked, its outcome, database profile, release, and evidence.',
		inputSchema: { taskNumber: z.string().min(1), method: z.string().min(1), result: z.string().min(1),
			outcome: z.enum(['passed', 'failed', 'partial']), databaseProfile: z.string().optional(),
			release: z.string().optional(), sourceLocator: z.string().optional() },
	}, async input => run(store => {
		store.addVerification(workspace, input.taskNumber, input.method, input.result, input.outcome,
			input.databaseProfile, input.release, input.sourceLocator);
		return { saved: true };
	}));

	server.registerTool<{ taskNumber: string; decision: string; rationale: string; alternatives: string }>('record_task_decision', {
		description: 'Record a task decision, its reason, and considered alternatives.',
		inputSchema: { taskNumber: z.string().min(1), decision: z.string().min(1),
			rationale: z.string().min(1), alternatives: z.string() },
	}, async input => run(store => {
		store.addDecision(workspace, input.taskNumber, input.decision, input.rationale, input.alternatives);
		return { saved: true };
	}));

	server.registerTool<{ taskNumber: string; title: string; summary: string; reason: string; sourceRevision?: string }>('propose_task_knowledge', {
		description: 'Save a reviewable candidate with business rules, conditions, exceptions, decision rationale and evidence in summary; reason explains why it is reusable. Automatically sets task knowledge_extracted; does not publish knowledge.',
		inputSchema: { taskNumber: z.string().min(1), title: z.string().min(1), summary: z.string().min(1),
			reason: z.string().min(1), sourceRevision: z.string().optional() },
	}, async input => run(store => ({ candidate: store.addKnowledgeCandidate(workspace, input.taskNumber,
		input.title, input.summary, input.reason, input.sourceRevision) })));

	server.registerTool<{ id: number; status: 'transferred' | 'dismissed'; knowledgeReference?: string }>('review_task_knowledge', {
		description: 'Mark a candidate transferred after verifying its knowledge article reference, or dismiss it.',
		inputSchema: { id: z.number().int().positive(), status: z.enum(['transferred', 'dismissed']),
			knowledgeReference: z.string().optional() },
	}, async input => run(store => ({ candidate: store.markKnowledgeCandidate(input.id, input.status, input.knowledgeReference) })));

	server.registerTool<{ taskNumber: string; workspace?: string }>('get_task_context', {
		description: 'Read a task with all linked entities, changes, verifications, decisions, events, and knowledge candidates.',
		inputSchema: { taskNumber: z.string().min(1), workspace: z.string().optional() },
		annotations: { readOnlyHint: true },
	}, async input => run(store => {
		const task = store.findTask(input.taskNumber, input.workspace);
		return { context: task ? store.getTaskContext(String(task.workspace), input.taskNumber) : null };
	}));

	server.registerTool<{ entityType: string; entityId: string; limit: number }>('find_tasks_for_entity', {
		description: 'Find task history linked to an exact stable entity type and ID.',
		inputSchema: { entityType: z.string().min(1), entityId: z.string().min(1),
			limit: z.number().int().min(1).max(100).default(30) }, annotations: { readOnlyHint: true },
	}, async input => run(store => ({ tasks: store.findTasksForEntity(input.entityType, input.entityId, input.limit) })));

	server.registerTool<{ search: string; status?: 'pending' | 'transferred' | 'dismissed'; limit: number }>('search_task_knowledge', {
		description: 'Search local knowledge candidates by task number or text, optionally pending review only.',
		inputSchema: { search: z.string().default(''), status: z.enum(['pending', 'transferred', 'dismissed']).optional(),
			limit: z.number().int().min(1).max(100).default(30) }, annotations: { readOnlyHint: true },
	}, async input => run(store => ({ candidates: store.searchKnowledgeCandidates(input.search, input.status, input.limit) })));

	server.registerTool<Omit<TaskProgress, 'workspace'>>('save_task_progress', {
		description: 'Create or update a task. Set agentWorking while actively working; clear it on pause. Blocked tasks are never active. Use save_completed_task after completion.',
		inputSchema: {
			taskNumber: z.string().min(1), title: z.string().min(1), progress: z.string().min(1),
			status: z.enum(['in_progress', 'blocked']), agentWorking: z.boolean().optional(), summary: z.string().optional(),
			changes: z.string().optional(), verification: z.string().optional(),
			limitations: z.string().optional(), databaseProfile: z.string().optional(),
			sources: z.array(z.string()).optional(),
		},
	}, async input => run(store => ({ task: store.saveProgress({ ...input, workspace }) })));

	server.registerTool<Omit<CompletedTask, 'workspace'>>('save_completed_task', {
		description: 'Mark a task completed and save its final outcome and verification in the local work history.',
		inputSchema: {
			taskNumber: z.string().min(1), title: z.string().min(1), summary: z.string().min(1),
			changes: z.string().min(1), verification: z.string().min(1), limitations: z.string(),
			databaseProfile: z.string().optional(), sources: z.array(z.string()).optional(),
		},
	}, async input => run(store => ({ task: store.saveTask({ ...input, workspace }) })));

	server.registerTool<{ search: string; limit: number; pendingKnowledgeOnly: boolean }>('search_completed_tasks', {
		description: 'Search task history, including work in progress and completed tasks, by number, title, summary, or changes.',
		inputSchema: { search: z.string().default(''), limit: z.number().int().min(1).max(100).default(20), pendingKnowledgeOnly: z.boolean().default(false) },
		annotations: { readOnlyHint: true },
	}, async ({ search, limit, pendingKnowledgeOnly }) => run(store => ({ tasks: store.searchTasks(search, limit, pendingKnowledgeOnly) })));

	server.registerTool<{ taskNumber: string; workspace?: string }>('get_completed_task', {
		description: 'Read a task, including current progress and work events, by exact task number.',
		inputSchema: { taskNumber: z.string().min(1), workspace: z.string().optional() }, annotations: { readOnlyHint: true },
	}, async ({ taskNumber, workspace: selectedWorkspace }) => run(store => {
		const task = store.findTask(taskNumber, selectedWorkspace);
		return { task: task ?? null, events: task ? store.getEvents(String(task.workspace), taskNumber, 100) : [] };
	}));

	server.registerTool<{ taskNumber: string; knowledgeReference: string }>('mark_task_knowledge_transferred', {
		description: 'Mark a completed task as transferred to the knowledge base only after verifying the saved knowledge record. Requires its stable reference.',
		inputSchema: { taskNumber: z.string().min(1), knowledgeReference: z.string().min(1) },
	}, async ({ taskNumber, knowledgeReference }) => run(store => {
		const task = store.markTransferred(workspace, taskNumber, knowledgeReference);
		if (!task) { throw new Error(`Task ${taskNumber} was not found.`); }
		return { task };
	}));

	server.registerTool<{ eventType: string; details: string; taskNumber?: string }>('record_work_event', {
		description: 'Record a concise work event, outcome, or verification. Link to a saved task by number when available.',
		inputSchema: { eventType: z.string().min(1), details: z.string().min(1), taskNumber: z.string().optional() },
	}, async ({ eventType, details, taskNumber }) => run(store => {
		store.addEvent(workspace, eventType, details, taskNumber);
		return { saved: true };
	}));

	server.registerTool<{ limit: number }>('get_recent_work_calls', {
		description: 'Read recent MCP tool call metadata without arguments or result content.',
		inputSchema: { limit: z.number().int().min(1).max(500).default(30) }, annotations: { readOnlyHint: true },
	}, async ({ limit }) => run(store => ({ calls: store.recentToolCalls(limit) })));
}

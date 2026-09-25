export interface ProductionTaskSummary {
	id: number;
	number: string;
	state: string;
	title: string;
	createdAt: string;
	deadline: string;
	activityKind: string;
	workType: string;
	project: string;
	author: string;
	manager: string;
	analyst: string;
	executor: string;
	responsibleUser: string;
	responsibleUserId: number;
	reviewer: string;
	appeal: string;
	packageName: string;
	newsSection: string;
	priority: string;
	effort: string;
	releasePlan: string;
	releaseActual: string;
	revisionTrunk: string;
	revisionBranch: string;
	attachmentCount: number;
	workDescription: string;
	stateComment: string;
	stateCommentAuthor: string;
}

export type ProductionTaskListItem = Pick<ProductionTaskSummary,
	'id' | 'number' | 'state' | 'title' | 'createdAt' | 'deadline' | 'workType' | 'project'
	| 'executor' | 'responsibleUser' | 'responsibleUserId' | 'appeal' | 'packageName'
	| 'priority' | 'releasePlan' | 'attachmentCount'>;

export interface ProductionTaskUser { id: number; name: string }

export interface ProductionTaskAttachment {
	id: number;
	name: string;
	fileName: string;
	extension: string;
	size: string;
	changedAt: string;
	comment: string;
	storageFileId: string;
	storageType: string;
	mainStoredFileId?: number;
	important: boolean;
}

export type ProductionTaskDescriptionPart =
	| { kind: 'text'; text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string }
	| { kind: 'image'; dataUrl: string; width?: number; height?: number };

export interface ProductionTaskHistoryEntry {
	id: number;
	createdAt: string;
	action: string;
	state: string;
	person: string;
	comment: string;
}

export interface ProductionTaskAction {
	id: number;
	name: string;
	verb: string;
	targetState: string;
	group: string;
	requiresComment: boolean;
	mandatoryComment: boolean;
	requiresCause: boolean;
	requiresDate: boolean;
}

export interface ProductionConnectionOptions {
	host: string;
	port: number;
	database: string;
	clientSessionKey: string;
	username: string;
	password: string;
	personId: number;
	authorizationReference?: CapturedAuthorization;
}

export interface CapturedAuthorization {
	username: string;
	challenge: string;
	passwordHash: string;
	oldPasswordHash: string;
}

export interface ProductionTasksLogger {
	info(message: string, details?: unknown): void;
	warning(message: string, details?: unknown): void;
	error(message: string, details?: unknown): void;
}

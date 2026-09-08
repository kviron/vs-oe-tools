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
	workDescription: string;
	stateComment: string;
	stateCommentAuthor: string;
}

export interface ProductionTaskAttachment {
	id: number;
	name: string;
	fileName: string;
	extension: string;
	size: string;
	changedAt: string;
	comment: string;
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

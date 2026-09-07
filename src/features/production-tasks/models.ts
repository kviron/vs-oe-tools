export interface ProductionTaskSummary {
	id: number;
	number: string;
	state: string;
	description: string;
	createdAt: string;
	deadline: string;
	workType: string;
	project: string;
	customer: string;
	executor: string;
	initiator: string;
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

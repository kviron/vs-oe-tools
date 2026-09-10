export type DatabaseRole = 'main' | 'test';

export interface DatabaseConnectionOptions {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
}


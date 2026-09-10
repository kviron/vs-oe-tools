export type SqlResultValue = string | number | boolean | null;

export interface SerializedQueryResult {
	rowCount: number;
	columns: string[];
	rows: Record<string, SqlResultValue>[];
	resultTruncated: boolean;
}

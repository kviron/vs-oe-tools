import type { SerializedQueryResult } from '../../infrastructure/database/databaseQueryExecutor';
import type { SqlMonitorValue } from '../sql-monitor/models';

export type SqlResultFormat = 'markdown' | 'json' | 'csv';

export interface SqlResultExportDefinition {
	format: SqlResultFormat;
	label: string;
	extension: string;
}

export const sqlResultExportDefinitions: readonly SqlResultExportDefinition[] = [
	{ format: 'markdown', label: 'Markdown — таблица для чата', extension: 'md' },
	{ format: 'json', label: 'JSON — структурированные данные', extension: 'json' },
	{ format: 'csv', label: 'CSV — таблица для Excel', extension: 'csv' },
];

export function formatSqlResult(result: SerializedQueryResult, format: SqlResultFormat): string {
	switch (format) {
		case 'markdown':
			return formatMarkdown(result);
		case 'json':
			return `${JSON.stringify({
				rowCount: result.rowCount,
				resultTruncated: result.resultTruncated,
				rows: result.rows,
			}, null, 2)}\n`;
		case 'csv':
			return formatCsv(result);
	}
}

function formatMarkdown(result: SerializedQueryResult): string {
	const lines = [`Результат SQL: ${result.rowCount} строк.`];
	if (result.resultTruncated) {
		lines.push('Показаны и выгружены первые 500 строк.');
	}
	if (result.columns.length === 0) {
		return `${lines.join('\n')}\n`;
	}
	lines.push('', `| ${result.columns.map(escapeMarkdown).join(' | ')} |`);
	lines.push(`| ${result.columns.map(() => '---').join(' | ')} |`);
	for (const row of result.rows) {
		lines.push(`| ${result.columns.map(column => escapeMarkdown(formatValue(row[column]))).join(' | ')} |`);
	}
	return `${lines.join('\n')}\n`;
}

function formatCsv(result: SerializedQueryResult): string {
	const rows = [
		result.columns.map(escapeCsv).join(';'),
		...result.rows.map(row => result.columns.map(column => escapeCsv(formatValue(row[column], ''))).join(';')),
	];
	return `${rows.join('\r\n')}\r\n`;
}

function formatValue(value: SqlMonitorValue, nullValue = 'NULL'): string {
	return value === null ? nullValue : String(value);
}

function escapeMarkdown(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function escapeCsv(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

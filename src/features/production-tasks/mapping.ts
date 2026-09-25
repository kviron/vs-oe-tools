import iconv from 'iconv-lite';
import type { ProductionTaskSummary } from './models';
import type { MemoryDataRow } from './oenpProtocol';

export function text(value: number | string | null | undefined): string { return value === null || value === undefined ? '' : String(value); }
export function decodeProductionText(value: number | string | null | undefined): string {
	const result = text(value);
	const bytea = result.match(/^\\x([\da-f]+)$/i);
	return bytea && bytea[1].length % 2 === 0 ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251') : result;
}
export function positiveInteger(value: number | string | null | undefined): number | undefined {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
export function normalizeProductionDate(value: string): string { return /^30\.12\.1899(?:\s+00:00(?::00)?)?$/.test(value.trim()) ? '' : value; }

export function mapProductionTask(row: MemoryDataRow): ProductionTaskSummary {
	return {
		id: Number(row.id) >>> 0, number: text(row.number), state: text(row.state), title: text(row.title),
		createdAt: normalizeProductionDate(text(row.created)), deadline: normalizeProductionDate(text(row.deadline)),
		activityKind: text(row.activitykind), workType: text(row.worktype), project: decodeProductionText(row.project),
		author: text(row.author), manager: text(row.manager), analyst: text(row.analyst), executor: text(row.executor), responsibleUser: text(row.responsibleuser), responsibleUserId: Number(row.responsibleuserid) || 0, reviewer: text(row.reviewer),
		appeal: text(row.appeal), packageName: text(row.packagename), newsSection: text(row.newssection), priority: text(row.priority), effort: text(row.effort),
		releasePlan: text(row.releaseplan), releaseActual: text(row.releaseactual), revisionTrunk: text(row.revisiontrunk), revisionBranch: text(row.revisionbranch),
		attachmentCount: Math.max(0, Number(row.attachmentcount) || 0),
		workDescription: text(row.workdescription), stateComment: text(row.statecomment), stateCommentAuthor: text(row.statecommentauthor),
	};
}

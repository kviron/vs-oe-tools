import { maximumSourceLineLimit, defaultSourceLineLimit } from './sourceContent';

export const z = require('zod');

export const sourceExcerptSchema = {
	startLine: z.number().int().min(1).optional().describe('First source line to return, default 1'),
	maxLines: z.number().int().min(1).max(maximumSourceLineLimit).optional().describe(`Maximum source lines to return, default ${defaultSourceLineLimit}`),
};

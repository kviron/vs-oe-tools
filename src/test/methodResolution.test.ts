import * as assert from 'node:assert/strict';
import { resolveMethodCandidates, signatureArgumentCount, type MethodResolutionCandidate } from '../mcp/methodResolution';

suite('MCP method reference resolution', () => {
	test('prefers the nearest implementation in the caller inheritance chain', () => {
		const result = resolveMethodCandidates([candidate('1', '10'), candidate('2', '20')], new Map([['10', 0], ['20', 1]]), new Map(), false);
		assert.equal(result.selected?.methodId, '1');
		assert.equal(result.confidence, 'high');
	});

	test('prefers the qualifier type over the caller class', () => {
		const result = resolveMethodCandidates([candidate('1', '10'), candidate('2', '30')], new Map([['10', 0]]), new Map([['30', 0]]), true);
		assert.equal(result.selected?.methodId, '2');
	});

	test('reports equally ranked overloads as ambiguous', () => {
		const result = resolveMethodCandidates([candidate('1', '10'), candidate('2', '10')], new Map([['10', 0]]), new Map(), false);
		assert.equal(result.ambiguous, true);
		assert.equal(result.selected, null);
	});

	test('uses argument count to rank overloads', () => {
		const one = candidate('1', '10', 'Save(value: Integer)');
		const two = candidate('2', '10', 'Save(key: String, value: Integer)');
		const result = resolveMethodCandidates([two, one], new Map([['10', 0]]), new Map(), false, 1);
		assert.equal(result.selected?.methodId, '1');
		assert.equal(signatureArgumentCount('Run(Map<A, B>, 2)'), 2);
		assert.equal(signatureArgumentCount('Run(const key: String; value: Integer)'), 2);
	});
});

function candidate(methodId: string, classId: string, signature = 'Run()'): MethodResolutionCandidate {
	return { methodId, methodName: 'Run', classId, className: `Class${classId}`, signature };
}

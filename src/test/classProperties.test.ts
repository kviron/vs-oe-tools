import * as assert from 'node:assert/strict';
import { selectVisibleProperties, type McpClassProperty } from '../mcp/classProperties';

suite('MCP class properties', () => {
	test('keeps the nearest property unless shadowed definitions are requested', () => {
		const derived = property('Caption', 0);
		const ancestor = property('caption', 2);
		assert.deepEqual(selectVisibleProperties([derived, ancestor], false), [derived]);
		assert.deepEqual(selectVisibleProperties([derived, ancestor], true), [derived, ancestor]);
	});
});

function property(name: string, depth: number): McpClassProperty {
	return {
		id: String(depth), name, aliases: '', ownerClassId: '1', ownerClassName: 'Owner',
		depth, inherited: depth > 0, type: '', readOnly: true, visibility: 'Public', package: '_Система', isBinary: false,
	};
}

import * as assert from 'node:assert/strict';
import { quotePostgresIdentifier, readAttributeValue, selectVisibleAttributes, type McpClassAttribute } from '../mcp/classAttributes';

suite('MCP class attributes', () => {
	test('reads fields case-insensitively using aliases', () => {
		assert.equal(readAttributeValue({ AttrType: 7, DBFieldName: 'beginplan_date' }, 'type', 'attrtype'), '7');
		assert.equal(readAttributeValue({ AttrType: 7, DBFieldName: 'beginplan_date' }, 'dbfieldname'), 'beginplan_date');
	});

	test('keeps the nearest attribute and can expose shadowed definitions', () => {
		const derived = attribute('Caption', 0);
		const ancestor = attribute('caption', 2);
		assert.deepEqual(selectVisibleAttributes([derived, ancestor], false), [derived]);
		assert.deepEqual(selectVisibleAttributes([derived, ancestor], true), [derived, ancestor]);
	});

	test('quotes PostgreSQL identifiers', () => {
		assert.equal(quotePostgresIdentifier('odd"name'), '"odd""name"');
	});
});

function attribute(name: string, depth: number): McpClassAttribute {
	return { id: String(depth), name, ownerClassId: '1', ownerClassName: 'Owner', depth, inherited: depth > 0, type: '', dbFieldName: '', data: {} };
}

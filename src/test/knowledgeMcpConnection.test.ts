import * as assert from 'assert';
import { parseKnowledgeMcpConnection } from '../mcp/knowledge/connectionSource';

suite('Knowledge MCP connection', () => {
	test('reads the temporary connection data without changing the collection', () => {
		assert.deepStrictEqual(parseKnowledgeMcpConnection('url: https://example.test/mcp\ntoken: example-token\ncollection: oe\n'), {
			url: 'https://example.test/mcp',
			token: 'example-token',
			collection: 'oe',
		});
	});

	test('does not register an incomplete connection', () => {
		assert.strictEqual(parseKnowledgeMcpConnection('url: https://example.test/mcp\ncollection: oe'), undefined);
	});
});

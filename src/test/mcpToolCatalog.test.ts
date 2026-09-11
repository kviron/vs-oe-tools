import * as assert from 'assert';
import { getRegisteredToolCatalog } from '../mcp/tools';

suite('MCP tool catalog', () => {
	test('contains every registered tool with a description and unique name', () => {
		const tools = getRegisteredToolCatalog();
		assert.ok(tools.length >= 40);
		assert.strictEqual(new Set(tools.map(tool => tool.name)).size, tools.length);
		assert.ok(tools.every(tool => tool.name.length > 0 && tool.description.length > 0));
		assert.ok(tools.every(tool => /[А-Яа-яЁё]/u.test(tool.description)));
		assert.deepStrictEqual(tools.filter(tool => tool.deprecated).map(tool => tool.name), [
			'update_method_source', 'create_class_method', 'create_class_attribute', 'execute_lifecycle_method',
			'update_database', 'update_packages', 'update_binaries', 'call_client_mcp_tool',
		]);
		assert.ok(tools.some(tool => tool.name === 'get_active_database'));
		assert.ok(tools.some(tool => tool.name === 'list_client_mcp_tools'));
	});
});

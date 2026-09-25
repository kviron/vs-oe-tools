import * as assert from 'assert';
import { getRegisteredToolCatalog } from '../mcp/tools';

suite('MCP tool catalog', () => {
	test('contains every registered tool with a description and unique name', () => {
		const tools = getRegisteredToolCatalog();
		assert.ok(tools.length >= 39);
		assert.strictEqual(new Set(tools.map(tool => tool.name)).size, tools.length);
		assert.ok(tools.every(tool => tool.name.length > 0 && tool.description.length > 0));
		assert.ok(tools.every(tool => /[А-Яа-яЁё]/u.test(tool.description)));
		assert.deepStrictEqual(tools.filter(tool => tool.deprecated).map(tool => tool.name), [
			'execute_lifecycle_method',
			'update_database', 'update_packages', 'update_binaries', 'query_readonly', 'call_client_mcp_tool',
		]);
		assert.ok(tools.some(tool => tool.name === 'get_active_database'));
		assert.ok(tools.some(tool => tool.name === 'create_class_method_checked' && !tool.deprecated));
		assert.ok(tools.some(tool => tool.name === 'update_method_source' && !tool.deprecated));
		assert.ok(tools.some(tool => tool.name === 'bind_objects_to_package'));
		assert.ok(tools.some(tool => tool.name === 'get_module_source'));
		assert.ok(tools.some(tool => tool.name === 'update_module_source' && !tool.deprecated));
		assert.ok(tools.some(tool => tool.name === 'update_dfm_source' && !tool.deprecated));
		assert.ok(tools.some(tool => tool.name === 'list_client_mcp_tools'));
		assert.ok(tools.some(tool => tool.name === 'start_client_mcp'));
		assert.ok(tools.some(tool => tool.name === 'stop_client_mcp'));
		assert.ok(!tools.some(tool => tool.name === 'create_class_attribute'));
		assert.ok(!tools.some(tool => tool.name === 'create_class_method'));
	});
});

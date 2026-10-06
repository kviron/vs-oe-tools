import * as assert from 'node:assert/strict';
import { z } from 'zod';
import { composeCommands, defineCommand } from '../features/ai/command';
import { commandRegistry } from '../features/ai/commandRegistry';
import { validateRequest } from '../features/ai/navigationRequest';
import type { NavigationActions } from '../features/ai/navigationTools';
import { registerCommandTools } from '../mcp/tools/commandTools';
import type { McpToolServer } from '../mcp/toolTypes';

suite('Feature command contracts', () => {
	test('a new feature command needs no transport field or route entry', async () => {
		let called = false;
		const registry = composeCommands({
			sample: defineCommand(z.object({ value: z.number().int().positive() }), async (input) => {
				called = true;
				return { doubled: input.value * 2 };
			}),
		});
		const actions = {} as NavigationActions;
		await assert.rejects(registry.sample.execute({ value: -1 }, actions));
		assert.equal(called, false);
		assert.deepEqual(await registry.sample.execute({ value: 3 }, actions), { doubled: 6 });
	});
	test('duplicate names fail composition instead of overriding another feature', () => {
		const group = { same: defineCommand(z.object({}), async () => ({})) };
		assert.throws(() => composeCommands(group, group), /Duplicate command: same/);
	});
	test('enum MCP and bridge reject the same invalid field values', () => {
		const command = commandRegistry.create_enum_element;
		const connection = { expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432 };
		const draft = { classId: 10609210, name: 'Test', fullName: 'Название', ord: 310 };
		for (const invalid of [
			{ ...draft, fullName: 'x'.repeat(101) },
			{ ...draft, fullName: '😀' },
			{ ...draft, name: 'bad name' },
			{ ...draft, ord: 0.5 },
		]) {
			assert.throws(() => command.tool!.prepare(invalid, connection));
			assert.throws(() => validateRequest({ action: 'create_enum_element', ...connection, enumDraft: invalid }));
		}
		const prepared = command.tool!.prepare(draft, connection);
		const parsed = validateRequest({ action: 'create_enum_element', ...prepared });
		assert.equal(parsed.action, 'create_enum_element');
		if (parsed.action === 'create_enum_element') {
			assert.deepEqual(parsed.enumDraft, draft);
			assert.equal(parsed.expectedDatabase, 'oetrunk');
		}
	});
	test('feature tools register automatically without duplicate catalog entries', () => {
		const names: string[] = [];
		const server: McpToolServer = {
			registerTool: (name, config) => {
				names.push(name);
				assert.ok(config.description);
				assert.ok(config.inputSchema);
			},
		};
		registerCommandTools(server);
		assert.deepEqual(names.sort(), ['create_enum_element', 'execute_patch', 'update_enum_element']);
	});
	test('unknown and prototype action names never pass validation', () => {
		for (const action of ['unknown', 'constructor', '__proto__', 'toString']) {
			assert.throws(() => validateRequest({ action }), /Unknown navigation action/);
		}
	});
});

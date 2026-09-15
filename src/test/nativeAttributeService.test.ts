import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';
import * as ts from 'typescript';
import * as editing from '../features/classes/nativeAttributeEditing';
import type { AttributeDetails } from '../features/classes/models';
import type * as Service from '../features/classes/nativeAttributeService';

// Run the real service with isolated, in-memory dependencies. Never connect test saves to a database.
function harness() {
	const details: AttributeDetails = { id: '71', ownerClassId: '70', ownerClassName: 'Owner', name: 'Name', attributeTypeName: 'Текст', createdBy: '',
		data: { attrtype: 354, virtual: -1, valueclasses: '', dbfieldname: '', static: 0, historic: 0, computedby: 0, computedbyexpr: '' } };
	const draft = editing.attributeDraft(details);
	const calls: string[] = [];
	const current = { details, database: 'test', healthDatabase: 'test', online: true, bound: true, failMutation: false,
		readbackId: 71, savedId: 71, starts: 0, stops: 0, mutationGate: undefined as Promise<void> | undefined };
	const tools = ['class_attribute_add', 'class_attribute_change'].map(name => ({ name, inputSchema: { properties:
		Object.fromEntries(Object.keys(editing.nativeAttributeArguments({ ...draft, sysPackage: 'Package' }, name.endsWith('change') ? 71 : undefined)).map(key => [key, {}])) } }));
	const result = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
	const dependencies: Record<string, unknown> = {
		vscode: { workspace: { workspaceFolders: [{ uri: { fsPath: '/workspace' } }], getConfiguration: () => ({ get: () => 'http://localhost:8080' }) },
			Disposable: class { constructor(public dispose: () => void) {} } },
		'../../infrastructure/configuration/projectDatabaseOptions': { getProjectDatabaseOptions: async () => ({ database: current.database, host: 'localhost', port: 5432 }) },
		'../../infrastructure/database/projectDatabaseSession': { withProjectDatabaseSession: async (fn: (session: unknown) => unknown) => fn({ client: { query: async () => ({ rows: [{ packagename: 'Package', filename: 'Class_Owner', objectid: current.bound ? 99 : null }] }) } }) },
		'../../infrastructure/database/classRepository': { getClassAttributeDetails: async () => current.details },
		'../lifecycle/oeStaticMethodExecutor': { startClientMcpProcess: async () => { current.starts++; current.online = true; } },
		'./nativeAttributeEditing': editing,
		'../../mcp/clientMcpHttp': {
			getClientMcpHealth: async () => { if (!current.online) { throw new Error('offline'); } return { status: 'ok', database: current.healthDatabase }; },
			listClientMcpTools: async () => [...tools, { name: 'class_member_get', inputSchema: { properties: { Members: {} } } }],
			stopClientMcpServer: async () => { current.stops++; },
			callClientMcpTool: async (name: string, args: Record<string, unknown>) => {
				calls.push(name);
				if (name === 'class_member_get') { return result({ items: [{ status: 'ok', item: { id: current.readbackId, name: current.details.name } }] }); }
				if (current.mutationGate) { await current.mutationGate; }
				if (current.failMutation) { throw new Error('connection lost after dispatch'); }
				current.details = { ...current.details, name: String(args.attribute_name) };
				return result({ id: current.savedId });
			},
		},
	};
	const source = readFileSync(path.resolve(__dirname, '../../src/features/classes/nativeAttributeService.ts'), 'utf8');
	const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const context = { exports: {}, URL, setTimeout, require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; } };
	runInNewContext(output, context);
	const service = context.exports as typeof Service;
	service.configureNativeAttributeClient(async () => ({ user: 'test', password: '' }));
	return { current, calls, draft, service, key: JSON.stringify(['/workspace', 'localhost', 5432, 'test']) };
}

suite('Native attribute save workflow', () => {
	test('edits through native read/change/read without stopping a pre-existing client', async () => {
		const h = harness(); await h.service.saveNativeAttribute({ ...h.draft, name: 'Renamed' }, h.key, h.draft, 71);
		assert.deepEqual(h.calls, ['class_member_get', 'class_attribute_change', 'class_member_get']);
		assert.equal(h.current.starts, 0); assert.equal(h.current.stops, 0);
	});
	test('creates through the native add tool and reads the returned ID', async () => {
		const h = harness(); const result = await h.service.saveNativeAttribute({ ...h.draft, sysPackage: 'Package' }, h.key);
		assert.equal(result.id, 71); assert.deepEqual(h.calls, ['class_attribute_add', 'class_member_get']);
	});
	test('blocks writes to a different native database', async () => {
		const h = harness(); h.current.healthDatabase = 'other';
		await assert.rejects(h.service.saveNativeAttribute(h.draft, h.key, h.draft, 71), /не к базе/);
		assert.deepEqual(h.calls, []);
	});
	test('blocks writes after switching the extension database', async () => {
		const h = harness(); h.current.database = 'other';
		await assert.rejects(h.service.saveNativeAttribute(h.draft, h.key, h.draft, 71), /проект изменились/);
		assert.deepEqual(h.calls, []);
	});
	test('detects outside changes before submitting the edit', async () => {
		const h = harness(); h.current.details = { ...h.current.details, name: 'External' };
		await assert.rejects(h.service.saveNativeAttribute(h.draft, h.key, h.draft, 71), /изменён вне карточки/);
		assert.deepEqual(h.calls, []);
	});
	test('never retries a dispatched mutation after a lost response', async () => {
		const h = harness(); h.current.failMutation = true;
		await assert.rejects(h.service.saveNativeAttribute(h.draft, h.key, h.draft, 71), h.service.AttributeSaveUncertainError);
		assert.equal(h.calls.filter(name => name === 'class_attribute_change').length, 1);
	});
	test('treats a mismatched returned ID as uncertain', async () => {
		const h = harness(); h.current.savedId = 0;
		await assert.rejects(h.service.saveNativeAttribute(h.draft, h.key, h.draft, 71), h.service.AttributeSaveUncertainError);
	});
	test('warns on an unbound package file without repeating creation', async () => {
		const h = harness(); h.current.bound = false;
		const result = await h.service.saveNativeAttribute({ ...h.draft, sysPackage: 'Package' }, h.key);
		assert.match(result.warning ?? '', /привязка/); assert.equal(h.calls.filter(name => name === 'class_attribute_add').length, 1);
	});
	test('starts and cleans up only its own client even on failure', async () => {
		const h = harness(); h.current.online = false; h.current.failMutation = true;
		await assert.rejects(h.service.saveNativeAttribute(h.draft, h.key, h.draft, 71));
		assert.equal(h.current.starts, 1); assert.equal(h.current.stops, 1);
	});
	test('serializes saves so the next edit sees the previous mutation', async () => {
		const h = harness(); let release!: () => void;
		h.current.mutationGate = new Promise<void>(resolve => { release = resolve; });
		const first = h.service.saveNativeAttribute({ ...h.draft, name: 'First' }, h.key, h.draft, 71);
		const second = h.service.saveNativeAttribute({ ...h.draft, name: 'Second' }, h.key, h.draft, 71);
		release(); await first;
		await assert.rejects(second, /изменён вне карточки/);
		assert.equal(h.calls.filter(name => name === 'class_attribute_change').length, 1);
	});
});

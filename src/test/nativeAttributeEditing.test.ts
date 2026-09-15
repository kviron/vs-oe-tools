import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';
import * as ts from 'typescript';
import { ref, computed } from '@vue/reactivity';
import { attributeDraft, nativeAttributeArguments, nativeAttributeResult, assertAttributeTool, validateNativeAttributeDraft, type NativeAttributeDraft } from '../features/classes/nativeAttributeEditing';
import { isAttributeDetailsWebviewMessage, isClassDetailsWebviewMessage, type AttributeDetailsHostMessage } from '../core/webviewProtocol';
import type { AttributeDetails } from '../features/classes/models';

const details: AttributeDetails = { id: '71', ownerClassId: '70', ownerClassName: 'ЧленКласса', name: 'ОбластьВидимости', attributeTypeName: 'Ссылка на объект', createdBy: '',
	data: { attrtype: 333, valueclasses: '12450282', dbfieldname: 'Visibility', virtual: 0, historic: -1, static: 0, computedby: 0, computedbyexpr: '' } };
const draft = attributeDraft(details);

suite('Native attribute editing contract', () => {
	test('maps actual metadata keys and native boolean flags', () => {
		assert.equal(draft.storageInDb, true); assert.equal(draft.isHistoric, true); assert.equal(draft.attributeTypeId, 333);
		assert.equal(attributeDraft({ ...details, data: { ...details.data, virtual: -1, computedby: -1, computedbyexpr: 'select 1' } }).isComputedBy, true);
		assert.equal(attributeDraft({ ...details, data: { ...details.data, virtual: -1 } }).storageInDb, false);
	});
	test('uses exact native names, numeric type IDs and excludes unsupported properties', () => {
		const args = nativeAttributeArguments({ ...draft, sysPackage: ' Пакет ' });
		assert.equal(args.class, '70'); assert.equal(args.sys_package, 'Пакет'); assert.equal(args.attribute_type, '333');
		assert.equal(args.storage_in_db, true); assert.equal(args.is_historic, true);
		const edit = nativeAttributeArguments({ ...draft, sysPackage: 'ignored' }, 71);
		assert.equal(edit.Attribute, '71'); assert.ok(!('class' in edit)); assert.ok(!('sys_package' in edit));
		assert.ok(!('aliases' in edit)); assert.ok(!('visibility' in edit));
	});
	test('rejects missing names, forged flags and malformed native references', () => {
		for (const invalid of [{ ...draft, name: ' ' }, { ...draft, ownerClassId: 0 }, { ...draft, isStatic: 'false' },
			{ ...draft, dbFieldName: 'bad field' }, { ...draft, valueClass: '1,2' }, { ...draft, valueClass: '' },
			{ ...draft, isComputedBy: true }, { ...draft, storageInDb: true, dbFieldName: '' }]) {
			assert.throws(() => validateNativeAttributeDraft(invalid));
			assert.equal(isAttributeDetailsWebviewMessage({ command: 'attributeSave', draft: invalid }), false);
		}
		assert.equal(isAttributeDetailsWebviewMessage({ command: 'attributeSave', draft }), true);
		assert.equal(isClassDetailsWebviewMessage({ command: 'editAttribute', id: 71 }), true);
		assert.equal(isAttributeDetailsWebviewMessage({ command: 'createClassAttribute', draft }), false);
	});
	test('rejects missing tools, incompatible schemas and omitted required arguments', () => {
		assert.throws(() => assertAttributeTool([], 'add', {}), /не поддерживает/);
		assert.throws(() => assertAttributeTool([{ name: 'add', inputSchema: { properties: {} } }], 'add', { class: '70' }), /несовместима/);
		assert.throws(() => assertAttributeTool([{ name: 'add', inputSchema: { properties: { class: {} } }, required: ['class'] }], 'add', {}), /обязательные/);
	});
	test('reads both mutation and batch envelopes and refuses native failures', () => {
		const result = (data: unknown) => ({ content: [{ text: JSON.stringify(data) }] });
		assert.equal(nativeAttributeResult(result({ id: 71 })).id, 71);
		assert.equal(nativeAttributeResult(result({ items: [{ status: 'ok', item: { id: 71 } }] })).id, 71);
		assert.throws(() => nativeAttributeResult({ isError: true, content: [{ text: 'native failed' }] }), /native failed/);
		assert.throws(() => nativeAttributeResult(result({ items: [{ status: 'not_found', error: 'missing' }] })), /missing/);
	});
});

function panelHarness(mode: 'view' | 'edit' | 'create' = 'view') {
	const source = readFileSync(path.resolve(__dirname, '../../webview-ui/src/attribute-details/App.vue'), 'utf8').split('<script setup lang="ts">')[1].split('</script>')[0];
	const parsed = ts.createSourceFile('panel.ts', source, ts.ScriptTarget.ES2022, true);
	const script = ts.createPrinter().printFile(ts.factory.updateSourceFile(parsed, parsed.statements.filter(statement => !ts.isImportDeclaration(statement))));
	const sent: { command: string; draft?: NativeAttributeDraft }[] = [];
	let receive!: (event: { data: AttributeDetailsHostMessage }) => void;
	const context = { ref, computed, validateNativeAttributeDraft, exports: {},
		vscode: { postMessage: (message: typeof sent[number]) => sent.push(message) },
		window: { addEventListener: (_name: string, callback: typeof receive) => { receive = callback; } },
		panel: undefined as unknown as { draft: { value: NativeAttributeDraft }; save(): void; formError: { value: string }; canSave: { value: boolean } },
	};
	runInNewContext(ts.transpileModule(script + '\nglobalThis.panel = {draft, save, formError, canSave};', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
	const initial: AttributeDetailsHostMessage = { command: 'attributeEditorState', details: mode === 'create' ? undefined : details,
		options: { ownerClassId: 70, ownerClassName: 'ЧленКласса', types: [{ id: 333, name: 'Ссылка' }], visibilities: [], distributionModes: [], defaults: { visibilityId: 1, distributionModeId: 1, isNotNull: false, virtual: false, refIntegrityCheck: false } }, draft: { ...draft }, mode, busy: false };
	const update = (patch: Partial<AttributeDetailsHostMessage> = {}) => receive({ data: { ...initial, ...patch } });
	update(); return { ...context.panel, sent, update };
}

suite('Attribute card state transitions', () => {
	test('view never sends a mutation', () => { const panel = panelHarness(); panel.save(); assert.equal(panel.sent.length, 1); });
	test('copy and owner acknowledgements preserve the local edit', () => {
		const panel = panelHarness('edit'); panel.draft.value.name = 'НовоеИмя'; panel.update();
		assert.equal(panel.draft.value.name, 'НовоеИмя');
	});
	test('sends only one save while waiting for host acknowledgement', () => {
		const panel = panelHarness('edit'); panel.save(); panel.save();
		assert.equal(panel.sent.filter(item => item.command === 'attributeSave').length, 1);
		panel.update({ mode: 'view' }); assert.equal(panel.canSave.value, false);
	});
	test('requires an explicit package for creation and preserves the draft on failure', () => {
		const panel = panelHarness('create'); panel.save(); assert.match(panel.formError.value, /пакет/);
		assert.equal(panel.sent.filter(item => item.command === 'attributeSave').length, 0);
		panel.draft.value.name = 'Несохранённый'; panel.update({ error: 'offline' });
		assert.equal(panel.draft.value.name, 'Несохранённый');
	});
	test('uncertain results block further mutations', () => {
		const panel = panelHarness('edit'); panel.update({ blocked: true, error: 'uncertain' }); panel.save();
		assert.equal(panel.canSave.value, false); assert.equal(panel.sent.length, 1);
	});
});

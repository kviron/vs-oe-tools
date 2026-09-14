import * as assert from 'node:assert/strict';
import {
	classProcedureMethodKind,
	defaultMethodCode,
	normalizeClassMethodDraft,
	serializeMethodCreationAuditValues,
	validateClassMethodDraft,
} from '../features/methods/methodCreation';
import type { ClassMethodDraft } from '../features/classes/models';

suite('Class method creation', () => {
	const captured: ClassMethodDraft = {
		ownerClassId: 3200139,
		name: 'acDeleteObjectExecute',
		visibilityId: 12450286,
		methodType: 3,
		methodKind: 0,
		signature: '',
		code: 'proc()\r\nbegin\r\n\r\nend;',
	};

	test('serializes the native creation audit contract and derives Signature from Code', () => {
		assert.equal(serializeMethodCreationAuditValues(captured),
			'103,acDeleteObjectExecute,71,12450286,123,3,1800,0,69,"()",127,"proc()\r\nbegin\r\n\r\nend;",102,3200139');
	});

	test('normalizes line endings and accepts the default interpreted method', () => {
		const normalized = normalizeClassMethodDraft({ ...captured, name: ' acTest ', code: 'proc()\nbegin\nend;' });
		assert.equal(normalized.name, 'acTest');
		assert.equal(normalized.code, 'proc()\r\nbegin\r\nend;');
		assert.equal(normalized.signature, '()');
		assert.doesNotThrow(() => validateClassMethodDraft({ ...captured, code: defaultMethodCode }));
	});

	test('accepts and preserves an interpreted class procedure', () => {
		const classProcedure = { ...captured, methodKind: classProcedureMethodKind };
		assert.doesNotThrow(() => validateClassMethodDraft(classProcedure));
		assert.match(serializeMethodCreationAuditValues(classProcedure), /1800,6/);
	});

	test('rejects unsupported method types and invalid names', () => {
		assert.throws(() => validateClassMethodDraft({ ...captured, name: 'bad name' }), /Имя метода/);
		assert.throws(() => validateClassMethodDraft({ ...captured, methodType: 1 as 3 }), /интерпретируемых/);
		assert.throws(() => validateClassMethodDraft({ ...captured, code: 'begin\r\nend;' }), /анонимного/);
	});
});

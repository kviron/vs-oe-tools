import * as assert from 'node:assert/strict';
import * as iconv from 'iconv-lite';
import { validateEnumElementDraft, encodeEnumElementAudit } from '../features/classes/enumElementCreation';
import { validateRequest } from '../features/ai/navigationRequest';

suite('Enum element creation', () => {
	const draft = { classId:10609210, name:'ДопСистемаВКомплектеВклВОтчет', fullName:'Доп. система в комплекте включена в отчёт РИЦ', ord:310 };
	test('rejects truncation and unsupported encoding before any mutation', () => {
		assert.doesNotThrow(() => validateEnumElementDraft(draft));
		assert.throws(() => validateEnumElementDraft({ ...draft, fullName:'я'.repeat(101) }), /100/);
		assert.throws(() => validateEnumElementDraft({ ...draft, fullName:'Ошибка 😀' }), /Windows-1251/);
		assert.throws(() => validateEnumElementDraft({ ...draft, ord:2147483648 }), /int32/);
	});
	test('requires an exact connection and preserves the draft through the bridge', () => {
		assert.throws(() => validateRequest({ action:'create_enum_element', enumDraft:draft }), /expectedDatabase/);
		const request = validateRequest({ action:'create_enum_element', enumDraft:draft,
			expectedDatabase:'oetrunk', expectedHost:'localhost', expectedPort:5432 });
		assert.equal(request.action, 'create_enum_element');
		if(request.action==='create_enum_element'){assert.deepEqual(request.enumDraft, draft);}
	});
	test('audit records the enum fields with escaped quotes', () => {
		assert.match(iconv.decode(encodeEnumElementAudit({ ...draft, fullName:'Ошибка "А"' },179447980),'win1251'),
			/104,310,23102,"Ошибка ""А""",106,179447980$/);
	});
});

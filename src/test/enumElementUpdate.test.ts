import * as assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import * as iconv from 'iconv-lite';
import { updateEnumElementWithClient } from '../infrastructure/database/enumElementUpdateRepository';
import { validateRequest } from '../features/ai/navigationRequest';

suite('Enum element editing', () => {
	const request = { objectId:3200480, classId:10609210, name:'NewName', fullName:'Новое название', ord:320,
		previous:{ name:'OldName', fullName:'Прежнее название', ord:310 },
		expectedDatabase:'oetrunk', expectedHost:'localhost', expectedPort:5432 };
	type Fault = 'stale' | 'placeholder' | 'wrongFile' | 'noFile' | 'noSync' | 'wrongClass' | 'duplicate' | 'abstract' | 'readback' | 'database' | 'audit' | 'package';
	function fixture(fault?: Fault, finalFields = { name:request.name,fullName:request.fullName,ord:request.ord }) {
		const statements: Array<{sql:string;values:unknown[]}> = [];
		let saved = false;
		const client = { query:async (sql:string, values:unknown[] = []) => {
			statements.push({ sql, values });
			let rows: unknown[] = [];
			let rowCount = 1;
			if (sql.includes('current_database()')) { rows=[{ database:fault==='database'?'oetest':'oetrunk' }]; }
			else if (sql.includes('FROM enum e JOIN abstract')) {
				const fields = saved?finalFields:request.previous;
				rows=[{ classid:fault==='wrongClass'?123:request.classId, abstractclassid:request.classId,
					name:fault==='stale'?'SomebodyElse':fields.name, fullname:fields.fullName, ord:fields.ord,
					abstractname:fields.name, abstractord:fields.ord, sysfile:fault==='noFile'?null:fault==='wrongFile'?2:179447980,
					ownersysfile:179447980, filename:fault==='placeholder'?'#package$':'Перечисление_ОшибкиОтчетаРИЦ',
					packagename:'Консультант', synced:fault!=='noSync' }];
				if (saved && fault==='readback') { throw new Error('readback failed'); }
			} else if (sql.startsWith('SELECT id FROM enum')) {
				rows=fault==='duplicate'?[{id:3200479}]:[]; rowCount=rows.length;
			} else if (sql.includes('INSERT INTO logcchangedobject') && fault==='audit') { rowCount=0; }
			else if (sql.startsWith('UPDATE abstract') && fault==='abstract') { rowCount=0; }
			else if (sql.includes('INSERT INTO syspackagebase') && fault==='package') { throw new Error('package failed'); }
			else if (sql==='COMMIT') { saved=true; }
			return { rows, rowCount, fields:[], command:'SELECT' };
		} } as unknown as PoolClient;
		return { client, statements };
	}
	const session = async () => ({ userId:3130673,computerName:'test',changeDate:new Date('2026-10-05T00:00:00Z') });
	test('saves both copies with old/new audit and marks package before commit', async () => {
		const {client,statements} = fixture();
		const result = await updateEnumElementWithClient(client,request,session);
		assert.equal(result.changed,true);
		assert.equal(result.verified,true);
		const audit = statements.find(s=>s.sql.includes('INSERT INTO logcchangedobject'))!;
		assert.match(iconv.decode(audit.values[2] as Buffer,'win1251'),/Новое название/);
		assert.match(iconv.decode(audit.values[6] as Buffer,'win1251'),/Прежнее название/);
		assert.equal(statements.filter(s=>s.sql.startsWith('UPDATE ')).length,2);
		assert.ok(statements.findIndex(s=>s.sql.includes('INSERT INTO syspackagebase')) < statements.findIndex(s=>s.sql==='COMMIT'));
	});
	test('rejects stale values, duplicate names, wrong database/class without writes', async () => {
		for (const fault of ['stale','duplicate','database','wrongClass'] as const) {
			const {client,statements} = fixture(fault);
			await assert.rejects(updateEnumElementWithClient(client,request,session));
			assert.equal(statements.some(s=>/INSERT INTO|UPDATE enum|UPDATE abstract/.test(s.sql)),false,fault);
			assert.equal(statements.at(-1)?.sql,'ROLLBACK');
		}
	});
	test('edits independently of package placement and sync state', async () => {
        for (const fault of ['placeholder','wrongFile','noFile','noSync'] as const) {
            const {client,statements} = fixture(fault);
            const result = await updateEnumElementWithClient(client,request,session);
            assert.equal(result.verified,true,fault);
            assert.equal(statements.some(s=>s.sql.includes('INSERT INTO syspackagebase')),fault!=='noFile');
            assert.equal(result.sysFileId,fault==='noFile'?null:fault==='wrongFile'?2:179447980);
        }
    });
	test('rolls back failures of audit, Abstract update and package registration', async () => {
		for (const fault of ['audit','abstract','package'] as const) {
			const {client,statements} = fixture(fault);
			await assert.rejects(updateEnumElementWithClient(client,request,session));
			assert.equal(statements.at(-1)?.sql,'ROLLBACK');
			assert.equal(statements.some(s=>s.sql==='COMMIT'),false);
		}
	});
	test('preserves committed-state information on failed readback', async () => {
		const {client,statements} = fixture('readback');
		await assert.rejects(updateEnumElementWithClient(client,request,session),/ID=3200480.*завершена/);
		assert.equal(statements.some(s=>s.sql==='COMMIT'),true);
		assert.equal(statements.some(s=>s.sql==='ROLLBACK'),false);
	});
	test('bridge requires previous values and keeps the update payload', () => {
		const input = { action:'update_enum_element',enumUpdate:request,expectedDatabase:'oetrunk',expectedHost:'localhost',expectedPort:5432 };
		const parsed=validateRequest(input);
		assert.equal(parsed.action,'update_enum_element');
		if(parsed.action==='update_enum_element'){
			const {expectedDatabase:_db,expectedHost:_host,expectedPort:_port,...draft}=request;
			assert.deepEqual(parsed.enumUpdate,draft);
		}
		assert.throws(()=>validateRequest({...input,enumUpdate:{...request,previous:undefined}}),/previous/);
		assert.throws(()=>validateRequest({...input,expectedHost:undefined}),/expectedHost/);
	});
	test('unchanged values do not create an audit entry or write metadata', async () => {
		const {client,statements} = fixture(undefined,request.previous);
		const result = await updateEnumElementWithClient(client,{...request,...request.previous},async () => {
			throw new Error('No session should be loaded for a no-op');
		});
		assert.equal(result.changed,false);
		assert.equal(result.requiresClientRestart,false);
		assert.equal(statements.some(s=>/INSERT INTO|UPDATE enum|UPDATE abstract/.test(s.sql)),false);
	});
});

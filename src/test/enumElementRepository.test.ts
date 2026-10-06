import * as assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { createEnumElementWithClient } from '../infrastructure/database/enumElementRepository';

suite('Enum element transaction', () => {
	const request = { classId:10609210, name:'TestEnum', fullName:'Тест', ord:310,
		expectedDatabase:'oetrunk', expectedHost:'localhost', expectedPort:5432 };
	function fixture(failure?: 'placeholder' | 'duplicate' | 'audit' | 'verification' | 'database') {
		const statements: string[] = [];
		const client = { query:async (sql: string) => {
			statements.push(sql);
			let rows: unknown[] = [];
			if (sql.includes('current_database()')) { rows=[{ database:failure==='database'?'oetest':'oetrunk' }]; }
			else if (sql.includes('FROM classes c')) { rows=[{ sysfile:179447980, filename:failure==='placeholder'?'#package$':'Перечисление_ОшибкиОтчетаРИЦ', packagename:'Консультант' }]; }
			else if (sql.startsWith('SELECT id FROM enum') && failure==='duplicate') { rows=[{ id:3200479 }]; }
			else if (sql.includes('FROM users u')) { rows=[{ beginid:3200000, endid:3200999 }]; }
			else if (sql.includes('MAX(id)+1')) { rows=[{ id:3200480 }]; }
			else if (sql.includes('INSERT INTO logcchangedobject') && failure==='audit') { throw new Error('audit failed'); }
			else if (sql.includes('INSERT INTO syspackagebase')) { rows=[{}]; }
			else if (sql.includes('FROM enum e JOIN abstract')) { rows=[{ id:3200480, classid:request.classId, name:request.name,
				fullname:request.fullName, ord:request.ord, sysfile:failure==='verification'?1:179447980, synced:true }]; }
			return { rows, rowCount:rows.length, fields:[], command:'SELECT' };
		} } as unknown as PoolClient;
		return { client, statements };
	}
	const session = async () => ({ userId:3130673, computerName:'test', changeDate:new Date('2026-10-05T00:00:00Z') });
	test('commits one bound element and verifies the saved state', async () => {
		const { client, statements } = fixture();
		const result = await createEnumElementWithClient(client,request,session);
		assert.equal(result.sysFileId,179447980);
		assert.equal(result.verified,true);
		assert.equal(statements.filter(s=>s==='COMMIT').length,1);
		assert.ok(statements.findIndex(s=>s.includes('INSERT INTO syspackagebase')) < statements.indexOf('COMMIT'));
	});
	test('rejects wrong database, placeholders and duplicates before inserts', async () => {
		for (const failure of ['database','placeholder','duplicate'] as const) {
			const { client, statements } = fixture(failure);
			await assert.rejects(createEnumElementWithClient(client,request,session));
			assert.equal(statements.some(s=>s.includes('INSERT INTO')),false);
			assert.equal(statements.at(-1),'ROLLBACK');
		}
	});
	test('rolls back audit failures instead of creating an unaudited object', async () => {
		const { client, statements } = fixture('audit');
		await assert.rejects(createEnumElementWithClient(client,request,session),/audit failed/);
		assert.equal(statements.some(s=>s.includes('INSERT INTO enum')),false);
		assert.equal(statements.at(-1),'ROLLBACK');
	});
	test('reports a committed ID on failed readback without claiming rollback', async () => {
		const { client, statements } = fixture('verification');
		await assert.rejects(createEnumElementWithClient(client,request,session),/ID=3200480 уже создан/);
		assert.equal(statements.includes('COMMIT'),true);
		assert.equal(statements.includes('ROLLBACK'),false);
	});
});

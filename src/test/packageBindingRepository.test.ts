import * as assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { bindObjectsToPackageWithClient } from '../infrastructure/database/objectPackageBindingRepository';

suite('Package binding and moving', () => {
	const request = { objectIds: [1,2,3], sysFileId: 100,
		expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432 };
	function fixture(fault?: 'missing' | 'target' | 'sourceSync' | 'update' | 'readback' | 'unchanged') {
		const statements: Array<{ sql: string; values: unknown[] }> = [];
		let committed = false;
		const client = { query: async (sql: string, values: unknown[] = []) => {
			statements.push({ sql, values });
			let rows: unknown[] = [];
			let rowCount = 1;
			if (sql.includes('current_database()')) { rows = [{ database: 'oetrunk' }]; }
			else if (sql.includes('AS sysfileid')) {
				rows = [{ objectid: null, sysfileid: 100, filename: fault === 'target' ? '#package$' : 'Target',
					sysgroupid: 10, groupname: 'Group', packageid: 20, packagename: 'Package' }];
			} else if (sql.includes('SELECT id, classid')) {
				if (committed && fault === 'readback') { throw new Error('readback failed'); }
				rows = (fault === 'missing' ? [1,2] : [1,2,3]).map(id => ({ id, classid: 23101, seniorid: null,
					name: `Object${id}`, sysfile: committed || fault === 'unchanged' ? 100 : id === 1 ? null : id === 2 ? 200 : 100 }));
				rowCount = rows.length;
			} else if (sql.startsWith('UPDATE abstract')) { rowCount = fault === 'update' ? 1 : 2; }
			else if (sql.includes('INSERT INTO syspackagebase') && values[3] === 200 && fault === 'sourceSync') {
				throw new Error('source sync failed');
			} else if (sql === 'COMMIT') { committed = true; }
			return { rows, rowCount, fields: [], command: 'SELECT' };
		} } as unknown as PoolClient;
		return { client, statements };
	}
	const session = async () => ({ userId: 42, computerName: 'test', changeDate: new Date() });
	test('binds, moves and preserves already matching objects atomically', async () => {
		const { client, statements } = fixture();
		const result = await bindObjectsToPackageWithClient(client,'oetrunk',request,session);
		assert.deepEqual(result.changedObjectIds,[1,2]);
		assert.deepEqual(result.unchangedObjectIds,[3]);
		assert.deepEqual(result.movedObjects,[{ objectId: 2, previousSysFileId: 200, sysFileId: 100 }]);
		assert.deepEqual(result.changedFileIds,[100,200]);
		const updates = statements.filter(s => s.sql.startsWith('UPDATE abstract'));
		assert.deepEqual(updates[0].values,[100,[1,2]]);
		assert.match(updates[0].sql,/IS DISTINCT FROM/);
		assert.deepEqual(statements.filter(s=>s.sql.includes('INSERT INTO syspackagebase')).map(s=>s.values[3]),[100,200]);
		assert.ok(statements.findIndex(s=>s.sql.includes('FOR UPDATE')) < statements.findIndex(s=>s.sql.startsWith('UPDATE abstract')));
	});
	test('repeated binding keeps matching objects and does not move them again', async () => {
		const { client, statements } = fixture('unchanged');
		const result = await bindObjectsToPackageWithClient(client,'oetrunk',request,session);
		assert.deepEqual(result.changedObjectIds,[]);
		assert.deepEqual(result.movedObjects,[]);
		assert.deepEqual(result.unchangedObjectIds,[1,2,3]);
		assert.equal(statements.some(s=>s.sql.startsWith('UPDATE abstract')),false);
		assert.deepEqual(result.changedFileIds,[100]);
	});
	test('rolls back missing objects, invalid target, incomplete update and source sync failure', async () => {
		for (const fault of ['missing','target','update','sourceSync'] as const) {
			const { client, statements } = fixture(fault);
			await assert.rejects(bindObjectsToPackageWithClient(client,'oetrunk',request,session));
			assert.equal(statements.at(-1)?.sql,'ROLLBACK');
			assert.equal(statements.some(s=>s.sql==='COMMIT'),false);
		}
	});
	test('reports committed mutations when verification fails', async () => {
		const { client, statements } = fixture('readback');
		await assert.rejects(bindObjectsToPackageWithClient(client,'oetrunk',request,session),/commit/);
		assert.equal(statements.some(s=>s.sql==='ROLLBACK'),false);
	});
});

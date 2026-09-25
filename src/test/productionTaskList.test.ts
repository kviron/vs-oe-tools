import * as assert from 'node:assert/strict';
import * as net from 'node:net';
import type { ProductionConnectionOptions } from '../features/production-tasks/models';
import { expectedPacketLength } from '../features/production-tasks/oenpProtocol';
import { loadProductionTaskActions, loadProductionTaskById, loadProductionTaskList } from '../features/production-tasks/productionTasksRepository';
import { productionTaskByIdSql, productionTaskListSql } from '../features/production-tasks/queries';
import { isProductionTasksWebviewMessage } from '../core/webviewProtocol';

const currentPerson = 938697394;
const otherPerson = 938697395;

suite('Production task list loading', () => {
	test('filters on the server without loading full-card fields or silently limiting all tasks', () => {
		const sql = productionTaskListSql(currentPerson);
		assert.match(sql, /WHERE T0\.RespPerson = 938697394\nORDER BY/);
		assert.doesNotMatch(sql, /HistoryLC|PartNews|T0\.Comment|T0\.LCLastActionID|T0\.Manager|T0\.Analizer/);
		assert.doesNotMatch(productionTaskListSql(), /WHERE T0\.RespPerson|\bLIMIT\b/);
		assert.match(productionTaskByIdSql(42), /WHERE T0\.ID = 42\nLIMIT 1$/);
		assert.match(productionTaskByIdSql(42), /HistoryLC/);
		assert.throws(() => productionTaskListSql(-1));
		assert.throws(() => productionTaskListSql(Number.NaN));
		assert.throws(() => productionTaskListSql(1.5));
	});

	test('validates user filters at the webview boundary', () => {
		assert.equal(isProductionTasksWebviewMessage({ command: 'productionTasksReady' }), true);
		assert.equal(isProductionTasksWebviewMessage({ command: 'refreshProductionTasks', userFilter: '' }), true);
		assert.equal(isProductionTasksWebviewMessage({ command: 'refreshProductionTasks', userFilter: String(otherPerson) }), true);
		assert.equal(isProductionTasksWebviewMessage({ command: 'refreshProductionTasks', userFilter: {} }), false);
	});

	for (const [label, filter, expectedUser] of [
		['current user by default', undefined, String(currentPerson)],
		['all users explicitly', '', ''],
		['another user', String(otherPerson), String(otherPerson)],
		['saved display name', 'Другой пользователь', String(otherPerson)],
	] as const) {
		test(`loads ${label} with one login and keeps every user available`, async () => {
			await withServer(async (options, requests) => {
				let rowsShown = false;
				const result = await loadProductionTaskList(options, filter, undefined, async result => {
					rowsShown = true;
					assert.equal(result.userFilter, expectedUser);
					if (label !== 'saved display name') {
						assert.equal(requests.length, 8, 'show tasks before requesting the user directory');
						assert.doesNotMatch(requests[7].toString('ascii'), /WHERE EXISTS/);
					}
				});
				assert.equal(rowsShown, true);
				assert.equal(result.userFilter, expectedUser);
				assert.equal(result.users.length, 2);
				assert.equal(result.tasks.length, expectedUser ? 1 : 2);
				assert.equal('workDescription' in result.tasks[0], false);
				assert.equal(requests.filter(packet => packet.readUInt32LE(8) === 1).length, 1);
				assert.equal(requests.length, 9);
				const sql = requests[label === 'saved display name' ? 8 : 7].toString('ascii');
				if (expectedUser) { assert.ok(sql.includes(`WHERE T0.RespPerson = ${expectedUser}`)); }
				else { assert.doesNotMatch(sql, /WHERE T0\.RespPerson/); }
			});
		});
	}

	test('loads full detail by the exact selected ID on demand', async () => {
		await withServer(async (options, requests) => {
			const task = await loadProductionTaskById(options, 42);
			assert.equal(task?.workDescription, 'Полное описание');
			assert.match(requests[7].toString('ascii'), /WHERE T0\.ID = 42\nLIMIT 1/);
			assert.doesNotMatch(requests[7].toString('ascii'), /WHERE T0\.DNumber/);
		});
	});

	test('loads actions through one authenticated session', async () => {
		await withServer(async (options, requests) => {
			const actions = await loadProductionTaskActions(options, 42);
			assert.deepEqual(actions.map(action => action.id), [17]);
			assert.deepEqual(requests.map(packet => packet.readUInt32LE(8)), [1, 2, 3, 4, 5, 6, 7, 8]);
			assert.match(requests[7].toString('ascii'), /WHERE T0\.ID = 42/);
		});
	});
});

async function withServer(run: (options: ProductionConnectionOptions, requests: Buffer[]) => Promise<void>): Promise<void> {
	const requests: Buffer[] = [];
	const sockets = new Set<net.Socket>();
	const server = net.createServer(socket => {
		sockets.add(socket);
		socket.on('close', () => sockets.delete(socket));
		let pending: Buffer = Buffer.alloc(0);
		socket.on('data', chunk => {
			pending = Buffer.concat([pending, chunk]);
			while (pending.length >= 8 && pending.length >= expectedPacketLength(pending)) {
				const packet = pending.subarray(0, expectedPacketLength(pending));
				pending = pending.subarray(packet.length);
				requests.push(packet);
				const id = packet.readUInt32LE(8);
				const sql = packet.toString('ascii');
				let body: Buffer = Buffer.alloc(0);
				if (id === 6) { body = Buffer.from('0123456789ABCDEF0123456789ABCDEF'); }
				else if (id >= 8 && sql.includes('JOIN ActionLC A')) {
					body = dataset(['id', 'name'], [[17, 'Открыть']]);
				} else if (id >= 8 && sql.includes('WHERE EXISTS')) {
					body = dataset(['id', 'name'], [[currentPerson, 'Текущий пользователь'], [otherPerson, 'Другой пользователь']]);
				} else if (id >= 8 && sql.includes('WHERE T0.ID = 42')) {
					body = dataset(['id', 'workdescription'], [[42, 'Полное описание']]);
				} else if (id >= 8) {
					const selected = sql.match(/WHERE T0\.RespPerson = (\d+)/)?.[1];
					const people = selected ? [Number(selected)] : [currentPerson, otherPerson];
					body = dataset(['id', 'responsibleuserid'], people.map((person, index) => [42 + index, person]));
				}
				const response = Buffer.alloc(13 + body.length);
				response.write('OENP'); response.writeUInt32LE(response.length - 13, 4); response.writeUInt32LE(id, 8);
				body.copy(response, 13);
				socket.write(response);
			}
		});
	});
	await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
	try {
		const address = server.address() as net.AddressInfo;
		await run({ host: '127.0.0.1', port: address.port, database: 'test', username: 'test', password: 'test', personId: currentPerson, clientSessionKey: '0123456789abcdef0123456789abcdef' }, requests);
	} finally {
		for (const socket of sockets) { socket.destroy(); }
		await new Promise<void>(resolve => server.close(() => resolve()));
	}
}

function dataset(fields: string[], rows: (string | number)[][]): Buffer {
	const integer = (value: number) => { const buffer = Buffer.alloc(4); buffer.writeInt32LE(value); return buffer; };
	return Buffer.concat([
		Buffer.from('MemoryDataPacket'), Buffer.alloc(9), Buffer.from([fields.length]),
		...fields.map((field, index) => Buffer.concat([Buffer.from([field.length]), Buffer.from(field), Buffer.from([typeof rows[0][index] === 'number' ? 3 : 24, 64, 0, 0])])),
		Buffer.alloc(2), integer(rows.length),
		...rows.map(row => Buffer.concat([Buffer.from([1, (1 << fields.length) - 1, 0]), ...row.map(value => typeof value === 'number' ? integer(value) : Buffer.concat([Buffer.from([value.length]), Buffer.from(value, 'utf16le')]))])),
	]);
}

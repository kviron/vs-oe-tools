import * as assert from 'node:assert/strict';
import { buildPackageTree } from '../features/packages/packageTree';

suite('Package explorer repository', () => {
	test('builds nested package folders from SysGroups.Path and attaches files', () => {
		const tree = buildPackageTree(10, 'Консультант', [
			{ id: '20', groupname: 'Диалоги', path: 'Диалоги' },
			{ id: '21', groupname: 'Старые диалоги', path: 'Диалоги\\Старые диалоги' },
			{ id: '22', groupname: 'SPU', path: 'SPU' },
		], [
			{ id: '30', filename: 'Диалог_DGetRicAndSU', sysgroup: '21', objectcount: '3' },
			{ id: '31', filename: '88440.sql', sysgroup: '22', objectcount: '0' },
		]);

		assert.equal(tree.name, 'Консультант');
		const files = tree.children[0];
		assert.equal(files?.name, 'Файлы');
		const dialogs = files?.children.find(node => node.id === 20);
		const legacy = dialogs?.children.find(node => node.id === 21);
		assert.deepEqual(legacy?.children.map(node => [node.name, node.hasChildren]), [['Диалог_DGetRicAndSU', true]]);
		assert.equal(files?.children.find(node => node.id === 22)?.children[0]?.name, '88440.sql');
	});
});

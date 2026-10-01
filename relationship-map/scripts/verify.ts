import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'relationship-map-'));
const root = path.resolve(import.meta.dirname, '..');
const plugin = JSON.parse(await readFile(path.join(root, 'plugin.json'), 'utf8'));
const mcp = JSON.parse(await readFile(path.join(root, 'mcp.json'), 'utf8'));
assert.equal(plugin.name, 'relationship-map');
assert.equal(mcp.mcpServers['relationship-map'].type, 'stdio');
assert.equal(mcp.mcpServers['relationship-map'].command, 'node');
process.env.RELATIONSHIP_MAP_DIR = temporary;
const { listMaps, readMap, saveMap, changesSince } = await import('../server/store.js');
const { mapSchema } = await import('../server/schema.js');
assert.equal(mapSchema.parse({ schemaVersion: 2, title: 'Метод', nodes: [{ id: 'method', kind: 'method', title: 'Выполнить', description: '', x: 0, y: 0, attributes: { 'Сигнатура': 'Выполнить(id: Integer): Boolean', 'Контракт': 'Проверить входные данные\nВернуть результат' } }], edges: [] }).nodes[0].attributes?.['Контракт'], 'Проверить входные данные\nВернуть результат');
for (const name of ['extension', 'east-express-demo']) {
  const example = JSON.parse(await readFile(path.join(root, 'maps', `${name}.json`), 'utf8'));
  assert.equal(mapSchema.parse(example).nodes.length, example.nodes.length);
}
try {
  const initial = { schemaVersion: 2, title: 'Тест', nodes: [{ id: 'a', kind: 'entity', title: 'A', description: '', x: 0, y: 0 }], edges: [] };
  const first = await saveMap('test', initial, null);
  assert.deepEqual(await listMaps(), ['test']);
  assert.equal((await readMap('test')).revision, first.revision);
  const changed = { ...initial, nodes: [...initial.nodes, { id: 'b', kind: 'entity', title: 'B', description: '', x: 100, y: 0 }], edges: [{ from: 'a', to: 'b', type: 'relates' }] };
  const second = await saveMap('test', changed, first.revision);
  const diff = await changesSince('test', first.revision);
  assert.equal(diff.toRevision, second.revision);
  assert.deepEqual(diff.addedNodes.map(node => node.id), ['b']);
  assert.equal(diff.addedEdges.length, 1);
  await assert.rejects(saveMap('test', initial, first.revision), /Карта изменилась/);
  const concurrent = await Promise.allSettled([saveMap('test', initial, second.revision), saveMap('test', initial, second.revision)]);
  assert.deepEqual(concurrent.map(item => item.status).sort(), ['fulfilled', 'rejected']);
  await assert.rejects(readMap('../outside'), /Имя карты/);
  await assert.rejects(saveMap('broken', { ...initial, edges: [{ from: 'a', to: 'missing' }] }, null));
  console.log('Store, revisions, diff, validation: OK');
} finally {
  await rm(temporary, { recursive: true, force: true });
}

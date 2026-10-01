import * as assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMapStore } from '../features/relationship-maps/store';
import { startNavigationBridge } from '../features/ai/navigationBridge';
import type { NavigationActions } from '../features/ai/navigationTools';

suite('Relationship maps', () => {
 let directory: string;
 setup(async () => { directory = await mkdtemp(join(tmpdir(), 'vc-ve-maps-')); });
 teardown(async () => { await rm(directory, { recursive: true, force: true }); });
 const map = { schemaVersion: 2, title: 'Test', nodes: [{ id: 'a', kind: 'class', title: 'A', x: 0, y: 0 }], edges: [] };
 test('preserves user edits, rejects stale saves, and compares revisions', async () => {
  const agent = createMapStore(directory);
  const user = createMapStore(directory);
  const first = await agent.saveMap('test', map, null);
  await user.saveMap('test', { ...map, title: 'User edit' }, first.revision);
  await assert.rejects(agent.saveMap('test', map, first.revision), /Карта изменилась/);
  assert.equal((await agent.readMap('test')).map.title, 'User edit');
  const changes = await agent.changesSince('test', first.revision);
  assert.notEqual(changes.fromRevision, changes.toRevision);
  assert.deepEqual(changes.changedMapFields.title, { before: 'Test', after: 'User edit' });
  assert.deepEqual(await agent.listMaps(), ['test']);
 });
 test('detects changes to relation attributes and map-local kinds', async () => {
  const store = createMapStore(directory);
  const linked = { ...map, edges: [{ from: 'a', to: 'a', type: 'calls', attributes: { evidence: 'old' } }] };
  const first = await store.saveMap('test', linked, null);
  await store.saveMap('test', { ...linked, nodeKinds: { class: { label: 'Class', color: '#64748b' } }, edges: [{ ...linked.edges[0], attributes: { evidence: 'verified' } }] }, first.revision);
  const changes = await store.changesSince('test', first.revision);
  assert.equal(changes.addedEdges[0].attributes?.evidence, 'verified');
  assert.equal(changes.removedEdges[0].attributes?.evidence, 'old');
  assert.ok(changes.changedMapFields.nodeKinds);
 });
 test('allows only one concurrent writer for a revision', async () => {
  const store = createMapStore(directory);
  const first = await store.saveMap('test', map, null);
  const results = await Promise.allSettled(['one', 'two'].map(title => store.saveMap('test', { ...map, title }, first.revision)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
 });
 test('rejects path traversal and dangling edges without writing a map', async () => {
  const store = createMapStore(directory);
  await assert.rejects(store.saveMap('../escape', map, null));
  await assert.rejects(store.saveMap('test', { ...map, edges: [{ from: 'a', to: 'missing' }] }, null));
  assert.deepEqual(await store.listMaps(), []);
 });
 test('routes JSON through the authenticated extension bridge without database operations', async () => {
  const store = createMapStore(directory);
  const bridge = await startNavigationBridge({ relationshipMap: async (value: unknown) => {
   const input = value as { operation: string; name: string; map: unknown; expectedRevision: string | null };
   return input.operation === 'save' ? store.saveMap(input.name, input.map, input.expectedRevision) : store.readMap(input.name);
  } } as unknown as NavigationActions, join(directory, 'bridge-info'));
  try {
   const call = (mapRequest: unknown, token = bridge.token) => fetch(bridge.url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'relationship_map', mapRequest }) });
   assert.equal((await call({ operation: 'save', name: 'test', map, expectedRevision: null }, 'wrong')).status, 401);
   const saved = await call({ operation: 'save', name: 'test', map, expectedRevision: null });
   assert.equal(saved.status, 200);
   const read = await call({ operation: 'read', name: 'test' });
   assert.equal((await read.json() as { map: { title: string } }).map.title, 'Test');
  } finally { bridge.dispose(); }
 });
});

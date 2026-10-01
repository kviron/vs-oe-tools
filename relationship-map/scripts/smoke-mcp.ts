import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'relationship-map-mcp-'));
const client = new Client({ name: 'relationship-map-smoke', version: '0.1.0' });
const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'dist/server/mcp.js')], cwd: root, env: { ...env, RELATIONSHIP_MAP_DIR: directory } });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['get_map_changes', 'list_maps', 'read_map', 'save_map']);
  const map = { schemaVersion: 2, title: 'MCP smoke', nodes: [{ id: 'a', kind: 'entity', title: 'A', description: '', x: 0, y: 0 }], edges: [] };
  const first = await client.callTool({ name: 'save_map', arguments: { name: 'smoke', map, expectedRevision: null } });
  const firstRevision = JSON.parse(first.content.find(item => item.type === 'text')!.text).revision;
  const listed = await client.callTool({ name: 'list_maps', arguments: {} });
  assert.match(JSON.stringify(listed), /smoke/);
  const read = await client.callTool({ name: 'read_map', arguments: { name: 'smoke' } });
  assert.equal(JSON.parse(read.content.find(item => item.type === 'text')!.text).revision, firstRevision);
  const changed = { ...map, nodes: [...map.nodes, { id: 'b', kind: 'entity', title: 'B', description: '', x: 100, y: 0 }] };
  await client.callTool({ name: 'save_map', arguments: { name: 'smoke', map: changed, expectedRevision: firstRevision } });
  const diff = await client.callTool({ name: 'get_map_changes', arguments: { name: 'smoke', fromRevision: firstRevision } });
  assert.deepEqual(JSON.parse(diff.content.find(item => item.type === 'text')!.text).addedNodes.map((node: { id: string }) => node.id), ['b']);
  console.log('MCP list, read, save, changes: OK');
} finally {
  await client.close();
  await rm(directory, { recursive: true, force: true });
}

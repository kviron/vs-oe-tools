import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { changesSince, listMaps, readMap, saveMap } from './store.js';

const server = new McpServer({ name: 'relationship-map', version: '0.1.0' });
const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

server.registerTool('list_maps', { description: 'List local relationship maps.', inputSchema: {} }, async () => result({ maps: await listMaps() }));
server.registerTool('read_map', {
  description: 'Read a map and its revision before proposing or saving changes.',
  inputSchema: { name: z.string().min(1) },
}, async ({ name }) => result(await readMap(name)));
server.registerTool('save_map', {
  description: 'Save a validated map. Supply the revision from read_map; use null only for a new map. Does not change code or databases.',
  inputSchema: { name: z.string().min(1), map: z.record(z.string(), z.unknown()), expectedRevision: z.string().nullable() },
}, async ({ name, map, expectedRevision }) => result(await saveMap(name, map, expectedRevision)));
server.registerTool('get_map_changes', {
  description: 'Compare current map with a prior saved revision to see user changes. This does not apply those changes to code or databases.',
  inputSchema: { name: z.string().min(1), fromRevision: z.string().regex(/^[a-f0-9]{64}$/) },
}, async ({ name, fromRevision }) => result(await changesSince(name, fromRevision)));

await server.connect(new StdioServerTransport());

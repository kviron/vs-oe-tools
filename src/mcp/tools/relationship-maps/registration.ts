import { z } from 'zod';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

/** Exposes workspace map operations through the running extension host. */
export function registerRelationshipMapTools(server: McpToolServer): void {
 const name = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/i);
 const revision = z.string().regex(/^[a-f0-9]{64}$/);
 const register = (tool: string, operation: string, description: string, inputSchema: Record<string, z.ZodTypeAny>) => {
  server.registerTool(tool, { description, inputSchema, annotations: { readOnlyHint: operation === 'list' || operation === 'read' || operation === 'changes', destructiveHint: false } }, async (input: Record<string, unknown>) => bridgeToolResult({ action: 'relationship_map', mapRequest: { ...input, operation } }));
 };
 register('list_maps', 'list', 'List persistent relationship maps in the active VS Code workspace.', {});
 register('read_map', 'read', 'Read relationship map JSON and revision before editing.', { name });
 register('save_map', 'save', 'Save relationship map JSON with revision protection. Minimal map: {schemaVersion:2,title:"Map",nodes:[],edges:[]}. Nodes require id, kind, title, x, y; edges require from, to, type. Optional node fields: description, entityRef, attributes, sourceRefs, detail. Map-local nodeKinds/edgeKinds define labels and hex colors. Use null only for a new map. Changes the map only; does not execute code or SQL.', { name, map: z.record(z.unknown()), expectedRevision: revision.nullable() });
 register('get_map_changes', 'changes', 'Compare a saved map revision with current user edits.', { name, fromRevision: revision });
 register('open_map', 'open', 'Open an editable relationship map in a separate VS Code Webview editor panel. Save a new map before opening it by name.', { name: name.optional() });
}

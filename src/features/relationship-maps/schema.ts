import { z } from 'zod';

const sourceRefSchema = z.object({ kind: z.string(), uri: z.string(), label: z.string().optional() });
const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const kindStyleSchema = z.object({ label: z.string(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), icon: z.string().optional() });

export const nodeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  x: z.number().finite(),
  y: z.number().finite(),
  status: z.string().optional(),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  symbol: z.string().optional(),
  audit: z.string().optional(),
  detail: z.boolean().optional(),
  entityRef: z.object({ system: z.string(), type: z.string(), id: z.string(), scope: z.record(z.string(), z.string()).optional() }).optional(),
  attributes: z.record(z.string(), scalarSchema).optional(),
  sourceRefs: z.array(sourceRefSchema).optional(),
}).passthrough();

export const edgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.string().default('relates'),
  label: z.string().optional(),
  attributes: z.record(z.string(), scalarSchema).optional(),
  sourceRefs: z.array(sourceRefSchema).optional(),
}).passthrough();

export const mapSchema = z.object({
  schemaVersion: z.number().int().positive().default(2),
  title: z.string().min(1),
  description: z.string().optional(),
  sourceRoot: z.string().optional(),
  edgeTypes: z.record(z.string(), z.string()).optional(),
  nodeKinds: z.record(z.string(), kindStyleSchema).optional(),
  edgeKinds: z.record(z.string(), kindStyleSchema).optional(),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
}).passthrough().superRefine((map, context) => {
  const ids = new Set<string>();
  for (const node of map.nodes) {
    if (ids.has(node.id)) {context.addIssue({ code: 'custom', message: `Повтор ID узла: ${node.id}` });}
    ids.add(node.id);
  }
  for (const edge of map.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      context.addIssue({ code: 'custom', message: `Связь ${edge.from} → ${edge.to} указывает на отсутствующий узел` });
    }
  }
});

export type RelationshipMap = z.infer<typeof mapSchema>;

import { Box, Boxes, Code2, Database, FileCode2, GitBranch, Layers3, Lightbulb, Play, Server, Shapes, StickyNote, Workflow, Zap, type LucideIcon } from 'lucide-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { RelationshipMap } from '../../server/schema';
import type { KindStyle } from './kinds';
import { Badge } from '@/components/ui/badge';

type MapNode = RelationshipMap['nodes'][number];
export type CanvasNode = Node<{ entity: MapNode; kindStyle: KindStyle }>;
const icons: Record<string, LucideIcon> = {
  box: Box, boxes: Boxes, code: Code2, database: Database, file: FileCode2,
  server: Server, workflow: Workflow, zap: Zap, 'git-branch': GitBranch,
  'sticky-note': StickyNote, play: Play, layers: Layers3, lightbulb: Lightbulb,
};

export function EntityNode({ data, selected }: NodeProps<CanvasNode>) {
  const { entity, kindStyle } = data;
  const color = entity.status === 'review' ? '#facc15' : entity.status === 'proposed' ? '#c084fc' : kindStyle.color;
  const Icon = icons[kindStyle.icon || ''] || Shapes;
  return <div className={`entity-node entity-node--${entity.kind === 'condition' ? 'condition' : 'card'}`} style={{ borderColor: color, boxShadow: selected ? `0 0 0 2px ${color}` : undefined }}>
    <Handle type="target" position={Position.Left} />
    <div className="entity-kind" style={{ color }}><Icon size={13} /> {kindStyle.label}</div>
    <div className="entity-heading"><span>{entity.title}</span>{entity.status === 'review' && <Badge variant="outline">аудит</Badge>}</div>
    {entity.description && <p>{entity.description}</p>}
    <div className="entity-meta">{entity.entityRef ? `${entity.entityRef.system} · ${entity.entityRef.type} #${entity.entityRef.id}` : entity.file ? entity.symbol || entity.file : entity.kind}</div>
    <Handle type="source" position={Position.Right} />
  </div>;
}

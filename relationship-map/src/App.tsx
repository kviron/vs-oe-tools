import { mapSchema } from '../server/schema';
import { mapFetch, requestHost, inWebview, newMapName, confirmDiscard, promptText } from './transport';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyEdgeChanges, applyNodeChanges, Background, Controls, MarkerType,
  MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type Edge,
  type EdgeChange, type NodeChange,
} from '@xyflow/react';
import { Box, Code2, Download, FilePlus2, GitBranch, Hand, Layers3, MousePointer2, Redo2, RefreshCw, Save, StickyNote, Undo2, Upload } from 'lucide-react';
import type { RelationshipMap } from '../server/schema';
import { EntityNode, type CanvasNode } from './graph/EntityNode';
import { AttributeFields } from './graph/AttributeFields';
import { edgeKindsFor, nodeKindsFor } from './graph/kinds';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type MapNode = RelationshipMap['nodes'][number];
type MapEdge = RelationshipMap['edges'][number];
const emptyMap = (): RelationshipMap => ({ schemaVersion: 2, title: 'Новая карта', nodes: [], edges: [] });

const nodeTypes = { entity: EntityNode };
function AppBody() {
  const flow = useReactFlow<CanvasNode, Edge>();
  const [tool, setTool] = useState<'select' | 'hand' | 'insert'>('select');
  const [insertKind, setInsertKind] = useState('entity');
  const [mapName, setMapName] = useState(document.querySelector<HTMLMetaElement>('meta[name=initial-map]')?.content || 'extension');
  const [names, setNames] = useState<string[]>([]);
  const [map, setMap] = useState<RelationshipMap>(emptyMap);
  const [revision, setRevision] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3500); return () => clearTimeout(timer); }, [message]);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const [showDetails, setShowDetails] = useState(false);
  const undo = useRef<RelationshipMap[]>([]);
  const redo = useRef<RelationshipMap[]>([]);
  const mapRef = useRef(map);
  mapRef.current = map;
  const remember = useCallback(() => {
    undo.current.push(structuredClone(mapRef.current));
    if (undo.current.length > 100) undo.current.shift();
    redo.current = [];
  }, []);
  const change = useCallback((next: RelationshipMap) => { mapRef.current = next; setMap(next); setDirty(true); }, []);
  const loadNames = useCallback(async () => {
    const response = await mapFetch('/api/maps');
    const data = await response.json();
    setNames(data.maps || []);
  }, []);
  const load = useCallback(async (name: string, onlyIfClean = false) => {
    const startingMap = mapRef.current;
    try {
      const response = await mapFetch(`/api/maps/${encodeURIComponent(name)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (onlyIfClean && (dirtyRef.current || mapRef.current !== startingMap)) { setMessage('Карта изменена извне; ваши правки оставлены в редакторе.'); return; }
      setMap(data.map); mapRef.current = data.map;
      setRevision(data.revision); setMapName(name); setSelectedNode(null); setSelectedEdge(null);
      undo.current = []; redo.current = []; setDirty(false); setMessage('Карта загружена');
    } catch (error) { setMessage(String(error)); }
  }, []);
  useEffect(() => { void loadNames().then(async () => { const response = await mapFetch('/api/maps'); const data = await response.json(); if (data.maps?.length) await load(data.maps.includes(mapName) ? mapName : data.maps[0]); if (inWebview) requestAnimationFrame(() => { void requestHost({ operation: 'ready' }).catch(error => setMessage(String(error))); }); }); }, [loadNames, load]);

  useEffect(() => {
    const handler = (event: MessageEvent) => { if (event.data?.type === 'mapChanged') { void loadNames(); if (event.data.name === mapName && !dirtyRef.current) void load(mapName, true); else if (event.data.name === mapName) setMessage('Карта сохранена. Для получения внешних правок нажмите «Перезагрузить»; ваши несохранённые правки сохранены в редакторе.'); } };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadNames, mapName, load]);
  const nodeKinds = useMemo(() => nodeKindsFor(map), [map]);
  const edgeKinds = useMemo(() => edgeKindsFor(map), [map]);
  const visibleIds = useMemo(() => new Set(map.nodes.filter(node => showDetails || !node.detail).map(node => node.id)), [map.nodes, showDetails]);
  const nodes = useMemo<CanvasNode[]>(() => map.nodes.filter(entity => visibleIds.has(entity.id)).map(entity => ({ id: entity.id, type: 'entity', position: { x: entity.x, y: entity.y }, data: { entity, kindStyle: nodeKinds[entity.kind] || { label: entity.kind, color: '#64748b' } } })), [map.nodes, visibleIds, nodeKinds]);
  const [canvasNodes, setCanvasNodes] = useState<CanvasNode[]>([]);
  useEffect(() => setCanvasNodes(nodes), [nodes]);
  const edges = useMemo<Edge[]>(() => map.edges.flatMap((relation, index) => !visibleIds.has(relation.from) || !visibleIds.has(relation.to) ? [] : [{
    id: String(index), source: relation.from, target: relation.to, label: relation.label,
    type: 'smoothstep', animated: relation.type === 'event',
    style: { stroke: edgeKinds[relation.type]?.color || '#94a3b8', strokeWidth: selectedEdge === index ? 3 : 2, strokeDasharray: relation.type === 'proposal' ? '6 4' : undefined },
    markerEnd: { type: MarkerType.ArrowClosed, color: edgeKinds[relation.type]?.color || '#94a3b8' },
  }]), [map.edges, selectedEdge, visibleIds, edgeKinds]);

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    setCanvasNodes(current => applyNodeChanges(changes, current));
  }, []);
  const onNodeDragStop = useCallback((_: unknown, dragged: CanvasNode) => {
    change({ ...mapRef.current, nodes: mapRef.current.nodes.map(node => node.id === dragged.id ? { ...node, x: dragged.position.x, y: dragged.position.y } : node) });
  }, [change]);
  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    const kept = new Set(applyEdgeChanges(changes, edges).map(edge => edge.id));
    const removed = edges.filter(edge => !kept.has(edge.id)).map(edge => Number(edge.id));
    if (removed.length) { remember(); change({ ...mapRef.current, edges: mapRef.current.edges.filter((_, index) => !removed.includes(index)) }); }
  }, [edges, remember, change]);
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    remember();
    const next: MapEdge = { from: connection.source, to: connection.target, type: 'relates' };
    change({ ...mapRef.current, edges: [...mapRef.current.edges, next] });
  }, [remember, change]);
  const updateNode = (field: keyof MapNode, value: unknown) => {
    if (!selectedNode) return;
    remember();
    change({ ...mapRef.current, nodes: mapRef.current.nodes.map(node => node.id === selectedNode ? { ...node, [field]: value } : node) });
  };
  const updateSourceRef = (index: number, field: 'kind' | 'uri' | 'label', value: string) => {
    if (!activeNode) return;
    const refs = [...(activeNode.sourceRefs || [])];
    refs[index] = { ...refs[index], [field]: value };
    updateNode('sourceRefs', refs);
  };
  const updateEdge = (field: keyof MapEdge, value: string) => {
    if (selectedEdge === null) return;
    remember();
    change({ ...mapRef.current, edges: mapRef.current.edges.map((edge, index) => index === selectedEdge ? { ...edge, [field]: value } : edge) });
  };
  const updateAttributes = (target: 'node' | 'edge', attributes: NonNullable<MapNode['attributes']>) => {
    if (target === 'node') updateNode('attributes', attributes);
    else { remember(); change({ ...mapRef.current, edges: mapRef.current.edges.map((edge, index) => index === selectedEdge ? { ...edge, attributes } : edge) }); }
  };
  const addKind = async (target: 'node' | 'edge') => {
    const id = (await promptText('Код типа (латиницей):'))?.trim();
    if (!id || !/^[a-z][a-z0-9_-]*$/i.test(id)) return;
    const label = (await promptText('Название типа:', id))?.trim();
    if (!label) return;
    const color = (await promptText('Цвет типа (#RRGGBB):', '#64748b'))?.trim();
    if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return;
    const field = target === 'node' ? 'nodeKinds' : 'edgeKinds';
    remember(); change({ ...mapRef.current, [field]: { ...mapRef.current[field], [id]: { label, color } } });
  };
  const addNode = (kind: string, position?: { x: number; y: number }) => {
    remember();
    const center = position || flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const node: MapNode = { id: `node-${crypto.randomUUID().slice(0, 8)}`, kind, title: kind === 'condition' ? 'Условие' : 'Новая сущность', description: '', x: center.x, y: center.y };
    change({ ...mapRef.current, nodes: [...mapRef.current.nodes, node] });
    setSelectedNode(node.id); setSelectedEdge(null);
    setTool('select');
  };
  const step = (direction: 'undo' | 'redo') => {
    const from = direction === 'undo' ? undo.current : redo.current;
    const to = direction === 'undo' ? redo.current : undo.current;
    const previous = from.pop(); if (!previous) return;
    to.push(structuredClone(mapRef.current)); change(previous);
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === 'escape' || (!event.ctrlKey && !event.altKey && key === 'v')) { setTool('select'); return; }
      if (!event.ctrlKey && !event.altKey && key === 'h') { setTool('hand'); return; }
      if (!event.ctrlKey || event.altKey) return;
      if (key === 'z' || key === 'y') { event.preventDefault(); step(key === 'y' || event.shiftKey ? 'redo' : 'undo'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  const save = async () => {
    try {
      const response = await mapFetch(`/api/maps/${encodeURIComponent(mapName)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ map, expectedRevision: revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRevision(data.revision); if (mapRef.current === map) setDirty(false); setMessage('Сохранено'); void loadNames();
    } catch (error) { setMessage(`Не сохранено: ${String(error)}`); }
  };
  const exportMap = () => {
    if (inWebview) { void requestHost({ operation: 'export', name: mapName, map }).catch(error => setMessage(String(error))); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${mapName}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const importMap = async (file?: File) => {
    if (!file) return;
    try { const input = mapSchema.parse(JSON.parse(await file.text())); remember(); change(input); setMessage('JSON загружен в редактор; сохраните карту'); }
    catch (error) { setMessage(`Неверный JSON: ${String(error)}`); }
  };
  const activeNode = map.nodes.find(node => node.id === selectedNode);
  const activeEdge = selectedEdge === null ? undefined : map.edges[selectedEdge];

  return <div className="app-shell">
    <header className="app-toolbar">
      <div className="brand"><Layers3 size={20} /><strong>Карты взаимосвязей</strong></div>
      <select className="map-picker" value={mapName} onChange={async event => { const name = event.target.value; if (dirty && !await confirmDiscard()) return; await load(name); }} aria-label="Выбрать карту">{names.map(name => <option key={name}>{name}</option>)}{!names.includes(mapName) && <option>{mapName}</option>}</select>
      <Input className="map-title" aria-label="Название карты" value={map.title} onChange={event => { remember(); change({ ...mapRef.current, title: event.target.value }); }} />
      <Button variant="outline" size="icon" title="Новая карта" onClick={async () => { if (dirty && !await confirmDiscard()) return; const name = await newMapName(); if (!name || !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(name)) return; setMapName(name); change(emptyMap()); setRevision(null); setDirty(true); undo.current = []; redo.current = []; }}><FilePlus2 /></Button>
      <span className="toolbar-divider" />
      <Button variant={showDetails ? 'secondary' : 'ghost'} size="icon" title="Дополнительные узлы" onClick={() => setShowDetails(value => !value)}><Layers3 /></Button>
      <Button variant="ghost" size="icon" title="Отменить" onClick={() => step('undo')}><Undo2 /></Button>
      <Button variant="ghost" size="icon" title="Вернуть" onClick={() => step('redo')}><Redo2 /></Button>
      <span className="toolbar-spacer" />
      <span className="save-status">{dirty ? '● Есть изменения' : 'Сохранено'}</span>
      <Button variant="ghost" size="icon" title="Перезагрузить карту" onClick={async () => { if (dirty && !await confirmDiscard()) return; await load(mapName); }}><RefreshCw /></Button>
      <Button variant="ghost" size="icon" title="Скачать JSON" onClick={exportMap}><Download /></Button>
      <label className="upload-button" title="Загрузить JSON"><Upload size={18} /><input type="file" accept=".json,application/json" onChange={event => void importMap(event.target.files?.[0])} /></label>
      <Button onClick={() => void save()}><Save /> Сохранить</Button>
    </header>
    {message && <div className="message" role="status" onClick={() => setMessage('')}>{message}</div>}
    <main className="canvas-area">
      <ReactFlow nodes={canvasNodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeDragStart={remember} onNodeDragStop={onNodeDragStop} onConnect={onConnect} onNodeClick={(_, node) => { setSelectedNode(node.id); setSelectedEdge(null); }} onEdgeClick={(_, edge) => { setSelectedNode(null); setSelectedEdge(Number(edge.id)); }} onPaneClick={event => { if (tool === 'insert') addNode(insertKind, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })); else { setSelectedNode(null); setSelectedEdge(null); } }} panOnScroll panOnScrollSpeed={0.8} zoomOnScroll={false} zoomActivationKeyCode="Control" zoomOnDoubleClick={false} panOnDrag={tool === 'hand' ? [0, 1] : [1]} nodesDraggable={tool === 'select'} fitView minZoom={0.1} maxZoom={3} deleteKeyCode={null}>
        <Background color="#334155" gap={24} /><MiniMap pannable zoomable nodeColor={node => (node.data.entity as MapNode).status === 'review' ? '#facc15' : '#64748b'} />
      </ReactFlow>
      <div className="canvas-tools" role="toolbar" aria-label="Инструменты карты">
        <Button variant={tool === 'select' ? 'default' : 'ghost'} data-active={tool === 'select'} size="icon" title="Выбор и перемещение узлов (V)" aria-label="Выбор" onClick={() => setTool('select')}><MousePointer2 /></Button>
        <Button variant={tool === 'hand' ? 'default' : 'ghost'} data-active={tool === 'hand'} size="icon" title="Рука (H): перемещать карту. Средняя кнопка мыши работает в любом режиме" aria-label="Рука" onClick={() => setTool('hand')}><Hand /></Button>
        <span className="canvas-tools-divider" />
        <Button variant={tool === 'insert' && insertKind === 'class' ? 'default' : 'ghost'} size="icon" title="Поставить класс" aria-label="Класс" onClick={() => { setInsertKind('class'); setTool('insert'); }}><Box /></Button>
        <Button variant={tool === 'insert' && insertKind === 'method' ? 'default' : 'ghost'} size="icon" title="Поставить метод" aria-label="Метод" onClick={() => { setInsertKind('method'); setTool('insert'); }}><Code2 /></Button>
        <Button variant={tool === 'insert' && insertKind === 'condition' ? 'default' : 'ghost'} size="icon" title="Поставить условие" aria-label="Условие" onClick={() => { setInsertKind('condition'); setTool('insert'); }}><GitBranch /></Button>
        <Button variant={tool === 'insert' && insertKind === 'note' ? 'default' : 'ghost'} size="icon" title="Поставить заметку" aria-label="Заметка" onClick={() => { setInsertKind('note'); setTool('insert'); }}><StickyNote /></Button>
        <select className="canvas-kind-picker" aria-label="Другой тип узла" value={tool === 'insert' ? insertKind : ''} onChange={event => { setInsertKind(event.target.value); setTool('insert'); }}><option value="">Другой тип…</option>{Object.entries(nodeKinds).map(([id, style]) => <option key={id} value={id}>{style.label}</option>)}</select>
        <Button variant="ghost" size="icon" title="Создать тип узла" aria-label="Создать тип узла" onClick={() => addKind('node')}><Layers3 /></Button>
      </div>
      {(activeNode || activeEdge) && <aside className="inspector"><Card><CardHeader><CardTitle>{activeNode ? 'Сущность' : 'Связь'}</CardTitle></CardHeader><CardContent className="inspector-content">
        {activeNode ? <>
          <label>ID<Input value={activeNode.id} readOnly /></label>
          <label>Название<Input value={activeNode.title} onChange={event => updateNode('title', event.target.value)} /></label>
          <label>Описание<Textarea value={activeNode.description} onChange={event => updateNode('description', event.target.value)} /></label>
          <label>Тип<select value={activeNode.kind} onChange={event => updateNode('kind', event.target.value)}>{!nodeKinds[activeNode.kind] && <option value={activeNode.kind}>{activeNode.kind}</option>}{Object.entries(nodeKinds).map(([id, style]) => <option key={id} value={id}>{style.label}</option>)}</select></label>
          <label><input type="checkbox" checked={!!activeNode.detail} onChange={event => updateNode('detail', event.target.checked)} /> Дополнительный узел</label>
          <label>Статус<Input value={activeNode.status || ''} onChange={event => updateNode('status', event.target.value)} placeholder="review / proposed" /></label>
          <strong>Внешняя сущность</strong>
          {(['system','type','id'] as const).map(field => <label key={field}>{field}<Input value={activeNode.entityRef?.[field] || ''} onChange={event => updateNode('entityRef', { system: '', type: '', id: '', ...activeNode.entityRef, [field]: event.target.value })} /></label>)}
          <div className="source-list"><strong>Контекст объекта</strong>{Object.entries(activeNode.entityRef?.scope || {}).map(([key, value]) => <label key={key}>{key}<Input value={value} onChange={event => updateNode('entityRef', { system: '', type: '', id: '', ...activeNode.entityRef, scope: { ...activeNode.entityRef?.scope, [key]: event.target.value } })} /><Button variant="ghost" onClick={() => { const scope = { ...activeNode.entityRef?.scope }; delete scope[key]; updateNode('entityRef', { system: '', type: '', id: '', ...activeNode.entityRef, scope }); }}>Убрать</Button></label>)}<Button variant="outline" onClick={async () => { const key = (await promptText('Имя поля контекста:'))?.trim(); if (key) updateNode('entityRef', { system: '', type: '', id: '', ...activeNode.entityRef, scope: { ...activeNode.entityRef?.scope, [key]: '' } }); }}>Добавить поле</Button></div>
          <AttributeFields attributes={activeNode.attributes} onChange={attributes => updateAttributes('node', attributes)} />
          <label>Путь к коду<Input value={activeNode.file || ''} onChange={event => updateNode('file', event.target.value)} /></label>
          {activeNode.file && map.sourceRoot && <Button variant="outline" onClick={() => { if (inWebview) { void requestHost({ operation: 'openSource', root: map.sourceRoot, file: activeNode.file, line: activeNode.line }).catch(error => setMessage(String(error))); } else { window.location.href = `vscode://file/${map.sourceRoot}/${activeNode.file}${activeNode.line ? ':' + activeNode.line : ''}`; } }}>Открыть код</Button>}
          <label>Обоснование<Textarea value={activeNode.audit || ''} onChange={event => updateNode('audit', event.target.value)} /></label>
          <div className="source-list"><strong>Источники</strong>{(activeNode.sourceRefs || []).map((ref, index) => <div className="source-item" key={index}>
            <Input aria-label="Тип источника" value={ref.kind} onChange={event => updateSourceRef(index, 'kind', event.target.value)} placeholder="code / database / url" />
            <Input aria-label="Адрес источника" value={ref.uri} onChange={event => updateSourceRef(index, 'uri', event.target.value)} placeholder="URI или URL" />
            <Input aria-label="Подпись источника" value={ref.label || ''} onChange={event => updateSourceRef(index, 'label', event.target.value)} placeholder="Подпись" />
            {/^(https?:|vscode:)/i.test(ref.uri) && <a href={ref.uri} target="_blank" rel="noopener noreferrer">Открыть источник</a>}
            <Button variant="ghost" onClick={() => updateNode('sourceRefs', (activeNode.sourceRefs || []).filter((_, item) => item !== index))}>Убрать источник</Button>
          </div>)}<Button variant="outline" onClick={() => updateNode('sourceRefs', [...(activeNode.sourceRefs || []), { kind: 'url', uri: '' }])}>Добавить источник</Button></div>
          <Button variant="destructive" onClick={() => { remember(); change({ ...mapRef.current, nodes: mapRef.current.nodes.filter(node => node.id !== activeNode.id), edges: mapRef.current.edges.filter(edge => edge.from !== activeNode.id && edge.to !== activeNode.id) }); setSelectedNode(null); }}>Удалить сущность</Button>
        </> : activeEdge && <>
          <label>Откуда<select value={activeEdge.from} onChange={event => updateEdge('from', event.target.value)}>{map.nodes.map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label>
          <label>Куда<select value={activeEdge.to} onChange={event => updateEdge('to', event.target.value)}>{map.nodes.map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label>
          <label>Тип<select value={activeEdge.type} onChange={event => updateEdge('type', event.target.value)}>{!edgeKinds[activeEdge.type] && <option value={activeEdge.type}>{activeEdge.type}</option>}{Object.entries(edgeKinds).map(([id, style]) => <option key={id} value={id}>{style.label}</option>)}</select></label>
          <Button variant="outline" onClick={() => addKind('edge')}>Добавить тип связи</Button>
          <label>Подпись<Input value={activeEdge.label || ''} onChange={event => updateEdge('label', event.target.value)} /></label>
          <AttributeFields attributes={activeEdge.attributes} onChange={attributes => updateAttributes('edge', attributes)} />
          <Button variant="destructive" onClick={() => { remember(); change({ ...mapRef.current, edges: mapRef.current.edges.filter((_, index) => index !== selectedEdge) }); setSelectedEdge(null); }}>Удалить связь</Button>
        </>}
      </CardContent></Card></aside>}
    </main>
  </div>;
}

export default function App() { return <ReactFlowProvider><AppBody /></ReactFlowProvider>; }

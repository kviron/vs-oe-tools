import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mapSchema, type RelationshipMap } from './schema';

export function createMapStore(mapDirectory: string) {
const slug = (name: string) => {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(name)) {throw new Error('Имя карты: только буквы, цифры, _ и -');}
  return name;
};
const mapPath = (name: string) => path.join(mapDirectory, `${slug(name)}.json`);
const revisionOf = (raw: string) => createHash('sha256').update(raw).digest('hex');
async function withMapLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  const folder = path.join(mapDirectory, '.locks');
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, `${slug(name)}.lock`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { handle = await open(file, 'wx'); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {throw error;}
      const age = Date.now() - (await stat(file).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs;
      if (age > 30_000) {await unlink(file).catch(() => undefined);}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  if (!handle) {throw new Error('Карта занята другим процессом; повторите сохранение');}
  try { return await action(); }
  finally { await handle.close(); await unlink(file); }
}

async function listMaps(): Promise<string[]> {
  await mkdir(mapDirectory, { recursive: true });
  return (await readdir(mapDirectory)).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)).sort();
}

async function readMap(name: string): Promise<{ map: RelationshipMap; revision: string }> {
  const raw = await readFile(mapPath(name), 'utf8');
  return { map: mapSchema.parse(JSON.parse(raw)), revision: revisionOf(raw) };
}

async function saveMap(name: string, input: unknown, expectedRevision: string | null): Promise<{ revision: string }> {
  const file = mapPath(name);
  const map = mapSchema.parse(input);
  await mkdir(mapDirectory, { recursive: true });
  return withMapLock(name, async () => {
  let previous: string | undefined;
  try { previous = await readFile(file, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {throw error;} }
  const currentRevision = previous ? revisionOf(previous) : null;
  if (currentRevision !== expectedRevision) {throw new Error(`Карта изменилась: текущая ревизия ${currentRevision ?? 'отсутствует'}`);}
  if (previous) {
    const history = path.join(mapDirectory, '.history', slug(name));
    await mkdir(history, { recursive: true });
    await writeFile(path.join(history, `${currentRevision}.json`), previous, { flag: 'wx' }).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {throw error;}
    });
  }
  const raw = JSON.stringify(map, null, 2) + '\n';
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, raw, { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {throw error;}
    });
  }
  return { revision: revisionOf(raw) };
  });
}

async function changesSince(name: string, revision: string) {
  if (!/^[a-f0-9]{64}$/.test(revision)) {throw new Error('Неверная ревизия');}
  const current = await readMap(name);
  if (current.revision === revision) {return { fromRevision: revision, toRevision: revision, addedNodes: [], removedNodes: [], changedNodes: [], addedEdges: [], removedEdges: [], changedMapFields: {} };}
  const raw = await readFile(path.join(mapDirectory, '.history', slug(name), `${revision}.json`), 'utf8');
  const before = mapSchema.parse(JSON.parse(raw));
  const oldNodes = new Map(before.nodes.map(node => [node.id, node]));
  const newNodes = new Map(current.map.nodes.map(node => [node.id, node]));
  const edgeKey = (edge: RelationshipMap['edges'][number]) => JSON.stringify(edge);
  const mapFields = new Set([...Object.keys(before), ...Object.keys(current.map)]);
  const changedMapFields = Object.fromEntries([...mapFields].filter(key => key !== 'nodes' && key !== 'edges'
    && JSON.stringify(before[key]) !== JSON.stringify(current.map[key])).map(key => [key, { before: before[key] ?? null, after: current.map[key] ?? null }]));
  const oldEdges = new Set(before.edges.map(edgeKey));
  const newEdges = new Set(current.map.edges.map(edgeKey));
  return {
    fromRevision: revision, toRevision: current.revision, changedMapFields,
    addedNodes: current.map.nodes.filter(node => !oldNodes.has(node.id)),
    removedNodes: before.nodes.filter(node => !newNodes.has(node.id)),
    changedNodes: current.map.nodes.filter(node => oldNodes.has(node.id) && JSON.stringify(oldNodes.get(node.id)) !== JSON.stringify(node)),
    addedEdges: current.map.edges.filter(edge => !oldEdges.has(edgeKey(edge))),
    removedEdges: before.edges.filter(edge => !newEdges.has(edgeKey(edge))),
  };
}

return { listMaps, readMap, saveMap, changesSince };
}

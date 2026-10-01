import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changesSince, listMaps, readMap, saveMap } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const port = Number(process.env.RELATIONSHIP_MAP_PORT || 4178);
const send = (response: import('node:http').ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
};
const body = async (request: import('node:http').IncomingMessage) => {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 5_000_000) throw new Error('JSON карты превышает 5 МБ');
  }
  return JSON.parse(raw);
};
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/maps' && request.method === 'GET') return send(response, 200, { maps: await listMaps() });
    const match = /^\/api\/maps\/([a-z0-9_-]+)(?:\/changes)?$/i.exec(url.pathname);
    if (match) {
      const name = match[1];
      if (url.pathname.endsWith('/changes') && request.method === 'GET') return send(response, 200, await changesSince(name, url.searchParams.get('from') || ''));
      if (request.method === 'GET') return send(response, 200, await readMap(name));
      if (request.method === 'PUT') {
        const input = await body(request);
        return send(response, 200, await saveMap(name, input.map, input.expectedRevision ?? null));
      }
    }
    if (url.pathname.startsWith('/api/')) return send(response, 404, { error: 'Неизвестный API путь' });
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(webRoot, relative);
    if (!file.startsWith(webRoot + path.sep) && file !== path.join(webRoot, 'index.html')) return send(response, 403, { error: 'Запрещённый путь' });
    const contents = await readFile(file);
    response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    response.end(contents);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    send(response, code === 'ENOENT' ? 404 : 400, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(port, '127.0.0.1', () => console.log(`Relationship Map: http://127.0.0.1:${port}`));

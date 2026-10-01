// Refresh tool links from domain catalogs, preserving user layout and annotations.
const fs = require('node:fs');
const path = require('node:path');
const folder = __dirname;
const mapPath = path.join(folder, 'map.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const root = path.join(folder, '../../src/mcp/tools');
const source = fs.readFileSync(path.join(root, 'registration.ts'), 'utf8');
const domains = [...source.matchAll(/from '\.\/([^/]+)\/registration'/g)].map(match => match[1]);
const tools = domains.flatMap(domain => {
  const catalog = fs.readFileSync(path.join(root, domain, 'registration.ts'), 'utf8');
  const imports = new Map([...catalog.matchAll(/import \{ registerTool as (\w+) \} from '\.\/([^']+)'/g)].map(match => [match[1], match[2]]));
  return [...catalog.matchAll(/\[(\d+), (\w+)\]/g)].map(([, order, name]) => ({
    name, domain, order: Number(order), file: 'src/mcp/tools/' + domain + '/' + imports.get(name) + '.ts',
  }));
}).sort((a, b) => a.order - b.order);
if (!tools.length) throw new Error('No domain tools found; map left unchanged');
const ids = new Set(tools.map(tool => 'tool-' + tool.name));
map.nodes = map.nodes.filter(node => !node.id.startsWith('tool-') || ids.has(node.id));
map.edges = map.edges.filter(edge => (!edge.to.startsWith('tool-') || ids.has(edge.to)) && (!edge.from.startsWith('tool-') || ids.has(edge.from)));
tools.forEach((tool, index) => {
  const id = 'tool-' + tool.name;
  let node = map.nodes.find(node => node.id === id);
  if (!node) {
    node = { id, kind: 'service', title: tool.name,
      description: 'MCP инструмент · ' + tool.domain + '. Откройте файл для контракта и обработчика.',
      x: 2090 + Math.floor(index / 18) * 290, y: 30 + index % 18 * 120 };
    map.nodes.push(node);
  }
  Object.assign(node, {file: tool.file, symbol: 'registerTool', detail: true});
  const owner = map.nodes.some(item => item.id === 'tools-' + tool.domain) ? 'tools-' + tool.domain : 'tools';
  const edge = map.edges.find(item => item.to === id && (item.from === 'tools' || item.from.startsWith('tools-')));
  if (edge) { edge.from = owner; }
  else { map.edges.push({from: owner, to: id, type: 'uses'}); }
});
fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n');
fs.writeFileSync(path.join(folder, 'map-data.js'), 'window.ARCHITECTURE_MAP = ' + JSON.stringify(map) + ';\n');
console.log('Synced ' + tools.length + ' MCP tools across ' + domains.length + ' domains');

(() => {
  'use strict';
  let map = structuredClone(window.ARCHITECTURE_MAP);
  let selected = [];
  let selectedEdge = -1;
  const undoStack = [];
  const redoStack = [];
  let editSession = '';
  const snapshot = () => ({map: structuredClone(map), selected: [...selected], selectedEdge});
  function remember(group = '') {
    if (group && group === editSession) return;
    undoStack.push(snapshot());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    editSession = group;
  }
  function restore(state) {
    map = state.map;
    selected = state.selected;
    selectedEdge = state.selectedEdge;
    editSession = '';
    draw();
    showForm();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
  }
  window.addEventListener('keydown', event => {
    if (!event.ctrlKey || event.altKey || event.target.id === 'mapSearch') return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    event.preventDefault();
    if (event.shiftKey || key === 'y') redo(); else undo();
  });
  window.addEventListener('focusout', () => { editSession = ''; });
  let showTools = false;
  let search = '';
  const board = document.getElementById('board');
  const viewport = board.closest('.viewport');
  const surface = document.getElementById('surface');
  let zoom = 1;
  function setZoom(next, clientX = viewport.getBoundingClientRect().left + viewport.clientWidth / 2, clientY = viewport.getBoundingClientRect().top + viewport.clientHeight / 2) {
    const rect = viewport.getBoundingClientRect();
    const offsetX = clientX - rect.left, offsetY = clientY - rect.top;
    const mapX = (viewport.scrollLeft + offsetX) / zoom;
    const mapY = (viewport.scrollTop + offsetY) / zoom;
    zoom = Math.max(0.3, Math.min(2, next));
    surface.style.width = `${3300 * zoom}px`;
    surface.style.height = `${2400 * zoom}px`;
    board.style.transformOrigin = 'top left';
    board.style.transform = `scale(${zoom})`;
    viewport.scrollLeft = mapX * zoom - offsetX;
    viewport.scrollTop = mapY * zoom - offsetY;
    document.getElementById('zoomValue').textContent = `${Math.round(zoom * 100)}%`;
  }
  viewport.addEventListener('wheel', event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), event.clientX, event.clientY);
  }, {passive: false});
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 1) return;
    event.preventDefault();
    const startX = event.clientX, startY = event.clientY;
    const scrollLeft = viewport.scrollLeft, scrollTop = viewport.scrollTop;
    viewport.style.cursor = 'grabbing';
    const move = current => {
      viewport.scrollLeft = scrollLeft - (current.clientX - startX);
      viewport.scrollTop = scrollTop - (current.clientY - startY);
    };
    const stop = () => {
      viewport.style.cursor = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  });
  viewport.addEventListener('auxclick', event => {
    if (event.button === 1) event.preventDefault();
  });
  document.getElementById('zoomIn').onclick = () => setZoom(zoom * 1.2);
  document.getElementById('zoomOut').onclick = () => setZoom(zoom / 1.2);
  document.getElementById('zoomReset').onclick = () => setZoom(1);
  const nodeLayer = document.getElementById('nodes');
  const edgeLayer = document.getElementById('edges');
  const sidebar = document.getElementById('sidebar');
  const edgeForm = document.createElement('div');
  edgeForm.id = 'edgeForm';
  edgeForm.hidden = true;
  edgeForm.innerHTML = '<label>Откуда<select id="edgeFrom"></select></label><label>Куда<select id="edgeTo"></select></label><label>Тип связи<select id="edgeType"><option value="calls">Вызывает</option><option value="uses">Использует</option><option value="event">Событие</option><option value="process">Процесс</option><option value="proposal">Предложение</option></select></label><label>Подпись<input id="edgeLabel"></label><button id="deleteEdge">Удалить связь</button>';
  sidebar.append(edgeForm);
  const fields = ['title','description','kind','status','file','symbol','line','audit'];
  const byId = id => map.nodes.find(node => node.id === id);
  const visible = node => showTools || !node.id.startsWith('tool-');
  const edgeColor = {calls:'#64748b',uses:'#60a5fa',event:'#34d399',process:'#f59e0b',proposal:'#c084fc'};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function codeUrl(node) {
    if (!node.file) return '';
    const path = `${map.sourceRoot.replace(/\/$/,'')}/${node.file.replace(/^\//,'')}`;
    return `vscode://file/${path.replaceAll('\\','/').split('/').map((part, index) => index === 0 ? part : encodeURIComponent(part)).join('/')}${node.line ? ':' + node.line : ''}`;
  }
  function drawEdges() {
    edgeLayer.innerHTML = map.edges.map((edge, index) => {
      const a = byId(edge.from), b = byId(edge.to);
      if (!a || !b || !visible(a) || !visible(b)) return '';
      const x1 = a.x + 255, y1 = a.y + 52, x2 = b.x, y2 = b.y + 52;
      const mid = (x1 + x2) / 2;
      const curve = `M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}`;
      const color = selectedEdge === index ? '#facc15' : edgeColor[edge.type] || edgeColor.calls;
      return `<path d="${curve}" fill="none" stroke="${color}" stroke-width="${selectedEdge === index ? 4 : 2}" ${edge.type === 'proposal' ? 'stroke-dasharray="7 5"' : ''}/><path class="edge-hit" data-index="${index}" d="${curve}" fill="none" stroke="transparent" stroke-width="18" style="pointer-events:stroke;cursor:pointer"/><circle cx="${x2}" cy="${y2}" r="4" fill="${color}"/>${edge.label ? `<text x="${mid}" y="${(y1+y2)/2-5}" fill="#ddd" font-size="12">${esc(edge.label)}</text>` : ''}`;
    }).join('');
    edgeLayer.querySelectorAll('.edge-hit').forEach(path => path.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.stopPropagation();
      selected = [];
      selectedEdge = Number(path.dataset.index);
      draw();
      showForm();
    }));
  }
  function draw() {
    nodeLayer.innerHTML = '';
    for (const node of map.nodes) {
      if (!visible(node)) continue;
      const el = document.createElement('article');
      el.className = `node ${esc(node.kind)} ${node.status === 'review' ? 'review' : ''} ${selected.includes(node.id) ? 'selected' : ''}`;
      if (search && `${node.title} ${node.description} ${node.file || ''}`.toLocaleLowerCase('ru').includes(search)) el.style.outline = '3px solid #f472b6';
      el.style.left = `${node.x}px`; el.style.top = `${node.y}px`;
      el.innerHTML = `<div class="title">${node.file ? `<a href="${esc(codeUrl(node))}" title="${esc(node.file)}">${esc(node.title)}</a>` : esc(node.title)}${node.status === 'review' ? '<span class="badge">● аудит</span>' : ''}</div><div class="desc">${esc(node.description)}</div>${node.file ? `<a class="code" href="${esc(codeUrl(node))}" title="${esc(node.file)}">${esc(node.symbol || node.file)}</a>` : ''}`;
      el.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        if (event.target.closest('a')) return;
        selectedEdge = -1;
        if (event.ctrlKey) selected = selected.includes(node.id) ? selected.filter(id => id !== node.id) : [...selected, node.id].slice(-2);
        else selected = [node.id];
        showForm(); draw();
        const startX = event.clientX, startY = event.clientY, x = node.x, y = node.y;
        let moved = false;
        const move = e => {
          const nextX = Math.max(0, Math.round(x + (e.clientX - startX) / zoom));
          const nextY = Math.max(0, Math.round(y + (e.clientY - startY) / zoom));
          if (nextX === node.x && nextY === node.y) return;
          if (!moved) { remember(); moved = true; }
          node.x = nextX; node.y = nextY;
          drawEdges();
          const current = [...nodeLayer.children].find(c => c.dataset.id === node.id);
          if (current) { current.style.left = `${node.x}px`; current.style.top = `${node.y}px`; }
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, {once:true});
      });
      el.dataset.id = node.id;
      nodeLayer.append(el);
    }
    drawEdges();
  }
  function showForm() {
    const node = byId(selected.at(-1));
    const edge = map.edges[selectedEdge];
    sidebar.hidden = !node && !edge;
    sidebar.querySelector('h2').textContent = edge ? 'Свойства связи' : 'Свойства узла';
    document.getElementById('empty').hidden = !!node || !!edge;
    document.getElementById('form').hidden = !node;
    edgeForm.hidden = !edge;
    if (node) for (const key of fields) document.getElementById(key).value = node[key] ?? '';
    if (edge) {
      for (const key of ['From', 'To']) {
        const select = document.getElementById(`edge${key}`);
        select.innerHTML = map.nodes.map(item => `<option value="${esc(item.id)}">${esc(item.title)}</option>`).join('');
        select.value = edge[key.toLowerCase()];
      }
      document.getElementById('edgeLabel').value = edge.label ?? '';
      document.getElementById('edgeType').value = edge.type ?? 'calls';
    }
  }
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.node')) return;
    selected = [];
    selectedEdge = -1;
    draw();
    showForm();
  });
  for (const [field, property] of [['edgeFrom','from'],['edgeTo','to'],['edgeType','type'],['edgeLabel','label']]) {
    document.getElementById(field).addEventListener('input', event => {
      const edge = map.edges[selectedEdge];
      if (!edge) return;
      if (edge[property] === event.target.value) return;
      remember(`edge:${selectedEdge}:${field}`);
      edge[property] = event.target.value;
      drawEdges();
    });
  }
  document.getElementById('deleteEdge').onclick = () => {
    if (selectedEdge < 0) return;
    remember();
    map.edges.splice(selectedEdge, 1);
    selectedEdge = -1;
    drawEdges();
    showForm();
  };
  for (const key of fields) document.getElementById(key).addEventListener('input', event => {
    const node = byId(selected.at(-1)); if (!node) return;
    const value = event.target.value;
    if (String(node[key] ?? '') === value) return;
    remember(`node:${node.id}:${key}`);
    if (key === 'line') { if (value) node.line = Number(value); else delete node.line; }
    else if (value) node[key] = value; else delete node[key];
    draw();
  });
  function add(kind) {
    const id = `draft-${Date.now()}`;
    remember();
    map.nodes.push({id,kind,title:kind === 'condition' ? 'Новое условие' : 'Новый узел',description:'Опишите назначение.',x:100+Math.round(viewport.scrollLeft / zoom),y:100+Math.round(viewport.scrollTop / zoom)});
    selected = [id]; selectedEdge = -1; draw(); showForm(); document.getElementById('title').focus();
  }
  document.getElementById('add').onclick = () => add('feature');
  document.getElementById('addCondition').onclick = () => add('condition');
  document.getElementById('showTools').onchange = event => {
    showTools = event.target.checked;
    if (!showTools && selected.some(id => id.startsWith('tool-'))) { selected = []; showForm(); }
    draw();
  };
  document.getElementById('searchToggle').onclick = () => {
    const input = document.getElementById('mapSearch');
    input.hidden = !input.hidden;
    if (input.hidden) { input.value = ''; search = ''; draw(); }
    else input.focus();
  };
  document.getElementById('mapSearch').oninput = event => { search = event.target.value.trim().toLocaleLowerCase('ru'); draw(); };
  document.getElementById('mapSearch').onkeydown = event => {
    if (event.key !== 'Enter' || !search) return;
    const node = map.nodes.find(item => visible(item) && `${item.title} ${item.description} ${item.file || ''}`.toLocaleLowerCase('ru').includes(search));
    if (node) { viewport.scrollLeft = node.x * zoom - 80; viewport.scrollTop = node.y * zoom - 80; }
  };
  document.getElementById('connect').onclick = () => { if (selected.length !== 2) return alert('Выберите два узла через Ctrl+клик.'); const label = prompt('Подпись связи (можно пустую):'); if (label === null) return; remember(); map.edges.push({from:selected[0],to:selected[1],type:'calls',...(label ? {label} : {})}); drawEdges(); };
  document.getElementById('remove').onclick = () => { if (selectedEdge >= 0) { document.getElementById('deleteEdge').click(); return; } if (!selected.length) return; remember(); map.nodes = map.nodes.filter(n => !selected.includes(n.id)); map.edges = map.edges.filter(e => !selected.includes(e.from) && !selected.includes(e.to)); selected = []; draw(); showForm(); };
  document.getElementById('open').onclick = () => { const url = codeUrl(byId(selected.at(-1)) || {}); if (url) location.href = url; };
  document.getElementById('export').onclick = () => { const blob = new Blob([JSON.stringify(map,null,2)+'\n'],{type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'map.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href),1000); };
  document.getElementById('import').onchange = async event => { const file = event.target.files[0]; if (!file) return; try { const next = JSON.parse(await file.text()); if (!Array.isArray(next.nodes) || !Array.isArray(next.edges)) throw Error('Нужны массивы nodes и edges'); remember(); map = next; selected = []; selectedEdge = -1; draw(); showForm(); } catch(error) { alert(`Ошибка JSON: ${error.message}`); } };
  draw();
})();

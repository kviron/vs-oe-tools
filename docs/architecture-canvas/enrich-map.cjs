// Idempotently add audited architecture context to the editable map.
const fs = require('node:fs');
const path = require('node:path');
const dir = __dirname;
const mapPath = path.join(dir, 'map.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
map.schemaVersion = 2;
map.edgeTypes = {
  calls: 'вызывает',
  uses: 'использует',
  event: 'реагирует на событие',
  process: 'запускает процесс',
  proposal: 'предлагается',
};
const nodes = [
  {
    "id": "project",
    "kind": "feature",
    "title": "Проект",
    "description": "Регистрирует команды проекта и status bar; контроллер кодировки владеет настройками и подавлением повторных событий.",
    "x": 1010,
    "y": 35,
    "file": "src/features/project/register.ts",
    "symbol": "registerProject",
    "line": 18
  },
  {
    "id": "tools",
    "kind": "service",
    "title": "Каталог MCP инструментов",
    "description": "Собирает 11 каталогов областей. Стабильные позиции сохраняют прежнюю последовательность публичных MCP-инструментов.",
    "x": 1690,
    "y": 1060,
    "file": "src/mcp/tools/registration.ts",
    "symbol": "registerTools",
    "line": 30
  },
  {
    "id": "settings",
    "kind": "feature",
    "title": "Панель настроек",
    "description": "UI получает SettingsProjectActions и SettingsServices; создание сервисов и регистрация команд принадлежат registerSettings.",
    "x": 1360,
    "y": 35,
    "file": "src/features/settings/settingsViewProvider.ts",
    "symbol": "SettingsViewProvider",
    "line": 17
  },
  {
    "id": "databaseChange",
    "kind": "stage",
    "title": "Смена активной БД",
    "description": "Публикует выбор БД и последовательно вызывает обработчики областей. Порядок задаётся в registerWorkspace.",
    "x": 1360,
    "y": 610,
    "file": "src/application/databaseChange.ts",
    "symbol": "createDatabaseChangeHandler",
    "line": 13
  },
  {
    "id": "lifecycle",
    "kind": "stage",
    "title": "События VS Code",
    "description": "Слушает настройки, папки и фокус окна.",
    "x": 1360,
    "y": 755,
    "file": "src/application/lifecycle.ts",
    "line": 11,
    "symbol": "registerLifecycle"
  },
  {
    "id": "workHistory",
    "kind": "service",
    "title": "История работы SQLite",
    "description": "Хранит задачи, события и аудит вызовов MCP.",
    "x": 1690,
    "y": 755,
    "file": "src/mcp/workHistory/store.ts",
    "line": 34,
    "symbol": "WorkHistoryStore"
  },
  {
    "id": "federated",
    "kind": "service",
    "title": "Федеративные MCP инструменты",
    "description": "Добавляет инструменты внешних каталогов к локальному серверу.",
    "x": 1690,
    "y": 900,
    "file": "src/mcp/gateway/federatedTools.ts",
    "line": 60,
    "symbol": "registerFederatedTools"
  },
  {
    "id": "workHistoryTools",
    "kind": "service",
    "title": "MCP инструменты истории",
    "description": "Регистрируются отдельно от списка локальных инструментов.",
    "x": 1690,
    "y": 1180,
    "file": "src/mcp/workHistory/tools.ts",
    "line": 24,
    "symbol": "registerWorkHistoryTools"
  },
  {
    "id": "proposalDomainPorts",
    "kind": "service",
    "title": "Контракты настроек",
    "description": "Реализовано: SettingsProjectActions и SettingsServices задают операции для UI.",
    "x": 1690,
    "y": 35,
    "file": "src/features/settings/contracts.ts",
    "symbol": "SettingsProjectActions",
    "line": 6
  },
  {
    "id": "proposalDatabaseEvents",
    "kind": "stage",
    "title": "Порядок реакций областей",
    "description": "Реализовано: классы → пакеты → SPU → проводник → синхронизация пакетов.",
    "x": 1690,
    "y": 470,
    "file": "src/application/workspace.ts",
    "symbol": "registerWorkspace",
    "line": 15
  },
  {
    "id": "proposalMcpGroups",
    "kind": "service",
    "title": "Позиции инструментов MCP",
    "description": "Реализовано: каталоги областей содержат пары [позиция, регистрация]. Порядок закреплён тестом совместимости.",
    "x": 1690,
    "y": 1320,
    "file": "src/mcp/tools/registrationTypes.ts",
    "symbol": "OrderedToolRegistration",
    "line": 6
  },
  {
    "id": "settingsRegistration",
    "kind": "feature",
    "title": "registerSettings",
    "description": "Владеет созданием UI, HTTP/MCP сервисов, командами настроек и освобождением провайдера.",
    "x": 1010,
    "y": -145,
    "file": "src/features/settings/register.ts",
    "symbol": "registerSettings",
    "line": 20
  },
  {
    "id": "encodingController",
    "kind": "service",
    "title": "Контроллер кодировки",
    "description": "Начальная кодировка, переключение пользователем и реакция на изменение конфигурации.",
    "x": 1360,
    "y": -145,
    "file": "src/features/project/projectEncodingController.ts",
    "symbol": "createProjectEncodingController",
    "line": 6
  },
  {
    "id": "classesDatabaseChange",
    "kind": "service",
    "title": "Смена БД: панели классов",
    "description": "Область классов закрывает все принадлежащие ей панели.",
    "x": 1690,
    "y": 610,
    "file": "src/features/classes/databaseChange.ts",
    "symbol": "onClassesDatabaseChanged",
    "line": 9
  },
  {
    "id": "tools-database",
    "kind": "service",
    "title": "MCP · database",
    "description": "Каталог инструментов области; содержит стабильные позиции регистрации.",
    "x": 2010,
    "y": -1050,
    "file": "src/mcp/tools/database/registration.ts",
    "symbol": "databaseToolRegistrations",
    "detail": true,
    "line": 11
  },
  {
    "id": "tools-packages",
    "kind": "service",
    "title": "MCP · packages",
    "description": "Каталог инструментов области; содержит стабильные позиции регистрации.",
    "x": 2010,
    "y": -895,
    "file": "src/mcp/tools/packages/registration.ts",
    "symbol": "packagesToolRegistrations",
    "detail": true,
    "line": 8
  },
  {
    "id": "tools-classes",
    "kind": "service",
    "title": "MCP · classes",
    "description": "Каталог инструментов области; содержит стабильные позиции регистрации.",
    "x": 2010,
    "y": -740,
    "file": "src/mcp/tools/classes/registration.ts",
    "symbol": "classesToolRegistrations",
    "detail": true,
    "line": 14
  },
  {
    "id": "tools-methods",
    "kind": "service",
    "title": "MCP · methods",
    "description": "Каталог инструментов области; содержит стабильные позиции регистрации.",
    "x": 2010,
    "y": -585,
    "file": "src/mcp/tools/methods/registration.ts",
    "symbol": "methodsToolRegistrations",
    "detail": true,
    "line": 12
  },
  {
    "id": "tools-sources",
    "kind": "service",
    "title": "MCP · sources",
    "description": "Каталог инструментов области; содержит стабильные позиции регистрации.",
    "x": 2010,
    "y": -430,
    "file": "src/mcp/tools/sources/registration.ts",
    "symbol": "sourcesToolRegistrations",
    "detail": true,
    "line": 9
  },
  {
    "id": "tools-lifecycle",
    "kind": "service",
    "title": "MCP · lifecycle",
    "description": "Каталог инструментов области; содержит стабильные позиции регистрации.",
    "x": 2010,
    "y": -275,
    "file": "src/mcp/tools/lifecycle/registration.ts",
    "symbol": "lifecycleToolRegistrations",
    "detail": true,
    "line": 6
  },
  {
    "id": "tools-project",
    "kind": "service",
    "title": "MCP · project",
    "description": "Каталог инструментов области; содержит стабильные позиции регистрации.",
    "x": 2350,
    "y": -1050,
    "file": "src/mcp/tools/project/registration.ts",
    "symbol": "projectToolRegistrations",
    "detail": true,
    "line": 10
  },
  {
    "id": "tools-client",
    "kind": "service",
    "title": "MCP · client",
    "description": "Каталог инструментов области; содержит стабильные позиции регистрации.",
    "x": 2350,
    "y": -895,
    "file": "src/mcp/tools/client/registration.ts",
    "symbol": "clientToolRegistrations",
    "detail": true,
    "line": 13
  },
  {
    "id": "tools-navigation",
    "kind": "service",
    "title": "MCP · navigation",
    "description": "Каталог инструментов области; содержит стабильные позиции регистрации.",
    "x": 2350,
    "y": -740,
    "file": "src/mcp/tools/navigation/registration.ts",
    "symbol": "navigationToolRegistrations",
    "detail": true,
    "line": 8
  },
  {
    "id": "tools-diagnostics",
    "kind": "service",
    "title": "MCP · diagnostics",
    "description": "Каталог инструментов области; содержит стабильные позиции регистрации.",
    "x": 2350,
    "y": -585,
    "file": "src/mcp/tools/diagnostics/registration.ts",
    "symbol": "diagnosticsToolRegistrations",
    "detail": true,
    "line": 7
  },
  {
    "id": "tools-http",
    "kind": "service",
    "title": "MCP · http",
    "description": "Каталог инструментов области; содержит стабильные позиции регистрации.",
    "x": 2350,
    "y": -430,
    "file": "src/mcp/tools/http/registration.ts",
    "symbol": "httpToolRegistrations",
    "detail": true,
    "line": 9
  }
];
for (const node of nodes) if (!map.nodes.some(existing => existing.id === node.id)) map.nodes.push(node);
const edges = [
  [
    "entry",
    "app",
    "calls"
  ],
  [
    "app",
    "bootstrap",
    "calls"
  ],
  [
    "features",
    "project",
    "calls"
  ],
  [
    "features",
    "classes",
    "calls"
  ],
  [
    "features",
    "explorer",
    "calls"
  ],
  [
    "features",
    "tasks",
    "calls"
  ],
  [
    "features",
    "history",
    "calls"
  ],
  [
    "workbench",
    "package",
    "calls"
  ],
  [
    "workbench",
    "sql",
    "calls"
  ],
  [
    "navigation",
    "bridge",
    "calls"
  ],
  [
    "mcp",
    "mcpProvider",
    "calls"
  ],
  [
    "mcpProvider",
    "mcpServer",
    "process"
  ],
  [
    "mcpServer",
    "tools",
    "calls"
  ],
  [
    "workspace",
    "databaseChange",
    "calls"
  ],
  [
    "workspace",
    "lifecycle",
    "calls"
  ],
  [
    "lifecycle",
    "databaseChange",
    "event"
  ],
  [
    "databaseChange",
    "explorer",
    "event"
  ],
  [
    "databaseChange",
    "package",
    "event"
  ],
  [
    "mcpServer",
    "workHistory",
    "uses"
  ],
  [
    "mcpServer",
    "federated",
    "calls"
  ],
  [
    "tools",
    "workHistoryTools",
    "calls"
  ],
  [
    "settings",
    "proposalDomainPorts",
    "uses"
  ],
  [
    "databaseChange",
    "proposalDatabaseEvents",
    "uses"
  ],
  [
    "tools",
    "proposalMcpGroups",
    "uses"
  ],
  [
    "features",
    "settingsRegistration",
    "calls"
  ],
  [
    "settingsRegistration",
    "settings",
    "uses"
  ],
  [
    "project",
    "encodingController",
    "calls"
  ],
  [
    "settingsRegistration",
    "project",
    "uses"
  ],
  [
    "proposalDatabaseEvents",
    "classesDatabaseChange",
    "uses"
  ],
  [
    "app",
    "editors",
    "calls"
  ],
  [
    "app",
    "features",
    "calls"
  ],
  [
    "app",
    "navigation",
    "calls"
  ],
  [
    "app",
    "mcp",
    "calls"
  ],
  [
    "app",
    "workbench",
    "calls"
  ],
  [
    "app",
    "workspace",
    "calls"
  ],
  [
    "tools",
    "tools-database",
    "uses"
  ],
  [
    "tools",
    "tools-packages",
    "uses"
  ],
  [
    "tools",
    "tools-classes",
    "uses"
  ],
  [
    "tools",
    "tools-methods",
    "uses"
  ],
  [
    "tools",
    "tools-sources",
    "uses"
  ],
  [
    "tools",
    "tools-lifecycle",
    "uses"
  ],
  [
    "tools",
    "tools-project",
    "uses"
  ],
  [
    "tools",
    "tools-client",
    "uses"
  ],
  [
    "tools",
    "tools-navigation",
    "uses"
  ],
  [
    "tools",
    "tools-diagnostics",
    "uses"
  ],
  [
    "tools",
    "tools-http",
    "uses"
  ]
];
for (const [from,to,type] of edges) if (!map.edges.some(edge => edge.from === from && edge.to === to)) map.edges.push({from,to,type});
for (const edge of map.edges) {
  if (!edge.type) edge.type = edge.to.startsWith('tool-') ? 'uses' : edge.from === 'mcpProvider' ? 'process' : 'calls';
}
fs.writeFileSync(mapPath, JSON.stringify(map,null,2)+'\n');
fs.writeFileSync(path.join(dir,'map-data.js'),`window.ARCHITECTURE_MAP = ${JSON.stringify(map)};\n`);
console.log(`Enriched map: ${map.nodes.length} nodes, ${map.edges.length} edges`);

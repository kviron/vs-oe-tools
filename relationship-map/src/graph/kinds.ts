import type { RelationshipMap } from '../../server/schema';

export type KindStyle = { label: string; color: string; icon?: string };
export const builtInNodeKinds: Record<string, KindStyle> = {
  entity: { label: 'Сущность', color: '#64748b', icon: 'box' },
  class: { label: 'Класс', color: '#38bdf8', icon: 'boxes' },
  method: { label: 'Метод', color: '#a78bfa', icon: 'code' },
  module: { label: 'Модуль', color: '#818cf8', icon: 'file' },
  'database-table': { label: 'Таблица БД', color: '#34d399', icon: 'database' },
  service: { label: 'Сервис', color: '#60a5fa', icon: 'server' },
  process: { label: 'Процесс', color: '#f59e0b', icon: 'workflow' },
  event: { label: 'Событие', color: '#fb7185', icon: 'zap' },
  condition: { label: 'Условие', color: '#c084fc', icon: 'git-branch' },
  note: { label: 'Заметка', color: '#facc15', icon: 'sticky-note' },
  entry: { label: 'Точка входа', color: '#34d399', icon: 'play' },
  stage: { label: 'Этап', color: '#60a5fa', icon: 'layers' },
  feature: { label: 'Область', color: '#94a3b8', icon: 'box' },
  proposal: { label: 'Предложение', color: '#c084fc', icon: 'lightbulb' },
};

export const builtInEdgeKinds: Record<string, KindStyle> = {
  relates: { label: 'Связан с', color: '#94a3b8' },
  contains: { label: 'Содержит', color: '#38bdf8' },
  calls: { label: 'Вызывает', color: '#a78bfa' },
  inherits: { label: 'Наследует', color: '#34d399' },
  reads: { label: 'Читает', color: '#60a5fa' },
  writes: { label: 'Записывает', color: '#f59e0b' },
  uses: { label: 'Использует', color: '#60a5fa' },
  event: { label: 'Событие', color: '#34d399' },
  process: { label: 'Запускает', color: '#f59e0b' },
  proposal: { label: 'Предлагается', color: '#c084fc' },
};

export const nodeKindsFor = (map: RelationshipMap) => ({ ...builtInNodeKinds, ...map.nodeKinds });
export const edgeKindsFor = (map: RelationshipMap) => ({ ...builtInEdgeKinds, ...map.edgeKinds });

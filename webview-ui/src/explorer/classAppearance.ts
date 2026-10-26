import { BrowserIcon, CodeIcon, DatabaseIcon, Layers01Icon, Message01Icon } from '@hugeicons/core-free-icons';

export const classAppearances = {
  dialog: { icon: BrowserIcon, color: 'text-kind-dialog', label: 'Диалог' },
  stored: { icon: DatabaseIcon, color: 'text-kind-method', label: 'Хранимый класс' },
  virtual: { icon: Layers01Icon, color: 'text-kind-lifecycle', label: 'Виртуальный класс' },
  class: { icon: CodeIcon, color: 'text-kind-class', label: 'Класс' },
  comment: { icon: Message01Icon, color: 'text-kind-attribute', label: 'Комментарий' },
  metadata: { icon: DatabaseIcon, color: 'text-kind-list', label: 'Метаданные' },
};

export type ClassAppearanceKind = keyof typeof classAppearances;

export function classAppearanceKind(node: { kind?: string; hasDfm?: boolean; virtual?: number | null; dbtablename?: string | null }): ClassAppearanceKind {
  if (node.kind === 'comment') return 'comment';
  if (node.kind === 'metadata') return 'metadata';
  if (node.hasDfm) return 'dialog';
  if (node.virtual) return 'virtual';
  if (node.dbtablename?.trim()) return 'stored';
  return 'class';
}

export function classAppearance(node: { kind?: string; hasDfm?: boolean; virtual?: number | null; dbtablename?: string | null }) {
  return classAppearances[classAppearanceKind(node)];
}

import { BrowserIcon, CodeIcon, DatabaseIcon, Layers01Icon, Message01Icon } from '@hugeicons/core-free-icons';

export const classAppearances = {
  dialog: { icon: BrowserIcon, color: 'text-kind-dialog', label: 'Диалог' },
  stored: { icon: DatabaseIcon, color: 'text-kind-method', label: 'Хранимый класс' },
  virtual: { icon: Layers01Icon, color: 'text-kind-lifecycle', label: 'Виртуальный класс' },
  class: { icon: CodeIcon, color: 'text-kind-class', label: 'Класс' },
  comment: { icon: Message01Icon, color: 'text-kind-attribute', label: 'Комментарий' },
  metadata: { icon: DatabaseIcon, color: 'text-kind-list', label: 'Метаданные' },
};

export function classAppearance(node: { kind?: string; hasDfm?: boolean; virtual?: number | null; dbtablename?: string | null }) {
  if (node.kind === 'comment') return classAppearances.comment;
  if (node.kind === 'metadata') return classAppearances.metadata;
  if (node.hasDfm) return classAppearances.dialog;
  if (node.virtual) return classAppearances.virtual;
  if (node.dbtablename?.trim()) return classAppearances.stored;
  return classAppearances.class;
}

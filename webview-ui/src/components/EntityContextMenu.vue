<script setup lang="ts">
import { Copy01Icon, DatabaseIcon, Edit02Icon, Search01Icon, Settings02Icon, SourceCodeIcon, ViewIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { ref } from 'vue';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { vscode } from '@/vscode';

const props = defineProps<{
  entityId?: number | string;
  entityType?: string;
  copyShortcut?: string;
  svn?: boolean;
	edit?: boolean;
	classId?: number;
	viewObjectsClassId?: number;
}>();

const emit = defineEmits<{
  edit: [];
  svnAction: [action: 'localDiff' | 'history' | 'blame'];
}>();
const selectedIds = ref<string[]>([]);

function syncSelectedIds(event: MouseEvent): void {
  const target = event.target;
  const row = target instanceof Element ? target.closest<HTMLTableRowElement>('tr[data-entity-id]') : undefined;
  const table = row?.closest('[data-slot="table-container"]');
  selectedIds.value = table
    ? Array.from(table.querySelectorAll<HTMLTableRowElement>('tr[data-row-selected][data-entity-id]'))
      .map(selectedRow => selectedRow.dataset.entityId)
      .filter((id): id is string => Boolean(id))
    : [];
}

function copyId(): void {
  if (props.entityId === undefined) return;
  const currentId = String(props.entityId);
  const ids = selectedIds.value.includes(currentId) ? selectedIds.value : undefined;
  vscode.postMessage({ command: 'copyEntityId', id: ids?.join(';') ?? currentId });
}
function openInClient(role: 'main' | 'test'): void {
  if (props.entityId === undefined || !props.entityType) return;
  const id = Number(props.entityId);
  if (Number.isSafeInteger(id)) vscode.postMessage({ command: 'openClientEntity', role, entityType: props.entityType, id });
}
function openDfm(command: 'openDfmEditor' | 'openDfmPreview'): void {
  if (props.classId !== undefined) vscode.postMessage({ command, classId: props.classId });
}
function openClassObjects(): void {
  if (props.viewObjectsClassId !== undefined) vscode.postMessage({ command: 'openClassObjects', classId: props.viewObjectsClassId });
}
function viewObject(): void {
  if (props.entityId === undefined) return;
  const id = Number(props.entityId);
  if (Number.isSafeInteger(id)) vscode.postMessage({ command: 'viewObject', id });
}
function viewProperties(): void {
  if (props.entityId === undefined) return;
  const id = Number(props.entityId);
  if (Number.isSafeInteger(id)) vscode.postMessage({ command: 'viewEntityProperties', id });
}
</script>

<template>
  <ContextMenu v-if="entityId !== undefined">
    <ContextMenuTrigger as-child @contextmenu.capture="syncSelectedIds">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem @select="viewObject">
        <HugeiconsIcon :icon="Search01Icon" data-icon="inline-start" />
        Просмотр объекта
      </ContextMenuItem>
      <ContextMenuItem v-if="edit" @select="emit('edit')">
        <HugeiconsIcon :icon="Edit02Icon" data-icon="inline-start" />
        Правка…
      </ContextMenuItem>
      <ContextMenuItem @select="viewProperties">
        <HugeiconsIcon :icon="Settings02Icon" data-icon="inline-start" />
        Свойства…
      </ContextMenuItem>
      <ContextMenuItem v-if="viewObjectsClassId !== undefined" @select="openClassObjects">
        <HugeiconsIcon :icon="DatabaseIcon" data-icon="inline-start" />
        Просмотр объектов…
      </ContextMenuItem>
      <ContextMenuItem @select="copyId">
        <HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />
        {{ selectedIds.includes(String(entityId)) && selectedIds.length > 1 ? `Скопировать ID (${selectedIds.length})` : 'Скопировать ID' }}
        <ContextMenuShortcut v-if="copyShortcut">{{ copyShortcut }}</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSub v-if="entityType">
        <ContextMenuSubTrigger>
          <HugeiconsIcon :icon="ViewIcon" data-icon="inline-start" />
          Открыть в клиенте
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem @select="openInClient('test')">В тестовой базе</ContextMenuItem>
          <ContextMenuItem @select="openInClient('main')">В основной базе</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <template v-if="classId !== undefined">
        <ContextMenuItem @select="openDfm('openDfmEditor')">
          <HugeiconsIcon :icon="SourceCodeIcon" data-icon="inline-start" />
          Правка DFM
        </ContextMenuItem>
        <ContextMenuItem @select="openDfm('openDfmPreview')">
          <HugeiconsIcon :icon="ViewIcon" data-icon="inline-start" />
          Просмотр диалога
        </ContextMenuItem>
      </template>
      <ContextMenuSub v-if="svn">
        <ContextMenuSubTrigger>
          <HugeiconsIcon :icon="SourceCodeIcon" data-icon="inline-start" />
          SVN
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem @select="emit('svnAction', 'localDiff')">Local Diff</ContextMenuItem>
          <ContextMenuItem @select="emit('svnAction', 'history')">История файла</ContextMenuItem>
          <ContextMenuItem @select="emit('svnAction', 'blame')">Blame</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    </ContextMenuContent>
  </ContextMenu>
  <slot v-else />
</template>

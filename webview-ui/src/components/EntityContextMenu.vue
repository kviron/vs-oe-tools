<script setup lang="ts">
import { Add01Icon, Copy01Icon, DatabaseIcon, Edit02Icon, Search01Icon, Settings02Icon, SourceCodeIcon, ViewIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
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
	create?: boolean;
	createLabel?: string;
	viewLabel?: string;
	viewAsEdit?: boolean;
}>();

const emit = defineEmits<{
	create: [entityId?: string];
  edit: [];
  svnAction: [action: 'localDiff' | 'history' | 'blame'];
}>();
const selectedIds = ref<string[]>([]);
const contextEntityId = ref<string>();
const effectiveEntityId = computed(() => contextEntityId.value ?? (props.entityId === undefined ? undefined : String(props.entityId)));

function syncSelectedIds(event: MouseEvent): void {
  const target = event.target;
  const row = target instanceof Element ? target.closest<HTMLTableRowElement>('tr[data-entity-id]') : undefined;
  contextEntityId.value = row?.dataset.entityId ?? (props.entityId === undefined ? undefined : String(props.entityId));
  const table = row?.closest('[data-slot="table-container"]');
  selectedIds.value = table
    ? Array.from(table.querySelectorAll<HTMLTableRowElement>('tr[data-row-selected][data-entity-id]'))
      .map(selectedRow => selectedRow.dataset.entityId)
      .filter((id): id is string => Boolean(id))
    : [];
}

function copyId(): void {
  if (effectiveEntityId.value === undefined) return;
  const currentId = effectiveEntityId.value;
  const ids = selectedIds.value.includes(currentId) ? selectedIds.value : undefined;
  vscode.postMessage({ command: 'copyEntityId', id: ids?.join(';') ?? currentId });
}
function openInClient(role: 'main' | 'test'): void {
  if (effectiveEntityId.value === undefined || !props.entityType) return;
  const id = Number(effectiveEntityId.value);
  if (Number.isSafeInteger(id)) vscode.postMessage({ command: 'openClientEntity', role, entityType: props.entityType, id });
}
function openDfm(command: 'openDfmEditor' | 'openDfmPreview'): void {
  if (props.classId !== undefined) vscode.postMessage({ command, classId: props.classId });
}
function openClassObjects(): void {
  if (props.viewObjectsClassId !== undefined) vscode.postMessage({ command: 'openClassObjects', classId: props.viewObjectsClassId });
}
function viewObject(): void {
  if (effectiveEntityId.value === undefined) return;
  const id = Number(effectiveEntityId.value);
  if (Number.isSafeInteger(id)) vscode.postMessage({ command: 'viewObject', id });
}
function viewProperties(): void {
  if (effectiveEntityId.value === undefined) return;
  const id = Number(effectiveEntityId.value);
  if (Number.isSafeInteger(id)) vscode.postMessage({ command: 'viewEntityProperties', id });
}
</script>

<template>
  <ContextMenu v-if="entityId !== undefined || create">
    <ContextMenuTrigger as-child @contextmenu.capture="syncSelectedIds">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem v-if="create" @select="emit('create', effectiveEntityId)">
        <HugeiconsIcon :icon="Add01Icon" data-icon="inline-start" />
        {{ createLabel || 'Создать…' }}
      </ContextMenuItem>
      <ContextMenuItem v-if="effectiveEntityId !== undefined" @select="viewObject">
		<HugeiconsIcon :icon="viewAsEdit ? Edit02Icon : Search01Icon" data-icon="inline-start" />
		{{ viewLabel || 'Просмотр объекта' }}
      </ContextMenuItem>
      <ContextMenuItem v-if="effectiveEntityId !== undefined && edit" @select="emit('edit')">
        <HugeiconsIcon :icon="Edit02Icon" data-icon="inline-start" />
        Правка…
      </ContextMenuItem>
      <ContextMenuItem v-if="effectiveEntityId !== undefined" @select="viewProperties">
        <HugeiconsIcon :icon="Settings02Icon" data-icon="inline-start" />
        Свойства…
      </ContextMenuItem>
      <ContextMenuItem v-if="effectiveEntityId !== undefined && viewObjectsClassId !== undefined" @select="openClassObjects">
        <HugeiconsIcon :icon="DatabaseIcon" data-icon="inline-start" />
        Просмотр объектов…
      </ContextMenuItem>
      <ContextMenuItem v-if="effectiveEntityId !== undefined" @select="copyId">
        <HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />
        {{ effectiveEntityId !== undefined && selectedIds.includes(effectiveEntityId) && selectedIds.length > 1 ? `Скопировать ID (${selectedIds.length})` : 'Скопировать ID' }}
        <ContextMenuShortcut v-if="copyShortcut">{{ copyShortcut }}</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSub v-if="effectiveEntityId !== undefined && entityType">
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

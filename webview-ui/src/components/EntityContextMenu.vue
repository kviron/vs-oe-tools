<script setup lang="ts">
import { Copy01Icon, Edit02Icon, SourceCodeIcon, ViewIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { ref } from 'vue';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { vscode } from '@/vscode';

const props = defineProps<{
  entityId?: number | string;
  copyShortcut?: string;
  svn?: boolean;
	edit?: boolean;
	classId?: number;
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
function openDfm(command: 'openDfmEditor' | 'openDfmPreview'): void {
  if (props.classId !== undefined) vscode.postMessage({ command, classId: props.classId });
}
</script>

<template>
  <ContextMenu v-if="entityId !== undefined">
    <ContextMenuTrigger as-child @contextmenu.capture="syncSelectedIds">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem v-if="edit" @select="emit('edit')">
        <HugeiconsIcon :icon="Edit02Icon" data-icon="inline-start" />
        Правка…
      </ContextMenuItem>
      <ContextMenuItem @select="copyId">
        <HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />
        {{ selectedIds.includes(String(entityId)) && selectedIds.length > 1 ? `Скопировать ID (${selectedIds.length})` : 'Скопировать ID' }}
        <ContextMenuShortcut v-if="copyShortcut">{{ copyShortcut }}</ContextMenuShortcut>
      </ContextMenuItem>
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

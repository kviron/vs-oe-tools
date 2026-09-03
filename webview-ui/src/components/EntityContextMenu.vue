<script setup lang="ts">
import { Copy01Icon, SourceCodeIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { vscode } from '@/vscode';

const props = defineProps<{
  entityId?: number | string;
  copyShortcut?: string;
  svn?: boolean;
}>();

const emit = defineEmits<{ svnAction: [action: 'localDiff' | 'history' | 'blame'] }>();

function copyId(): void {
  if (props.entityId === undefined) return;
  vscode.postMessage({ command: 'copyEntityId', id: props.entityId });
}
</script>

<template>
  <ContextMenu v-if="entityId !== undefined">
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem @select="copyId">
        <HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />
        Скопировать ID
        <ContextMenuShortcut v-if="copyShortcut">{{ copyShortcut }}</ContextMenuShortcut>
      </ContextMenuItem>
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

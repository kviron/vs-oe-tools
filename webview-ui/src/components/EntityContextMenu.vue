<script setup lang="ts">
import { Copy01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { vscode } from '@/vscode';

const props = defineProps<{ entityId?: number | string }>();

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
        <HugeiconsIcon :icon="Copy01Icon" />
        Скопировать ID
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
  <slot v-else />
</template>


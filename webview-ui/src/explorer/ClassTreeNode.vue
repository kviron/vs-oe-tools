<script setup lang="ts">
import { ArrowRight01Icon, CodeIcon, DatabaseIcon, Message01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { vscode } from '@/vscode';

export interface TreeNode {
  id: number | string;
  name: string;
  kind: 'root' | 'class' | 'comment' | 'metadata';
  children: TreeNode[];
}

const props = withDefaults(defineProps<{ node: TreeNode; initiallyOpen?: boolean }>(), { initiallyOpen: false });
const open = ref(props.initiallyOpen);
const hasChildren = computed(() => props.node.children.length > 0);
let clickTimer: number | undefined;

function openClass(pinned: boolean): void {
  if (typeof props.node.id !== 'number' || props.node.kind !== 'class') return;
  window.clearTimeout(clickTimer);
  if (pinned) vscode.postMessage({ command: 'openClass', id: props.node.id, pinned: true });
  else clickTimer = window.setTimeout(() => vscode.postMessage({ command: 'openClass', id: props.node.id as number, pinned: false }), 180);
}
</script>

<template>
  <Collapsible v-model:open="open">
    <div class="group flex min-h-7 items-center hover:bg-accent">
      <CollapsibleTrigger as-child>
        <Button variant="ghost" size="icon-xs" :disabled="!hasChildren" :aria-label="open ? 'Свернуть' : 'Развернуть'" class="shrink-0 disabled:opacity-0">
          <HugeiconsIcon :icon="ArrowRight01Icon" data-icon="inline-start" class="transition-transform" :class="{ 'rotate-90': open }" />
        </Button>
      </CollapsibleTrigger>
      <Button variant="ghost" size="sm" class="h-7 min-w-0 flex-1 justify-start px-1 font-normal" @click="openClass(false)" @dblclick="openClass(true)">
        <HugeiconsIcon v-if="node.kind === 'class' || node.kind === 'root'" :icon="CodeIcon" data-icon="inline-start" />
        <HugeiconsIcon v-else-if="node.kind === 'comment'" :icon="Message01Icon" data-icon="inline-start" />
        <HugeiconsIcon v-else :icon="DatabaseIcon" data-icon="inline-start" />
        <span class="truncate">{{ node.name }}</span>
      </Button>
    </div>
    <CollapsibleContent v-if="hasChildren" class="pl-4">
      <ClassTreeNode v-for="child in node.children" :key="child.id" :node="child" />
    </CollapsibleContent>
  </Collapsible>
</template>

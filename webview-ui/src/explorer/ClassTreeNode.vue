<script setup lang="ts">
import { ArrowRight01Icon, BrowserIcon, CodeIcon, DatabaseIcon, Message01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref, watchEffect } from 'vue';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { vscode } from '@/vscode';
import EntityContextMenu from '@/components/EntityContextMenu.vue';

export interface TreeNode {
  id: number | string;
  entityId?: number | string;
  name: string;
  kind: 'root' | 'class' | 'comment' | 'metadata';
	hasDfm?: boolean;
	virtual?: number | null;
	dbtablename?: string | null;
  children: TreeNode[];
}

const props = withDefaults(defineProps<{
  node: TreeNode;
  initiallyOpen?: boolean;
  selectedClassId?: number;
  revealClassId?: number;
  explorerActive?: boolean;
}>(), { initiallyOpen: false });
const emit = defineEmits<{ selectClass: [id: number] }>();
const open = ref(props.initiallyOpen);
const hasChildren = computed(() => props.node.children.length > 0);
let clickTimer: number | undefined;

watchEffect(() => {
  if (props.revealClassId !== undefined && containsClass(props.node, props.revealClassId)) open.value = true;
});

function containsClass(node: TreeNode, id: number): boolean {
  return (node.kind === 'class' && node.id === id) || node.children.some(child => containsClass(child, id));
}

function openClass(pinned: boolean): void {
  if (typeof props.node.id !== 'number' || props.node.kind !== 'class') return;
  emit('selectClass', props.node.id);
  window.clearTimeout(clickTimer);
  if (pinned) vscode.postMessage({ command: 'openClass', id: props.node.id, pinned: true });
  else clickTimer = window.setTimeout(() => vscode.postMessage({ command: 'openClass', id: props.node.id as number, pinned: false }), 180);
}
</script>

<template>
  <Collapsible v-model:open="open">
    <EntityContextMenu
      :entity-id="node.entityId"
	  :class-id="node.kind === 'class' && node.hasDfm && typeof node.id === 'number' ? node.id : undefined"
      :view-objects-class-id="node.kind === 'class' && !node.virtual && node.dbtablename && typeof node.id === 'number' ? node.id : undefined"
      copy-shortcut="Ctrl+C"
    >
      <div class="group flex min-h-7 min-w-full items-center whitespace-nowrap hover:bg-accent">
        <CollapsibleTrigger as-child>
          <Button variant="ghost" size="icon-xs" :disabled="!hasChildren" :aria-label="open ? 'Свернуть' : 'Развернуть'" class="shrink-0 disabled:opacity-0">
            <HugeiconsIcon :icon="ArrowRight01Icon" data-icon="inline-start" class="transition-transform" :class="{ 'rotate-90': open }" />
          </Button>
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="sm"
          :class="cn(
            'h-7 flex-1 justify-start px-1 font-normal',
            node.kind === 'class' && node.id === selectedClassId && (explorerActive
              ? 'bg-primary/15 text-primary hover:bg-primary/20'
              : 'bg-muted text-muted-foreground hover:bg-muted'),
          )"
          :aria-current="node.kind === 'class' && node.id === selectedClassId ? 'page' : undefined"
          :data-class-id="node.kind === 'class' ? node.id : undefined"
          @click="openClass(false)"
          @dblclick="openClass(true)"
        >
		  <HugeiconsIcon v-if="node.kind === 'class' && node.hasDfm" :icon="BrowserIcon" data-icon="inline-start" class="text-[var(--vscode-charts-orange)]" />
		  <HugeiconsIcon v-else-if="node.kind === 'class' || node.kind === 'root'" :icon="CodeIcon" data-icon="inline-start" />
          <HugeiconsIcon v-else-if="node.kind === 'comment'" :icon="Message01Icon" data-icon="inline-start" />
          <HugeiconsIcon v-else :icon="DatabaseIcon" data-icon="inline-start" />
          <span>{{ node.name }}</span>
        </Button>
      </div>
    </EntityContextMenu>
    <CollapsibleContent v-if="hasChildren" class="pl-4">
      <ClassTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-class-id="selectedClassId"
        :reveal-class-id="revealClassId"
        :explorer-active="explorerActive"
        @select-class="emit('selectClass', $event)"
      />
    </CollapsibleContent>
  </Collapsible>
</template>

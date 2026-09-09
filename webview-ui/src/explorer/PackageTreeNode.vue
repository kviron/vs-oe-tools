<script setup lang="ts">
import { Archive01Icon, ArrowRight01Icon, DatabaseIcon, File01Icon, Folder01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref, watch } from 'vue';
import type { PackageExplorerNode } from '../../../src/features/packages/models';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const props = withDefaults(defineProps<{ node: PackageExplorerNode; initiallyOpen?: boolean; loadingFileId?: number }>(), { initiallyOpen: false });
const emit = defineEmits<{ loadFile: [fileId: number]; openContent: [fileId: number, objectId?: number] }>();
const open = ref(props.initiallyOpen);
const hasChildren = computed(() => props.node.hasChildren || props.node.children.length > 0);
watch(open, value => { if (value && props.node.kind === 'file' && props.node.fileId !== undefined && props.node.children.length === 0) emit('loadFile', props.node.fileId); });
function activate(): void {
  if (props.node.kind === 'file' && props.node.fileId !== undefined) emit('openContent', props.node.fileId);
  if (props.node.kind === 'object' && props.node.fileId !== undefined && props.node.objectId !== undefined) emit('openContent', props.node.fileId, props.node.objectId);
}
function forwardOpen(fileId: number, objectId?: number): void { emit('openContent', fileId, objectId); }
const icon = computed(() => props.node.kind === 'package' ? Archive01Icon : props.node.kind === 'group' || props.node.kind === 'files' ? Folder01Icon : props.node.kind === 'file' ? File01Icon : DatabaseIcon);
</script>

<template>
  <Collapsible v-model:open="open">
    <div class="group flex min-h-7 min-w-full items-center whitespace-nowrap hover:bg-accent">
      <CollapsibleTrigger as-child>
        <Button variant="ghost" size="icon-xs" :disabled="!hasChildren" :aria-label="open ? 'Свернуть' : 'Развернуть'" class="shrink-0 disabled:opacity-0">
          <HugeiconsIcon :icon="ArrowRight01Icon" class="transition-transform" :class="{ 'rotate-90': open }" aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <Button variant="ghost" size="sm" class="h-7 flex-1 justify-start px-1 font-normal" :title="node.className || node.name" @click="activate">
        <HugeiconsIcon :icon="icon" data-icon="inline-start" />
        <span>{{ node.name }}</span>
        <span v-if="node.kind === 'object'" class="ml-2 text-[0.625rem] text-muted-foreground">{{ node.className }}</span>
      </Button>
    </div>
    <CollapsibleContent v-if="hasChildren" class="pl-4">
      <div v-if="node.kind === 'file' && loadingFileId === node.fileId && node.children.length === 0" class="h-7 px-7 text-xs text-muted-foreground">Загрузка…</div>
      <PackageTreeNode v-for="child in node.children" :key="child.key" :node="child" :loading-file-id="loadingFileId" @load-file="emit('loadFile', $event)" @open-content="forwardOpen" />
    </CollapsibleContent>
  </Collapsible>
</template>

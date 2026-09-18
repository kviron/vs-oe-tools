<script setup lang="ts">
import { ArrowRight01Icon, CodeIcon, DatabaseIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref, watchEffect } from 'vue';
import type { PackageContentNode } from '../../../src/features/packages/models';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { vscode } from '@/vscode';

const props = defineProps<{ node: PackageContentNode; depth?: number; selectedObjectId?: number }>();
const open = ref((props.depth ?? 0) < 2);
const hasChildren = computed(() => props.node.children.length > 0);
watchEffect(() => { if (props.selectedObjectId !== undefined && contains(props.node, props.selectedObjectId)) { open.value = true; } });
function contains(node: PackageContentNode, id: number): boolean { return node.id === id || node.children.some(child => contains(child, id)); }
function openSpecialized(): void { vscode.postMessage({ command: 'openPackageContentObject', id: props.node.id, kind: props.node.kind }); }
</script>

<template>
  <TableRow :data-object-id="node.id" :data-state="node.id === selectedObjectId ? 'selected' : undefined" @dblclick="openSpecialized">
    <TableCell class="h-7 min-w-72 whitespace-nowrap px-1 py-0.5">
      <div class="flex items-center" :style="{ paddingLeft: `${(depth ?? 0) * 16}px` }">
        <Button variant="ghost" size="icon-xs" :disabled="!hasChildren" :aria-label="open ? 'Свернуть' : 'Развернуть'" class="shrink-0 disabled:opacity-0" data-copy-ignore @click.stop="open = !open">
          <HugeiconsIcon :icon="ArrowRight01Icon" class="transition-transform" :class="{ 'rotate-90': open }" aria-hidden="true" />
        </Button>
        <HugeiconsIcon :icon="node.kind === 'method' || node.kind === 'module' ? CodeIcon : DatabaseIcon" class="mr-1 shrink-0" aria-hidden="true" data-copy-ignore />
        <span>{{ node.name }}</span>
      </div>
    </TableCell>
    <TableCell class="min-w-44 px-2 py-0.5">{{ node.className }}</TableCell>
    <TableCell class="min-w-28 px-2 py-0.5">{{ node.id }}</TableCell>
    <TableCell class="min-w-28 px-2 py-0.5">{{ node.parentId ?? '' }}</TableCell>
    <TableCell class="min-w-28 px-2 py-0.5">{{ node.classId }}</TableCell>
  </TableRow>
  <template v-if="open">
    <PackageContentRow v-for="child in node.children" :key="child.id" :node="child" :depth="(depth ?? 0) + 1" :selected-object-id="selectedObjectId" />
  </template>
</template>

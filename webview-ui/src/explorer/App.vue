<script setup lang="ts">
import type { ExplorerHostMessage } from '../../../src/core/webviewProtocol';
import type { ClassTreeRow } from '../../../src/features/classes/models';
import { computed, ref } from 'vue';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { vscode } from '@/vscode';
import ClassTreeNode, { type TreeNode } from './ClassTreeNode.vue';

const activeTab = ref('packages');
const classes = ref<ClassTreeRow[]>([]);
const loading = ref(false);
const loaded = ref(false);
const error = ref('');

const classTree = computed<TreeNode>(() => {
  const byId = new Map<number, TreeNode>(
    classes.value.map(item => [item.id, { id: item.id, name: item.name, kind: 'class', children: [] }]),
  );
  const roots: TreeNode[] = [];
  for (const item of classes.value) {
    const node = byId.get(item.id)!;
    node.children.push(...item.comments.map(comment => ({
      id: `comment-${comment.id}`,
      name: comment.name || `Комментарий #${comment.id}`,
      kind: 'comment' as const,
      children: [],
    })));
    if (item.objectMetaDataCount > 0) {
      node.children.push({
        id: `metadata-${item.id}`,
        name: `Объекты метаданных (${item.objectMetaDataCount})`,
        kind: 'metadata',
        children: [],
      });
    }
    const parent = item.seniorid === null ? undefined : byId.get(item.seniorid);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return { id: 'root', name: 'Root', kind: 'root', children: roots.length === 1 ? roots[0].children : roots };
});

function loadClasses(): void {
  if (loading.value || loaded.value) return;
  loading.value = true;
  error.value = '';
  vscode.postMessage({ command: 'loadClasses' });
}

function onTabChange(value: string | number): void {
  activeTab.value = String(value);
  if (activeTab.value === 'classes') loadClasses();
}

window.addEventListener('message', (event: MessageEvent<ExplorerHostMessage>) => {
  const message = event.data;
  if (message.command === 'classesLoaded') {
    classes.value = message.classes;
    loading.value = false;
    loaded.value = true;
  } else if (message.command === 'classesLoadFailed') {
    loading.value = false;
    error.value = message.message;
  } else if (message.command === 'resetClasses') {
    classes.value = [];
    loaded.value = false;
    loading.value = false;
    if (activeTab.value === 'classes') loadClasses();
  }
});
</script>

<template>
  <Tabs :model-value="activeTab" class="w-full gap-0" @update:model-value="onTabChange">
    <TabsList variant="line" class="sticky top-0 w-full">
      <TabsTrigger value="packages" class="flex-1">Пакеты</TabsTrigger>
      <TabsTrigger value="objects" class="flex-1">Объекты</TabsTrigger>
      <TabsTrigger value="classes" class="flex-1">Классы</TabsTrigger>
    </TabsList>
    <TabsContent value="packages">
      <Empty class="min-h-0 py-6"><EmptyHeader><EmptyTitle>Пакеты</EmptyTitle><EmptyDescription>Данные пакетов пока не загружены.</EmptyDescription></EmptyHeader></Empty>
    </TabsContent>
    <TabsContent value="objects">
      <Empty class="min-h-0 py-6"><EmptyHeader><EmptyTitle>Объекты</EmptyTitle><EmptyDescription>Данные объектов пока не загружены.</EmptyDescription></EmptyHeader></Empty>
    </TabsContent>
    <TabsContent value="classes" class="p-1">
      <div v-if="loading" class="flex flex-col gap-1 p-1">
        <Skeleton v-for="index in 6" :key="index" class="h-6 w-full" />
      </div>
      <Empty v-else-if="error" class="min-h-0 py-6"><EmptyHeader><EmptyTitle>Не удалось загрузить классы</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader></Empty>
      <Empty v-else-if="loaded && classes.length === 0" class="min-h-0 py-6"><EmptyHeader><EmptyTitle>Классы не найдены</EmptyTitle><EmptyDescription>База данных не вернула доступных классов.</EmptyDescription></EmptyHeader></Empty>
      <ClassTreeNode v-else-if="loaded" :node="classTree" initially-open />
    </TabsContent>
  </Tabs>
</template>

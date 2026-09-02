<script setup lang="ts">
import type { ExplorerHostMessage } from '../../../src/core/webviewProtocol';
import type { ClassTreeRow } from '../../../src/features/classes/models';
import { computed, nextTick, ref } from 'vue';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { vscode } from '@/vscode';
import ClassTreeNode, { type TreeNode } from './ClassTreeNode.vue';

const activeTab = ref('packages');
const classes = ref<ClassTreeRow[]>([]);
const loading = ref(false);
const loaded = ref(false);
const error = ref('');
const selectedClassId = ref<number>();
const revealClassId = ref<number>();
const searchQuery = ref('');
let searchClickTimer: number | undefined;

const normalizedSearchQuery = computed(() => searchQuery.value.trim());
const searchResults = computed(() => {
  const query = normalizedSearchQuery.value;
  if (!query) return [];
  if (/^\d+$/.test(query)) {
    const id = Number(query);
    return classes.value.filter(item => item.id === id);
  }
  const name = query.toLocaleLowerCase('ru');
  return classes.value
    .filter(item => item.name.toLocaleLowerCase('ru').includes(name))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
});

const classTree = computed<TreeNode>(() => {
  const byId = new Map<number, TreeNode>(
    classes.value.map(item => [item.id, { id: item.id, entityId: item.id, name: item.name, kind: 'class', children: [] }]),
  );
  const roots: TreeNode[] = [];
  for (const item of classes.value) {
    const node = byId.get(item.id)!;
    node.children.push(...item.comments.map(comment => ({
      id: `comment-${comment.id}`,
      entityId: comment.id,
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

function selectSearchResult(item: ClassTreeRow, pinned: boolean): void {
  selectedClassId.value = item.id;
  debugLog(`Клик по результату поиска; выбран ID=${item.id}; double=${pinned}.`);
  vscode.postMessage({ command: 'selectExplorerEntity', id: item.id });
  window.clearTimeout(searchClickTimer);
  if (!pinned) {
    searchClickTimer = window.setTimeout(() => vscode.postMessage({ command: 'openClass', id: item.id, pinned: false }), 180);
    return;
  }
  searchQuery.value = '';
  revealClassId.value = undefined;
  void nextTick(async () => {
    revealClassId.value = item.id;
    await nextTick();
    window.setTimeout(() => scrollToSelectedClass(item.id), 100);
  });
  vscode.postMessage({ command: 'openClass', id: item.id, pinned: true });
}

function debugLog(message: string): void {
  vscode.postMessage({ command: 'explorerDebugLog', message });
}

function updateCopyContext(active: boolean): void {
  vscode.postMessage({ command: 'setExplorerCopyContext', active });
}

function selectTreeClass(id: number): void {
  selectedClassId.value = id;
  debugLog(`Клик по дереву; выбран ID=${id}.`);
  vscode.postMessage({ command: 'selectExplorerEntity', id });
}

function scrollToSelectedClass(id: number): void {
  document.querySelector<HTMLElement>(`[data-class-id="${id}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

document.addEventListener('copy', (event: ClipboardEvent) => {
  const activeElement = document.activeElement;
  const activeTag = activeElement?.tagName ?? 'нет';
  debugLog(`Событие copy; activeElement=${activeTag}; selectedId=${selectedClassId.value ?? 'нет'}; clipboardData=${Boolean(event.clipboardData)}.`);
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || (activeElement instanceof HTMLElement && activeElement.isContentEditable)) {
    debugLog('copy оставлен стандартному полю ввода.');
    return;
  }
  if (!window.getSelection()?.isCollapsed || selectedClassId.value === undefined || !event.clipboardData) {
    debugLog(`copy пропущен; selectionCollapsed=${window.getSelection()?.isCollapsed ?? 'нет'}.`);
    return;
  }
  event.preventDefault();
  event.clipboardData.setData('text/plain', String(selectedClassId.value));
  debugLog(`ID=${selectedClassId.value} записан в clipboardData.`);
  vscode.postMessage({ command: 'copyEntityId', id: selectedClassId.value });
});

document.addEventListener('focusin', (event: FocusEvent) => {
  const target = event.target;
  const isTextInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
  updateCopyContext(!isTextInput);
});

window.addEventListener('focus', () => updateCopyContext(true));
window.addEventListener('blur', () => updateCopyContext(false));

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.ctrlKey && event.key.toLocaleLowerCase() === 'c') {
    debugLog(`Получен keydown Ctrl+C; target=${event.target instanceof HTMLElement ? event.target.tagName : 'не HTMLElement'}; defaultPrevented=${event.defaultPrevented}.`);
  }
}, true);

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
    selectedClassId.value = undefined;
    vscode.postMessage({ command: 'selectExplorerEntity' });
    loaded.value = false;
    loading.value = false;
    if (activeTab.value === 'classes') loadClasses();
  }
});
</script>

<template>
  <Tabs :model-value="activeTab" class="w-full gap-0" @update:model-value="onTabChange">
    <TabsList variant="line" class="sticky top-0 z-20 w-full border-b bg-muted px-1">
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
      <template v-else-if="loaded">
        <div class="sticky top-8 z-10 -mx-1 mb-1 border-b bg-background px-1 pb-1 pt-1">
          <Input
            v-model="searchQuery"
            type="search"
            class="h-7 bg-background dark:bg-background"
            placeholder="Поиск класса по названию или ID"
            aria-label="Поиск класса по названию или ID"
          />
        </div>
        <div v-if="normalizedSearchQuery" class="flex flex-col">
          <button
            v-for="item in searchResults"
            :key="item.id"
            type="button"
            class="flex min-h-7 items-center gap-2 px-2 text-left hover:bg-accent"
            :class="item.id === selectedClassId && 'bg-accent text-accent-foreground'"
            :title="`${item.name} — ${item.id}`"
            @click="selectSearchResult(item, false)"
            @dblclick="selectSearchResult(item, true)"
          >
            <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{{ item.id }}</span>
          </button>
          <Empty v-if="searchResults.length === 0" class="min-h-0 py-6">
            <EmptyHeader><EmptyTitle>Совпадений нет</EmptyTitle><EmptyDescription>Измените название или ID класса.</EmptyDescription></EmptyHeader>
          </Empty>
        </div>
        <ClassTreeNode
          v-else
          :node="classTree"
          :selected-class-id="selectedClassId"
          :reveal-class-id="revealClassId"
          initially-open
          @select-class="selectTreeClass"
        />
      </template>
    </TabsContent>
  </Tabs>
</template>

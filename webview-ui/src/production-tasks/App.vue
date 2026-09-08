<script setup lang="ts">
import { RefreshIcon, ViewIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import type { ProductionTasksHostMessage } from '../../../src/core/webviewProtocol';
import type { ProductionTaskSummary } from '../../../src/features/production-tasks/models';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { vscode } from '@/vscode';

type SortKey = 'id' | 'number' | 'title' | 'state' | 'createdAt' | 'deadline' | 'workType' | 'project' | 'executor';
type SortDirection = 'asc' | 'desc';

const columns: ReadonlyArray<{ key: SortKey; label: string; width: string }> = [
  { key: 'id', label: 'ID', width: 'w-32' },
  { key: 'number', label: '№ задачи', width: 'w-28' },
  { key: 'title', label: 'Наименование', width: 'min-w-96' },
  { key: 'state', label: 'Статус', width: 'w-36' },
  { key: 'createdAt', label: 'Создана', width: 'w-40' },
  { key: 'deadline', label: 'Срок', width: 'w-32' },
  { key: 'workType', label: 'Вид работ', width: 'w-36' },
  { key: 'project', label: 'Проект', width: 'w-64' },
  { key: 'executor', label: 'Исполнитель', width: 'w-56' },
];
const collator = new Intl.Collator('ru-RU', { numeric: true, sensitivity: 'base' });
const tasks = ref<ProductionTaskSummary[]>([]);
const loading = ref(true);
const error = ref('');
const loadedAt = ref('');
const searchQuery = ref('');
const selectedTaskId = ref<number>();
const sortKey = ref<SortKey>('number');
const sortDirection = ref<SortDirection>('asc');

const filteredTasks = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('ru-RU');
  if (!query) return tasks.value;
  return tasks.value.filter(task => [String(task.id), task.number, task.title]
    .some(value => value.toLocaleLowerCase('ru-RU').includes(query)));
});
const sortedTasks = computed(() => filteredTasks.value
  .map((task, index) => ({ task, index }))
  .sort((left, right) => {
    const comparison = collator.compare(sortValue(left.task, sortKey.value), sortValue(right.task, sortKey.value));
    return comparison ? comparison * (sortDirection.value === 'asc' ? 1 : -1) : left.index - right.index;
  })
  .map(entry => entry.task));
const countLabel = computed(() => {
  if (loading.value) return 'Загрузка…';
  return searchQuery.value.trim() ? `${filteredTasks.value.length} из ${tasks.value.length}` : `${tasks.value.length}`;
});

function refresh(): void { vscode.postMessage({ command: 'refreshProductionTasks' }); }
function importSessionKey(): void { vscode.postMessage({ command: 'importProductionSessionKey' }); }
function setPassword(): void { vscode.postMessage({ command: 'setProductionTasksPassword' }); }
function openLog(): void { vscode.postMessage({ command: 'openProductionTasksLog' }); }
function openTask(id: number): void { vscode.postMessage({ command: 'openProductionTask', id }); }
function selectTask(id: number): void { selectedTaskId.value = id; }
function changeSort(key: SortKey): void {
  if (sortKey.value === key) { sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'; return; }
  sortKey.value = key;
  sortDirection.value = 'asc';
}
function sortIndicator(key: SortKey): string { return sortKey.value === key ? (sortDirection.value === 'asc' ? '▲' : '▼') : ''; }
function sortValue(task: ProductionTaskSummary, key: SortKey): string {
  const value = String(task[key] ?? '');
  if (key !== 'createdAt' && key !== 'deadline') return value;
  const parts = value.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  return parts ? `${parts[3]}${parts[2]}${parts[1]}${parts[4] ?? '00'}${parts[5] ?? '00'}` : value;
}

window.addEventListener('message', (event: MessageEvent<ProductionTasksHostMessage>) => {
  const message = event.data;
  if (message.command === 'productionTasksLoading') { loading.value = true; error.value = ''; return; }
  if (message.command === 'productionTasksFailed') { loading.value = false; error.value = message.message; return; }
  tasks.value = message.tasks;
  loadedAt.value = message.loadedAt;
  loading.value = false;
  error.value = '';
  if (selectedTaskId.value && !tasks.value.some(task => task.id === selectedTaskId.value)) selectedTaskId.value = undefined;
});
vscode.postMessage({ command: 'productionTasksReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col bg-background text-foreground">
    <header class="flex shrink-0 items-center gap-3 border-b px-4 py-2">
      <div class="min-w-0">
        <h1 class="text-sm font-semibold">Задачи</h1>
        <p class="text-xs text-muted-foreground">Продакшен · {{ countLabel }}</p>
      </div>
      <Input v-model="searchQuery" type="search" class="ml-auto h-8 max-w-md" placeholder="ID, номер или наименование задачи" aria-label="Поиск задачи по ID, номеру или наименованию" />
      <Button variant="outline" size="sm" title="Обновить задачи" :disabled="loading" @click="refresh">
        <HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />
        Обновить
      </Button>
    </header>

    <div v-if="loading" class="flex min-h-0 flex-1 flex-col gap-2 p-4">
      <Skeleton class="h-10 w-full" />
      <Skeleton v-for="index in 10" :key="index" class="h-9 w-full" />
    </div>
    <Empty v-else-if="error" class="min-h-0 flex-1 px-3">
      <EmptyHeader><EmptyTitle>Не удалось загрузить задачи</EmptyTitle><EmptyDescription class="break-words">{{ error }}</EmptyDescription></EmptyHeader>
      <div class="flex flex-wrap justify-center gap-2"><Button size="sm" variant="outline" @click="refresh">Повторить</Button><Button size="sm" variant="outline" @click="openLog">Открыть лог</Button><Button v-if="error.includes('Неверное имя или пароль') || error.includes('пароль для production')" size="sm" @click="setPassword">Указать пароль production</Button><Button v-if="error.includes('productionClientSessionKey') || error.includes('productionPersonId')" size="sm" @click="importSessionKey">Импортировать настройки</Button></div>
    </Empty>
    <Empty v-else-if="!tasks.length" class="min-h-0 flex-1"><EmptyHeader><EmptyTitle>Задач нет</EmptyTitle><EmptyDescription>Для текущего исполнителя нет активных задач.</EmptyDescription></EmptyHeader></Empty>
    <Empty v-else-if="!sortedTasks.length" class="min-h-0 flex-1"><EmptyHeader><EmptyTitle>Ничего не найдено</EmptyTitle><EmptyDescription>Поиск выполняется по ID, номеру и наименованию задачи.</EmptyDescription></EmptyHeader></Empty>
    <Table v-else container-class="min-h-0 flex-1 overflow-auto" class="min-w-[1400px]">
      <TableHeader class="sticky top-0 z-10 bg-background">
        <TableRow>
          <TableHead v-for="column in columns" :key="column.key" :class="column.width">
            <Button class="-ml-2 h-8 px-2" variant="ghost" size="sm" @click.stop="changeSort(column.key)">
              {{ column.label }} <span v-if="sortIndicator(column.key)" aria-hidden="true">{{ sortIndicator(column.key) }}</span>
            </Button>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <ContextMenu v-for="task in sortedTasks" :key="task.id">
          <ContextMenuTrigger as-child>
            <TableRow class="cursor-default" :data-row-selected="selectedTaskId === task.id ? '' : undefined" :aria-selected="selectedTaskId === task.id ? 'true' : undefined" @click="selectTask(task.id)" @dblclick="openTask(task.id)">
              <TableCell class="font-mono">{{ task.id }}</TableCell>
              <TableCell class="font-semibold">{{ task.number || '—' }}</TableCell>
              <TableCell :title="task.title">{{ task.title || 'Без наименования' }}</TableCell>
              <TableCell><Badge variant="secondary">{{ task.state || 'Без статуса' }}</Badge></TableCell>
              <TableCell>{{ task.createdAt || '—' }}</TableCell>
              <TableCell>{{ task.deadline || '—' }}</TableCell>
              <TableCell>{{ task.workType || '—' }}</TableCell>
              <TableCell :title="task.project">{{ task.project || '—' }}</TableCell>
              <TableCell :title="task.executor">{{ task.executor || '—' }}</TableCell>
            </TableRow>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuGroup>
              <ContextMenuItem @select="openTask(task.id)">
                <HugeiconsIcon :icon="ViewIcon" data-icon="inline-start" />
                Просмотр
              </ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
      </TableBody>
    </Table>
    <footer v-if="loadedAt && !loading" class="shrink-0 border-t px-4 py-1 text-xs text-muted-foreground">Обновлено {{ new Date(loadedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }}</footer>
  </main>
</template>

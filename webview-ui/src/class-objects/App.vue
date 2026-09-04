<script setup lang="ts">
import { RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import type { ClassObjectsHostMessage } from '../../../src/core/webviewProtocol';
import type { ClassObjectsResult } from '../../../src/features/classes/models';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { vscode } from '@/vscode';
import EntityContextMenu from '@/components/EntityContextMenu.vue';

const result = ref<ClassObjectsResult>();
const loading = ref(true);
const loadingMore = ref(false);
const error = ref('');
const sortKey = ref('');
const sortDirection = ref<1 | -1>(1);

const rows = computed(() => {
  const source = result.value?.rows ?? [];
  if (!sortKey.value) return source;
  const direction = sortDirection.value;
  return [...source].sort((left, right) => compare(left[sortKey.value], right[sortKey.value]) * direction);
});

function compare(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'ru', { numeric: true, sensitivity: 'base' });
}

function sort(key: string): void {
  if (sortKey.value === key) sortDirection.value = sortDirection.value === 1 ? -1 : 1;
  else {
    sortKey.value = key;
    sortDirection.value = 1;
  }
}

function display(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function refresh(): void {
  vscode.postMessage({ command: 'refreshClassObjects' });
}

function loadMore(): void {
  if (!result.value?.hasMore || loading.value || loadingMore.value) return;
  loadingMore.value = true;
  vscode.postMessage({ command: 'loadMoreClassObjects', offset: result.value.rows.length });
}

function handleScroll(event: Event): void {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;
  if (target.scrollHeight - target.scrollTop - target.clientHeight <= 160) loadMore();
}

window.addEventListener('message', (event: MessageEvent<ClassObjectsHostMessage>) => {
  const message = event.data;
  if (message.command === 'classObjectsLoading') {
    if (message.append) loadingMore.value = true;
    else loading.value = true;
    error.value = '';
  } else if (message.command === 'classObjectsLoaded') {
    result.value = message.append && result.value
      ? { ...message.result, rows: [...result.value.rows, ...message.result.rows] }
      : message.result;
    loading.value = false;
    loadingMore.value = false;
  } else if (message.command === 'classObjectsLoadFailed') {
    error.value = message.message;
    loading.value = false;
    loadingMore.value = false;
  }
});

vscode.postMessage({ command: 'classObjectsReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col p-1">
    <header class="flex shrink-0 items-center justify-between gap-2 border-b px-1 py-1">
      <div class="min-w-0">
        <div class="truncate text-sm font-medium">{{ result?.className || 'Объекты класса' }}</div>
        <div v-if="result" class="text-xs text-muted-foreground">
          Загружено {{ result.rows.length }} из {{ result.totalCount }}
        </div>
      </div>
      <Button variant="outline" size="sm" :disabled="loading || loadingMore" @click="refresh">
        <HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />
        Обновить
      </Button>
    </header>

    <div v-if="loading" class="flex flex-col gap-1 p-1">
      <Skeleton v-for="index in 12" :key="index" class="h-6 w-full" />
    </div>
    <Empty v-else-if="error" class="min-h-0 flex-1">
      <EmptyHeader><EmptyTitle>Не удалось загрузить объекты</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader>
    </Empty>
    <Empty v-else-if="!result?.rows.length" class="min-h-0 flex-1">
      <EmptyHeader><EmptyTitle>Объектов нет</EmptyTitle><EmptyDescription>В таблице этого класса не найдено записей.</EmptyDescription></EmptyHeader>
    </Empty>
    <Table v-else container-class="min-h-0 flex-1 overflow-auto" @scroll="handleScroll">
      <TableHeader class="sticky top-0 bg-background">
        <TableRow>
          <TableHead
            v-for="column in result.columns"
            :key="column.key"
            class="min-w-32 cursor-pointer whitespace-nowrap"
            :title="`${column.attributeName} · ${column.key}`"
            @click="sort(column.key)"
          >
            {{ column.title }}<template v-if="sortKey === column.key"> {{ sortDirection === 1 ? '↑' : '↓' }}</template>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <EntityContextMenu v-for="(row, index) in rows" :key="String(row.ID ?? row.id ?? index)" :entity-id="String(row.ID ?? row.id ?? '')">
        <TableRow :data-entity-id="String(row.ID ?? row.id ?? '')">
          <TableCell v-for="column in result.columns" :key="column.key" class="max-w-80 whitespace-nowrap" :title="display(row[column.key])">
            {{ display(row[column.key]) }}
          </TableCell>
        </TableRow>
        </EntityContextMenu>
      </TableBody>
    </Table>
    <div v-if="loadingMore" class="shrink-0 border-t px-2 py-1 text-center text-xs text-muted-foreground">Загрузка следующих 100 строк…</div>
  </main>
</template>

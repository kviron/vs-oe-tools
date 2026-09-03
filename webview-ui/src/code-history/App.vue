<script setup lang="ts">
import { Clock01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import type { CodeHistoryHostMessage, CodeHistoryListEntry } from '../../../src/core/webviewProtocol';
import SortableTableHead from '@/components/SortableTableHead.vue';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { nextSort, sortedRows, type SortDirection } from '@/lib/tableSort';
import { vscode } from '@/vscode';

type SortKey = 'date' | 'user' | 'commit' | 'comment';

const title = ref('История кода');
const subtitle = ref('');
const entries = ref<CodeHistoryListEntry[]>([]);
const loading = ref(false);
const error = ref('');
const textFilter = ref('');
const userFilter = ref('');
const commitFilter = ref('');
const selectedId = ref<string>();
const sortKey = ref<SortKey>('date');
const sortDirection = ref<SortDirection>('desc');

const displayedEntries = computed(() => {
  const text = textFilter.value.trim().toLocaleLowerCase('ru');
  const user = userFilter.value.trim().toLocaleLowerCase('ru');
  const commit = commitFilter.value.trim().toLocaleLowerCase('ru');
  const filtered = entries.value.filter(entry =>
    (!text || `${entry.date}\n${entry.comment}`.toLocaleLowerCase('ru').includes(text))
    && (!user || `${entry.user}\n${entry.computer}`.toLocaleLowerCase('ru').includes(user))
    && (!commit || entry.commit.toLocaleLowerCase('ru').includes(commit)),
  );
  return sortedRows(filtered, sortKey.value, sortDirection.value, (entry, key) => {
    if (key === 'date') return entry.timestamp;
    if (key === 'commit') return entry.commitOrder;
    return entry[key as 'user' | 'comment'];
  });
});

window.addEventListener('message', (event: MessageEvent<CodeHistoryHostMessage>) => {
  const message = event.data;
  title.value = message.title;
  if (message.command === 'codeHistoryLoading') {
    loading.value = true;
    error.value = '';
    entries.value = [];
    selectedId.value = undefined;
    textFilter.value = '';
    userFilter.value = '';
    commitFilter.value = '';
    sortKey.value = 'date';
    sortDirection.value = 'desc';
  } else if (message.command === 'codeHistoryLoaded') {
    loading.value = false;
    error.value = '';
    subtitle.value = message.subtitle;
    entries.value = message.entries;
  } else {
    loading.value = false;
    error.value = message.message;
    entries.value = [];
  }
});

function openEntry(entry: CodeHistoryListEntry): void {
  selectedId.value = entry.id;
  vscode.postMessage({ command: 'openCodeHistoryEntry', id: entry.id });
}

function changeSort(key: SortKey): void {
  const next = nextSort(sortKey.value, sortDirection.value, key);
  sortKey.value = key;
  sortDirection.value = next;
}

vscode.postMessage({ command: 'codeHistoryReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <header class="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-sm font-medium">{{ title }}</h1>
        <p v-if="subtitle" class="truncate text-xs text-muted-foreground">{{ subtitle }}</p>
      </div>
    </header>

    <div v-if="!loading && !error && entries.length" class="grid shrink-0 grid-cols-3 gap-1 border-b p-1">
      <Input v-model="textFilter" type="search" class="h-7" placeholder="Дата или комментарий" aria-label="Фильтр по дате или комментарию" />
      <Input v-model="userFilter" type="search" class="h-7" placeholder="Пользователь" aria-label="Фильтр по пользователю" />
      <Input v-model="commitFilter" type="search" class="h-7" placeholder="Коммит" aria-label="Фильтр по коммиту" />
    </div>

    <div v-if="loading" class="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden p-1">
      <Skeleton v-for="index in 5" :key="index" class="h-8 w-full" />
    </div>

    <Empty v-else-if="error" class="min-h-0 flex-1 py-4">
      <EmptyHeader><EmptyTitle>Не удалось загрузить историю</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader>
    </Empty>

    <Empty v-else-if="entries.length === 0" class="min-h-0 flex-1 py-4">
      <EmptyHeader>
        <EmptyMedia variant="icon"><HugeiconsIcon :icon="Clock01Icon" /></EmptyMedia>
        <EmptyTitle>История не найдена</EmptyTitle>
        <EmptyDescription>Откройте контекстное меню в редакторе и выберите историю файла или выделенного кода.</EmptyDescription>
      </EmptyHeader>
    </Empty>

    <div v-else class="min-h-0 flex-1 overflow-auto">
      <Table>
        <TableHeader class="sticky top-0 bg-background">
          <TableRow>
            <SortableTableHead class="h-7 w-44 px-2" :active="sortKey === 'date'" :direction="sortDirection" @sort="changeSort('date')">Дата</SortableTableHead>
            <SortableTableHead class="h-7 w-64 px-2" :active="sortKey === 'user'" :direction="sortDirection" @sort="changeSort('user')">Пользователь</SortableTableHead>
            <SortableTableHead class="h-7 w-28 px-2" :active="sortKey === 'commit'" :direction="sortDirection" @sort="changeSort('commit')">Коммит</SortableTableHead>
            <SortableTableHead class="h-7 px-2" :active="sortKey === 'comment'" :direction="sortDirection" @sort="changeSort('comment')">Комментарий</SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="entry in displayedEntries"
            :key="entry.id"
            :class="cn('cursor-default', selectedId === entry.id && 'bg-accent text-accent-foreground')"
            :aria-current="selectedId === entry.id ? 'true' : undefined"
            @click="openEntry(entry)"
          >
            <TableCell class="whitespace-nowrap px-2 py-1 text-xs">{{ entry.date }}</TableCell>
            <TableCell class="max-w-64 px-2 py-1 text-xs">
              <div class="truncate font-medium" :title="entry.user">{{ entry.user }}</div>
              <div v-if="entry.computer" class="truncate text-muted-foreground" :title="entry.computer">{{ entry.computer }}</div>
            </TableCell>
            <TableCell class="whitespace-nowrap px-2 py-1 text-xs"><Badge variant="secondary">{{ entry.commit }}</Badge></TableCell>
            <TableCell class="max-w-96 truncate px-2 py-1 text-xs" :title="entry.comment">{{ entry.comment }}</TableCell>
          </TableRow>
          <TableRow v-if="displayedEntries.length === 0">
            <TableCell colspan="4" class="h-16 text-center text-muted-foreground">По заданным фильтрам ничего не найдено.</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </main>
</template>

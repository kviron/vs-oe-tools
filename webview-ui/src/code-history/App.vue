<script setup lang="ts">
import { Clock01Icon, Search01Icon, SourceCodeIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import type { CodeHistoryHostMessage, CodeHistoryListEntry } from '../../../src/core/webviewProtocol';
import { splitWorkDescriptionObjectIds } from '../../../src/features/production-tasks/workDescriptionLinks';
import SortableTableHead from '@/components/SortableTableHead.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
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

function openTask(id: number): void {
  vscode.postMessage({ command: 'openCodeHistoryTask', id });
}

function commentParts(value: string) {
  return splitWorkDescriptionObjectIds(value, 'task');
}

function changeSort(key: SortKey): void {
  const next = nextSort(sortKey.value, sortDirection.value, key);
  sortKey.value = key;
  sortDirection.value = next;
}

vscode.postMessage({ command: 'codeHistoryReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col gap-3 overflow-hidden bg-background p-3 text-foreground">
    <header class="flex shrink-0 items-center gap-3">
      <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <HugeiconsIcon :icon="SourceCodeIcon" class="size-5 text-primary" />
      </div>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-base font-semibold">{{ title }}</h1>
        <p class="truncate text-xs text-muted-foreground">{{ subtitle || 'История изменений исходного кода' }}</p>
      </div>
      <Badge v-if="!loading && !error" variant="secondary">{{ displayedEntries.length }} / {{ entries.length }}</Badge>
    </header>

    <Card v-if="!loading && !error && entries.length" size="sm" class="shrink-0 gap-0 py-0">
      <CardContent class="grid items-center gap-2 p-2 sm:grid-cols-3 lg:grid-cols-[auto_minmax(12rem,1.4fr)_minmax(11rem,1fr)_minmax(9rem,0.8fr)]">
        <div class="hidden items-center gap-2 px-1 text-xs font-medium text-muted-foreground lg:flex">
          <HugeiconsIcon :icon="Search01Icon" />
          <span>Фильтры</span>
        </div>
        <Field class="gap-0"><FieldLabel for="history-text-filter" class="sr-only">Дата или комментарий</FieldLabel><InputGroup><InputGroupAddon><HugeiconsIcon :icon="Search01Icon" /></InputGroupAddon><InputGroupInput id="history-text-filter" v-model="textFilter" type="search" placeholder="Дата или комментарий…" /></InputGroup></Field>
        <Field class="gap-0"><FieldLabel for="history-user-filter" class="sr-only">Пользователь</FieldLabel><InputGroup><InputGroupAddon><HugeiconsIcon :icon="Search01Icon" /></InputGroupAddon><InputGroupInput id="history-user-filter" v-model="userFilter" type="search" placeholder="Пользователь или компьютер…" /></InputGroup></Field>
        <Field class="gap-0"><FieldLabel for="history-commit-filter" class="sr-only">Ревизия</FieldLabel><InputGroup><InputGroupAddon><HugeiconsIcon :icon="Search01Icon" /></InputGroupAddon><InputGroupInput id="history-commit-filter" v-model="commitFilter" type="search" placeholder="Ревизия, например r145401…" /></InputGroup></Field>
      </CardContent>
    </Card>

    <Card v-if="loading" size="sm" class="min-h-0 flex-1">
      <CardHeader><CardTitle>Загрузка истории</CardTitle><CardDescription>Получаем и сопоставляем ревизии SVN</CardDescription></CardHeader>
      <CardContent class="flex flex-col gap-2"><Skeleton v-for="index in 7" :key="index" class="h-9 w-full" /></CardContent>
    </Card>

    <Empty v-else-if="error" class="min-h-0 flex-1 rounded-lg border bg-card py-8">
      <EmptyHeader><EmptyTitle>Не удалось загрузить историю</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader>
    </Empty>

    <Empty v-else-if="entries.length === 0" class="min-h-0 flex-1 rounded-lg border bg-card py-8">
      <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon :icon="Clock01Icon" /></EmptyMedia><EmptyTitle>История не найдена</EmptyTitle><EmptyDescription>Откройте историю из редактора, проводника или быстрого перехода.</EmptyDescription></EmptyHeader>
    </Empty>

    <Card v-else size="sm" class="min-h-0 flex-1 gap-0 py-0">
      <CardHeader class="sr-only"><CardTitle>Изменения</CardTitle><CardDescription>Таблица истории изменений. Двойной щелчок открывает сравнение.</CardDescription></CardHeader>
      <CardContent class="min-h-0 flex-1 p-0">
        <Table container-class="h-full" class="min-w-[48rem]">
          <TableHeader class="sticky top-0 z-10 bg-card">
            <TableRow>
              <SortableTableHead class="h-8 w-44 px-3" :active="sortKey === 'date'" :direction="sortDirection" @sort="changeSort('date')">Дата</SortableTableHead>
              <SortableTableHead class="h-8 w-56 px-3" :active="sortKey === 'user'" :direction="sortDirection" @sort="changeSort('user')">Пользователь</SortableTableHead>
              <SortableTableHead class="h-8 w-28 px-3" :active="sortKey === 'commit'" :direction="sortDirection" @sort="changeSort('commit')">Ревизия</SortableTableHead>
              <SortableTableHead class="h-8 px-3" :active="sortKey === 'comment'" :direction="sortDirection" @sort="changeSort('comment')">Комментарий</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="entry in displayedEntries" :key="entry.id" tabindex="0" class="h-10 cursor-default" :data-row-selected="selectedId === entry.id ? '' : undefined" :aria-current="selectedId === entry.id ? 'true' : undefined" @dblclick="openEntry(entry)" @keydown.enter.prevent="openEntry(entry)">
              <TableCell class="whitespace-nowrap px-3 py-1.5 text-xs tabular-nums">{{ entry.date }}</TableCell>
              <TableCell class="max-w-56 px-3 py-1.5 text-xs"><div class="truncate font-medium" :title="entry.user">{{ entry.user }}</div><div v-if="entry.computer" class="truncate text-muted-foreground" :title="entry.computer">{{ entry.computer }}</div></TableCell>
              <TableCell class="whitespace-nowrap px-3 py-1.5 font-mono text-xs"><Badge variant="outline">{{ entry.commit }}</Badge></TableCell>
              <TableCell class="max-w-[32rem] px-3 py-1.5 text-xs" :title="entry.comment"><span class="line-clamp-2"><template v-for="(part, index) in commentParts(entry.comment)" :key="index"><Button v-if="part.id && part.kind === 'task'" variant="link" class="inline h-auto cursor-pointer p-0 align-baseline text-xs leading-[inherit]" :title="`Открыть задачу ${part.id}`" @click.stop="openTask(part.id)">{{ part.text }}</Button><span v-else>{{ part.text }}</span></template></span></TableCell>
            </TableRow>
            <TableRow v-if="displayedEntries.length === 0"><TableCell colspan="4" class="h-24 text-center text-muted-foreground">По заданным фильтрам ничего не найдено.</TableCell></TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </main>
</template>

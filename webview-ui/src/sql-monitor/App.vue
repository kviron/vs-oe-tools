<script setup lang="ts">
import type { SqlMonitorHostMessage } from '../../../src/core/webviewProtocol';
import type { SqlOperation, SqlQueryRecord, SqlQueryStatus } from '../../../src/features/sql-monitor/models';
import { computed, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { vscode } from '@/vscode';
import { formatId, formatTableValue } from '@/lib/formatId';

const operations: SqlOperation[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DDL', 'OTHER'];
const statuses: Array<{ value: SqlQueryStatus; label: string }> = [
  { value: 'running', label: 'Выполняется' },
  { value: 'success', label: 'Успешно' },
  { value: 'error', label: 'Ошибки' },
];
const records = ref<SqlQueryRecord[]>([]);
const selectedId = ref<number>();
const search = ref('');
const operationFilters = ref(new Set<SqlOperation>(operations));
const statusFilters = ref(new Set<SqlQueryStatus>(statuses.map(status => status.value)));

const selectedRecord = computed(() => records.value.find(record => record.id === selectedId.value));
const filteredRecords = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase('ru');
  return records.value
    .filter(record => operationFilters.value.has(record.operation) && statusFilters.value.has(record.status))
    .filter(record => !needle || `${record.source}\n${record.text}`.toLocaleLowerCase('ru').includes(needle))
    .slice()
    .reverse();
});

window.addEventListener('message', (event: MessageEvent<SqlMonitorHostMessage>) => {
  const message = event.data;
  if (message.command === 'sqlMonitorSnapshot') {
    records.value = message.records;
    selectedId.value = records.value.at(-1)?.id;
  } else if (message.command === 'sqlQueryChanged') {
    const index = records.value.findIndex(record => record.id === message.record.id);
    if (index < 0) records.value.push(message.record);
    else records.value[index] = message.record;
    if (selectedId.value === undefined) selectedId.value = message.record.id;
  } else if (message.command === 'sqlMonitorCleared') {
    records.value = [];
    selectedId.value = undefined;
  }
});

function toggleOperation(operation: SqlOperation, enabled: boolean): void {
  const next = new Set(operationFilters.value);
  if (enabled) next.add(operation); else next.delete(operation);
  operationFilters.value = next;
}

function toggleStatus(status: SqlQueryStatus, enabled: boolean): void {
  const next = new Set(statusFilters.value);
  if (enabled) next.add(status); else next.delete(status);
  statusFilters.value = next;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('ru-RU', { hour12: false, fractionalSecondDigits: 3 });
}

function formatDuration(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(2)} мс`;
}

function statusLabel(status: SqlQueryStatus): string {
  return statuses.find(candidate => candidate.value === status)?.label ?? status;
}

function clearLog(): void {
  vscode.postMessage({ command: 'clearSqlMonitor' });
}

vscode.postMessage({ command: 'sqlMonitorReady' });
</script>

<template>
  <main class="grid h-screen min-h-0 grid-rows-[minmax(16rem,3fr)_minmax(12rem,2fr)] gap-1 p-1">
    <section class="flex min-h-0 flex-col gap-1">
      <header class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Input v-model="search" class="h-7 min-w-48 max-w-sm" placeholder="Поиск по SQL или источнику" />
        <div class="flex flex-wrap items-center gap-2" aria-label="Типы SQL-запросов">
          <label v-for="operation in operations" :key="operation" class="flex items-center gap-1 text-xs">
            <Checkbox
              :model-value="operationFilters.has(operation)"
              @update:model-value="toggleOperation(operation, Boolean($event))"
            />
            {{ operation }}
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-2" aria-label="Состояния запросов">
          <label v-for="status in statuses" :key="status.value" class="flex items-center gap-1 text-xs">
            <Checkbox
              :model-value="statusFilters.has(status.value)"
              @update:model-value="toggleStatus(status.value, Boolean($event))"
            />
            {{ status.label }}
          </label>
        </div>
        <Button class="ml-auto" variant="outline" size="sm" @click="clearLog">Очистить</Button>
      </header>

      <div class="min-h-0 flex-1 overflow-auto border">
        <Table v-if="filteredRecords.length">
          <TableHeader class="sticky top-0 bg-background">
            <TableRow>
              <TableHead class="h-7 px-2">№</TableHead>
              <TableHead class="h-7 px-2">Время</TableHead>
              <TableHead class="h-7 px-2">Операция</TableHead>
              <TableHead class="h-7 px-2">Источник</TableHead>
              <TableHead class="h-7 px-2">Состояние</TableHead>
              <TableHead class="h-7 px-2 text-right">Строк</TableHead>
              <TableHead class="h-7 px-2 text-right">Время выполнения</TableHead>
              <TableHead class="h-7 px-2">База</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="record in filteredRecords"
              :key="record.id"
              :data-state="selectedId === record.id ? 'selected' : undefined"
              class="cursor-pointer"
              tabindex="0"
              @click="selectedId = record.id"
              @keydown.enter="selectedId = record.id"
            >
              <TableCell class="px-2 py-1">{{ formatId(record.id) }}</TableCell>
              <TableCell class="whitespace-nowrap px-2 py-1">{{ formatTime(record.startedAt) }}</TableCell>
              <TableCell class="px-2 py-1 font-medium">{{ record.operation }}</TableCell>
              <TableCell class="max-w-72 truncate px-2 py-1" :title="record.source">{{ record.source }}</TableCell>
              <TableCell class="px-2 py-1">{{ statusLabel(record.status) }}</TableCell>
              <TableCell class="px-2 py-1 text-right">{{ record.rowCount ?? '—' }}</TableCell>
              <TableCell class="whitespace-nowrap px-2 py-1 text-right">{{ formatDuration(record.durationMs) }}</TableCell>
              <TableCell class="max-w-48 truncate px-2 py-1" :title="record.database">{{ record.database }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Empty v-else class="h-full min-h-0 py-8">
          <EmptyHeader>
            <EmptyTitle>{{ records.length ? 'Нет запросов по выбранным фильтрам' : 'SQL-запросов пока нет' }}</EmptyTitle>
            <EmptyDescription>Запросы расширения будут появляться здесь в реальном времени.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </section>

    <section class="min-h-0 overflow-hidden border">
      <Tabs v-if="selectedRecord" default-value="sql" class="h-full min-h-0 gap-0">
        <TabsList variant="line">
          <TabsTrigger value="sql">SQL-запрос</TabsTrigger>
          <TabsTrigger value="result">Результат</TabsTrigger>
        </TabsList>
        <TabsContent value="sql" class="min-h-0 flex-1 overflow-auto p-2">
          <pre class="whitespace-pre-wrap font-mono text-xs">{{ selectedRecord.text }}</pre>
          <div v-if="selectedRecord.parameters.length" class="mt-3 flex flex-col gap-1">
            <h3 class="text-xs font-medium">Параметры</h3>
            <pre class="whitespace-pre-wrap font-mono text-xs">{{ JSON.stringify(selectedRecord.parameters, null, 2) }}</pre>
          </div>
        </TabsContent>
        <TabsContent value="result" class="min-h-0 flex-1 overflow-auto p-1">
          <Empty v-if="selectedRecord.status === 'running'" class="min-h-0 py-8">
            <EmptyHeader><EmptyTitle>Запрос выполняется…</EmptyTitle></EmptyHeader>
          </Empty>
          <Empty v-else-if="selectedRecord.error" class="min-h-0 py-8">
            <EmptyHeader><EmptyTitle>Ошибка выполнения</EmptyTitle><EmptyDescription>{{ selectedRecord.error }}</EmptyDescription></EmptyHeader>
          </Empty>
          <Table v-else-if="selectedRecord.columns.length">
            <TableHeader><TableRow><TableHead v-for="column in selectedRecord.columns" :key="column" class="h-7 px-2">{{ column }}</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow v-for="(row, rowIndex) in selectedRecord.rows" :key="rowIndex">
                <TableCell v-for="column in selectedRecord.columns" :key="column" class="max-w-96 px-2 py-1 font-mono" :title="formatTableValue(column, row[column])">
                  <span class="block truncate">{{ formatTableValue(column, row[column]) }}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Empty v-else class="min-h-0 py-8">
            <EmptyHeader><EmptyTitle>Запрос не вернул таблицу</EmptyTitle><EmptyDescription>Обработано строк: {{ selectedRecord.rowCount ?? 0 }}.</EmptyDescription></EmptyHeader>
          </Empty>
          <p v-if="selectedRecord.resultTruncated" class="p-2 text-xs text-muted-foreground">Показаны первые 500 строк результата.</p>
        </TabsContent>
      </Tabs>
      <Empty v-else class="h-full min-h-0 py-8">
        <EmptyHeader><EmptyTitle>Выберите запрос</EmptyTitle><EmptyDescription>SQL и результат появятся в этой области.</EmptyDescription></EmptyHeader>
      </Empty>
    </section>
  </main>
</template>

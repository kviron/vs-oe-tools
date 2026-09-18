<script setup lang="ts">
import { Activity01Icon, Delete02Icon, FilterIcon, PauseIcon, PlayIcon, Search01Icon, SqlIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import type { SqlMonitorHostMessage } from '../../../src/core/webviewProtocol';
import type { SqlOperation, SqlQueryRecord, SqlQueryStatus } from '../../../src/features/sql-monitor/models';
import { classifySqlQuery, sqlQueryCategories, sqlQueryCategoryLabel, type SqlQueryCategory } from '../../../src/features/sql-monitor/queryCategory';
import { computed, ref } from 'vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import SortableTableHead from '@/components/SortableTableHead.vue';
import SqlCodeEditor from '@/components/SqlCodeEditor.vue';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { vscode } from '@/vscode';
import { formatId, formatTableValue } from '@/lib/formatId';
import { nextSort, sortedRows, type SortDirection } from '@/lib/tableSort';

const operations: SqlOperation[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DDL', 'OTHER'];
const statuses: Array<{ value: SqlQueryStatus; label: string }> = [
  { value: 'running', label: 'Выполняется' },
  { value: 'success', label: 'Успешно' },
  { value: 'error', label: 'Ошибки' },
];
const records = ref<SqlQueryRecord[]>([]);
const paused = ref(false);
const selectedId = ref<number>();
const search = ref('');
const operationFilters = ref(new Set<SqlOperation>(operations));
const statusFilters = ref(new Set<SqlQueryStatus>(statuses.map(status => status.value)));
const categoryFilters = ref(new Set<SqlQueryCategory>(['application']));
const recordSortKey = ref<string>();
const recordSortDirection = ref<SortDirection>('asc');
const resultSortKey = ref<string>();
const resultSortDirection = ref<SortDirection>('asc');

const selectedRecord = computed(() => records.value.find(record => record.id === selectedId.value));
const runningCount = computed(() => records.value.filter(record => record.status === 'running').length);
const activeFilterCount = computed(() => Number(operationFilters.value.size !== operations.length)
  + Number(statusFilters.value.size !== statuses.length)
  + Number(categoryFilters.value.size !== 1 || !categoryFilters.value.has('application')));
const filteredRecords = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase('ru');
  const filtered = records.value
    .filter(record => operationFilters.value.has(record.operation) && statusFilters.value.has(record.status))
    .filter(record => categoryFilters.value.has(classifySqlQuery(record)))
    .filter(record => !needle || `${record.source}\n${record.userName ?? ''}\n${record.firstTable ?? ''}\n${record.text}`.toLocaleLowerCase('ru').includes(needle))
    .slice()
    .reverse();
  return sortedRows(filtered, recordSortKey.value, recordSortDirection.value, (record, key) => record[key as keyof SqlQueryRecord]);
});
const sortedSelectedRows = computed(() => selectedRecord.value
  ? sortedRows(selectedRecord.value.rows, resultSortKey.value, resultSortDirection.value, (row, key) => row[key])
  : []);

window.addEventListener('message', (event: MessageEvent<SqlMonitorHostMessage>) => {
  const message = event.data;
  if (message.command === 'sqlMonitorSnapshot') {
    records.value = message.records;
    paused.value = message.paused;
    selectedId.value = records.value.at(-1)?.id;
  } else if (message.command === 'sqlQueryChanged') {
    const index = records.value.findIndex(record => record.id === message.record.id);
    if (index < 0) records.value.push(message.record);
    else records.value[index] = message.record;
    if (selectedId.value === undefined) selectedId.value = message.record.id;
  } else if (message.command === 'sqlMonitorCleared') {
    records.value = [];
    selectedId.value = undefined;
  } else if (message.command === 'sqlMonitorPaused') {
    paused.value = message.paused;
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

function toggleCategory(category: SqlQueryCategory, enabled: boolean): void {
  const next = new Set(categoryFilters.value);
  if (enabled) next.add(category); else next.delete(category);
  categoryFilters.value = next;
}

function categoryCount(category: SqlQueryCategory): number {
  return records.value.filter(record => classifySqlQuery(record) === category).length;
}

function formatTime(value: string): string {
	return new Date(value).toLocaleTimeString('ru-RU', { hour12: false, fractionalSecondDigits: 3 });
}

function queryId(record: SqlQueryRecord): number {
  return record.externalQueryId ?? record.id;
}

function formatDuration(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(2)} мс`;
}

function statusLabel(status: SqlQueryStatus): string {
  return statuses.find(candidate => candidate.value === status)?.label ?? status;
}

function queryCountLabel(value: number): string {
  const lastTwoDigits = value % 100;
  const lastDigit = value % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${value} запросов`;
  if (lastDigit === 1) return `${value} запрос`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${value} запроса`;
  return `${value} запросов`;
}

function statusVariant(status: SqlQueryStatus): 'statusWork' | 'statusDone' | 'destructive' {
  if (status === 'running') return 'statusWork';
  if (status === 'success') return 'statusDone';
  return 'destructive';
}

function resetFilters(): void {
  operationFilters.value = new Set(operations);
  statusFilters.value = new Set(statuses.map(status => status.value));
  categoryFilters.value = new Set(['application']);
}

function clearLog(): void {
  vscode.postMessage({ command: 'clearSqlMonitor' });
}

function togglePaused(): void {
  vscode.postMessage({ command: 'setSqlMonitorPaused', paused: !paused.value });
}

function sortRecords(key: string): void {
  recordSortDirection.value = nextSort(recordSortKey.value, recordSortDirection.value, key);
  recordSortKey.value = key;
}

function sortResult(key: string): void {
  resultSortDirection.value = nextSort(resultSortKey.value, resultSortDirection.value, key);
  resultSortKey.value = key;
}

vscode.postMessage({ command: 'sqlMonitorReady' });
</script>

<template>
  <main class="grid h-screen min-h-0 min-w-0 grid-rows-[auto_minmax(18rem,3fr)_minmax(14rem,2fr)] gap-4 overflow-hidden bg-muted/25 p-4 text-foreground lg:p-6">
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-1">
        <p class="text-xs text-muted-foreground">Восточный Экспресс / Инструменты / База данных</p>
        <h1 class="truncate text-2xl font-semibold tracking-tight">SQL Monitor</h1>
        <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Журнал запросов в реальном времени</span>
          <span aria-hidden="true">·</span>
          <span>{{ queryCountLabel(records.length) }}</span>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Badge :variant="paused ? 'statusPaused' : 'statusWork'">
          <HugeiconsIcon :icon="paused ? PauseIcon : Activity01Icon" data-icon="inline-start" />
          {{ paused ? 'Сбор приостановлен' : 'Мониторинг активен' }}
        </Badge>
        <Button :variant="paused ? 'default' : 'outline'" size="sm" @click="togglePaused">
          <HugeiconsIcon :icon="paused ? PlayIcon : PauseIcon" data-icon="inline-start" />
          {{ paused ? 'Продолжить' : 'Пауза' }}
        </Button>
        <Button variant="outline" size="sm" :disabled="!records.length" @click="clearLog">
          <HugeiconsIcon :icon="Delete02Icon" data-icon="inline-start" />
          Очистить
        </Button>
      </div>
    </header>

    <Card size="sm" class="min-h-0 min-w-0 gap-0 py-0">
      <CardHeader class="shrink-0 gap-3 border-b py-3">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <CardTitle>Журнал запросов</CardTitle>
            <Badge variant="secondary">{{ filteredRecords.length }} из {{ records.length }}</Badge>
            <Badge v-if="runningCount" variant="statusWork">{{ runningCount }} выполняется</Badge>
          </div>
          <Field class="min-w-52 flex-1 sm:ml-auto sm:max-w-md">
            <FieldLabel for="sql-monitor-search" class="sr-only">Поиск по журналу SQL</FieldLabel>
            <InputGroup>
              <InputGroupAddon><HugeiconsIcon :icon="Search01Icon" /></InputGroupAddon>
              <InputGroupInput id="sql-monitor-search" v-model="search" type="search" placeholder="SQL, источник, пользователь или таблица…" />
            </InputGroup>
          </Field>
          <Popover>
            <PopoverTrigger as-child>
              <Button variant="outline" size="sm">
                <HugeiconsIcon :icon="FilterIcon" data-icon="inline-start" />
                Фильтры
                <Badge v-if="activeFilterCount" variant="secondary">{{ activeFilterCount }}</Badge>
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-80" align="end">
              <PopoverHeader>
                <div class="flex items-center justify-between gap-3">
                  <PopoverTitle>Фильтры журнала</PopoverTitle>
                  <Button variant="ghost" size="xs" :disabled="!activeFilterCount" @click="resetFilters">Сбросить</Button>
                </div>
                <PopoverDescription>Настройте операции, состояния и источники запросов.</PopoverDescription>
              </PopoverHeader>
              <Separator class="my-3" />
              <FieldGroup class="max-h-[min(28rem,70vh)] gap-4 overflow-auto pr-1">
                <FieldSet>
                  <FieldLegend variant="label">Операции</FieldLegend>
                  <FieldGroup class="grid grid-cols-2 gap-2">
                    <Field v-for="operation in operations" :key="operation" orientation="horizontal" class="gap-2">
                      <Checkbox :id="`sql-operation-${operation}`" :model-value="operationFilters.has(operation)" @update:model-value="toggleOperation(operation, Boolean($event))" />
                      <FieldLabel :for="`sql-operation-${operation}`" class="font-mono font-normal">{{ operation }}</FieldLabel>
                    </Field>
                  </FieldGroup>
                </FieldSet>
                <FieldSet>
                  <FieldLegend variant="label">Состояние</FieldLegend>
                  <FieldGroup class="gap-2">
                    <Field v-for="status in statuses" :key="status.value" orientation="horizontal" class="gap-2">
                      <Checkbox :id="`sql-status-${status.value}`" :model-value="statusFilters.has(status.value)" @update:model-value="toggleStatus(status.value, Boolean($event))" />
                      <FieldLabel :for="`sql-status-${status.value}`" class="font-normal">{{ status.label }}</FieldLabel>
                    </Field>
                  </FieldGroup>
                </FieldSet>
                <FieldSet>
                  <FieldLegend variant="label">Категории</FieldLegend>
                  <FieldGroup class="gap-2">
                    <Field v-for="category in sqlQueryCategories" :key="category.value" orientation="horizontal" class="gap-2">
                      <Checkbox :id="`sql-category-${category.value}`" :model-value="categoryFilters.has(category.value)" @update:model-value="toggleCategory(category.value, Boolean($event))" />
                      <FieldLabel :for="`sql-category-${category.value}`" class="min-w-0 font-normal">
                        <span class="truncate">{{ category.label }}</span>
                        <Badge variant="secondary">{{ categoryCount(category.value) }}</Badge>
                      </FieldLabel>
                    </Field>
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            </PopoverContent>
          </Popover>
        </div>
        <CardDescription>Выберите строку, чтобы посмотреть SQL, параметры и результат. Ячейки можно выделять и копировать.</CardDescription>
      </CardHeader>

      <CardContent class="flex min-h-0 min-w-0 flex-1 flex-col px-0">
        <Table v-if="filteredRecords.length" container-class="min-h-0 min-w-0 flex-1 overflow-auto" class="min-w-max">
		  <TableHeader class="sticky top-0 z-10 bg-card">
			<TableRow>
              <SortableTableHead class="h-8 px-3" :active="recordSortKey === 'id'" :direction="recordSortDirection" @sort="sortRecords('id')">№</SortableTableHead>
              <SortableTableHead class="h-8 px-3" :active="recordSortKey === 'userName'" :direction="recordSortDirection" @sort="sortRecords('userName')">Пользователь</SortableTableHead>
              <SortableTableHead class="h-8 px-3" :active="recordSortKey === 'startedAt'" :direction="recordSortDirection" @sort="sortRecords('startedAt')">Время</SortableTableHead>
              <SortableTableHead class="h-8 px-3" :active="recordSortKey === 'operation'" :direction="recordSortDirection" @sort="sortRecords('operation')">Операция</SortableTableHead>
              <SortableTableHead class="h-8 px-3">Категория</SortableTableHead>
              <SortableTableHead class="h-8 px-3" :active="recordSortKey === 'source'" :direction="recordSortDirection" @sort="sortRecords('source')">Источник</SortableTableHead>
              <SortableTableHead class="h-8 px-3" :active="recordSortKey === 'status'" :direction="recordSortDirection" @sort="sortRecords('status')">Состояние</SortableTableHead>
              <SortableTableHead class="h-8 px-3" :active="recordSortKey === 'rowCount'" :direction="recordSortDirection" @sort="sortRecords('rowCount')">Строк</SortableTableHead>
              <SortableTableHead class="h-8 px-3" :active="recordSortKey === 'firstTable'" :direction="recordSortDirection" @sort="sortRecords('firstTable')">Первая таблица</SortableTableHead>
              <SortableTableHead class="h-8 px-3">SQL</SortableTableHead>
              <SortableTableHead class="h-8 px-3" :active="recordSortKey === 'openTimeMs'" :direction="recordSortDirection" @sort="sortRecords('openTimeMs')">Открытие</SortableTableHead>
              <SortableTableHead class="h-8 px-3" :active="recordSortKey === 'execTimeMs'" :direction="recordSortDirection" @sort="sortRecords('execTimeMs')">Выполнение</SortableTableHead>
              <SortableTableHead class="h-8 px-3" :active="recordSortKey === 'durationMs'" :direction="recordSortDirection" @sort="sortRecords('durationMs')">Всего</SortableTableHead>
              <SortableTableHead class="h-8 px-3" :active="recordSortKey === 'database'" :direction="recordSortDirection" @sort="sortRecords('database')">База</SortableTableHead>
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
              <TableCell class="px-3 py-1 font-mono tabular-nums">{{ formatId(queryId(record)) }}</TableCell>
              <TableCell class="max-w-48 truncate px-3 py-1" :title="record.userName">{{ record.userName ?? '—' }}</TableCell>
              <TableCell class="whitespace-nowrap px-3 py-1 tabular-nums">{{ record.creationTimeLabel ?? formatTime(record.startedAt) }}</TableCell>
              <TableCell class="px-3 py-1"><Badge variant="outline" class="font-mono">{{ record.operation }}</Badge></TableCell>
              <TableCell class="whitespace-nowrap px-3 py-1"><Badge variant="secondary">{{ sqlQueryCategoryLabel(classifySqlQuery(record)) }}</Badge></TableCell>
              <TableCell class="max-w-72 truncate px-3 py-1" :title="record.source">{{ record.source }}</TableCell>
              <TableCell class="px-3 py-1"><Badge :variant="statusVariant(record.status)">{{ statusLabel(record.status) }}</Badge></TableCell>
              <TableCell class="px-3 py-1 text-right tabular-nums">{{ record.rowCount ?? '—' }}</TableCell>
              <TableCell class="max-w-48 truncate px-3 py-1 font-mono" :title="record.firstTable">{{ record.firstTable ?? '—' }}</TableCell>
              <TableCell class="max-w-96 truncate px-3 py-1 font-mono" :title="record.text">{{ record.text }}</TableCell>
              <TableCell class="whitespace-nowrap px-3 py-1 text-right tabular-nums">{{ formatDuration(record.openTimeMs) }}</TableCell>
              <TableCell class="whitespace-nowrap px-3 py-1 text-right tabular-nums">{{ formatDuration(record.execTimeMs) }}</TableCell>
              <TableCell class="whitespace-nowrap px-3 py-1 text-right tabular-nums">{{ formatDuration(record.durationMs) }}</TableCell>
              <TableCell class="max-w-48 truncate px-3 py-1 font-mono" :title="record.database">{{ record.database }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Empty v-else class="min-h-0 flex-1">
          <EmptyHeader>
            <EmptyTitle>{{ records.length ? 'Нет запросов по выбранным фильтрам' : 'SQL-запросов пока нет' }}</EmptyTitle>
            <EmptyDescription>{{ records.length ? 'Измените строку поиска или настройки фильтров.' : 'Запросы расширения и клиента ВЭ будут появляться здесь автоматически.' }}</EmptyDescription>
          </EmptyHeader>
          <Button v-if="records.length" variant="outline" size="sm" @click="resetFilters">Сбросить фильтры</Button>
        </Empty>
      </CardContent>
      <CardFooter class="shrink-0 flex-wrap justify-between gap-2 border-t py-2">
        <p class="text-xs text-muted-foreground">Показано {{ filteredRecords.length }} · всего {{ records.length }}</p>
        <p class="text-xs text-muted-foreground">Новые запросы появляются автоматически</p>
      </CardFooter>
    </Card>

    <Card size="sm" class="min-h-0 min-w-0 gap-0 py-0">
      <Tabs v-if="selectedRecord" default-value="sql" class="h-full min-h-0 gap-0">
        <CardHeader class="shrink-0 flex-row flex-wrap items-center justify-between gap-3 border-b py-2">
          <div class="flex min-w-0 items-center gap-2">
            <HugeiconsIcon :icon="SqlIcon" />
            <CardTitle class="truncate">Запрос {{ formatId(queryId(selectedRecord)) }}</CardTitle>
            <Badge :variant="statusVariant(selectedRecord.status)">{{ statusLabel(selectedRecord.status) }}</Badge>
          </div>
          <TabsList variant="line">
            <TabsTrigger value="sql">SQL-запрос</TabsTrigger>
            <TabsTrigger value="result">Результат <Badge v-if="selectedRecord.columns.length" variant="secondary">{{ selectedRecord.rowCount ?? selectedRecord.rows.length }}</Badge></TabsTrigger>
          </TabsList>
        </CardHeader>
		<TabsContent value="sql" class="min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 data-[state=active]:flex">
		  <SqlCodeEditor :model-value="selectedRecord.text" class="min-h-24 flex-1 rounded-md border" read-only line-wrapping aria-label="SQL выбранного запроса" />
		  <div v-if="selectedRecord.parameters.length" class="flex max-h-36 shrink-0 flex-col gap-2 overflow-auto rounded-md border bg-muted/20 p-3">
            <div class="flex items-center justify-between gap-2"><h3 class="text-xs font-medium">Параметры</h3><Badge variant="secondary">{{ selectedRecord.parameters.length }}</Badge></div>
            <pre class="whitespace-pre-wrap font-mono text-xs">{{ JSON.stringify(selectedRecord.parameters, null, 2) }}</pre>
          </div>
        </TabsContent>
        <TabsContent value="result" class="min-h-0 flex-1 overflow-hidden">
          <Empty v-if="selectedRecord.status === 'running'" class="min-h-0 py-8">
            <EmptyHeader><EmptyTitle>Запрос выполняется…</EmptyTitle></EmptyHeader>
          </Empty>
          <Empty v-else-if="selectedRecord.error" class="min-h-0 py-8">
            <EmptyHeader><EmptyTitle>Ошибка выполнения</EmptyTitle><EmptyDescription>{{ selectedRecord.error }}</EmptyDescription></EmptyHeader>
          </Empty>
          <Table v-else-if="selectedRecord.columns.length" container-class="h-full min-h-0 min-w-0 overflow-auto" class="min-w-full">
            <TableHeader class="sticky top-0 z-10 bg-card"><TableRow><SortableTableHead v-for="column in selectedRecord.columns" :key="column" class="h-8 px-3" :active="resultSortKey === column" :direction="resultSortDirection" @sort="sortResult(column)">{{ column }}</SortableTableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow v-for="(row, rowIndex) in sortedSelectedRows" :key="rowIndex">
                <TableCell v-for="column in selectedRecord.columns" :key="column" class="max-w-96 px-3 py-1 font-mono" :title="formatTableValue(column, row[column])">
                  <span class="block truncate">{{ formatTableValue(column, row[column]) }}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Empty v-else class="min-h-0 py-8">
            <EmptyHeader><EmptyTitle>Запрос не вернул таблицу</EmptyTitle><EmptyDescription>Обработано строк: {{ selectedRecord.rowCount ?? 0 }}.</EmptyDescription></EmptyHeader>
          </Empty>
          <p v-if="selectedRecord.resultTruncated" class="border-t p-2 text-xs text-muted-foreground">Показаны первые 500 строк результата.</p>
        </TabsContent>
      </Tabs>
      <Empty v-else class="h-full min-h-0 py-8">
        <EmptyHeader><EmptyTitle>Выберите запрос</EmptyTitle><EmptyDescription>SQL и результат появятся в этой области.</EmptyDescription></EmptyHeader>
      </Empty>
    </Card>
  </main>
</template>

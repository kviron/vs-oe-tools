<script setup lang="ts">
import { ArrowDown01Icon, Edit02Icon, FileExportIcon, RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import type { ObjectViewHostMessage } from '../../../src/core/webviewProtocol';
import type { ObjectFieldRow, ObjectViewResult } from '../../../src/features/classes/models';
import SortableTableHead from '@/components/SortableTableHead.vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { vscode } from '@/vscode';

const result = ref<ObjectViewResult>();
const loading = ref(true);
const error = ref('');
const showAttributes = ref(true);
const showProperties = ref(true);
const showEmpty = ref(false);
const sortKey = ref<keyof ObjectFieldRow>('attributeName');
const sortDirection = ref<'asc' | 'desc'>('asc');

const fields = computed(() => (result.value?.fields ?? [])
  .filter(row => (row.kind === 'attribute' ? showAttributes.value : showProperties.value))
  .filter(row => showEmpty.value || !isEmpty(row.value))
  .slice()
  .sort((left, right) => compare(left[sortKey.value], right[sortKey.value]) * (sortDirection.value === 'asc' ? 1 : -1)));

function isEmpty(value: unknown): boolean { return value === null || value === undefined || value === ''; }
function display(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
function compare(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  return String(left).localeCompare(String(right), 'ru', { numeric: true, sensitivity: 'base' });
}
function sort(key: keyof ObjectFieldRow): void {
  if (sortKey.value === key) sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  else { sortKey.value = key; sortDirection.value = 'asc'; }
}
function refresh(): void { vscode.postMessage({ command: 'refreshObjectView' }); }
function copyJson(): void { vscode.postMessage({ command: 'copyObjectJson' }); }

window.addEventListener('message', (event: MessageEvent<ObjectViewHostMessage>) => {
  const message = event.data;
  if (message.command === 'objectViewLoading') { loading.value = true; error.value = ''; }
  else if (message.command === 'objectViewLoaded') { result.value = message.result; loading.value = false; }
  else { error.value = message.message; loading.value = false; }
});
vscode.postMessage({ command: 'objectViewReady' });
</script>

<template>
  <main class="object-view flex h-screen min-h-0 flex-col bg-background p-1 text-foreground">
    <header class="flex shrink-0 flex-wrap items-center gap-3 border-b px-1 py-1">
      <label class="flex items-center gap-1 text-xs"><Checkbox v-model="showAttributes" />Атрибуты</label>
      <label class="flex items-center gap-1 text-xs"><Checkbox v-model="showProperties" />Свойства</label>
      <label class="flex items-center gap-1 text-xs"><Checkbox v-model="showEmpty" />Показывать пустые значения</label>
      <div class="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" :disabled="loading" title="Обновить" @click="refresh"><HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />Обновить</Button>
        <Button variant="outline" size="sm" disabled><HugeiconsIcon :icon="Edit02Icon" data-icon="inline-start" />Правка</Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child><Button variant="outline" size="sm"><HugeiconsIcon :icon="FileExportIcon" data-icon="inline-start" />Экспорт<HugeiconsIcon :icon="ArrowDown01Icon" data-icon="inline-end" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem @select="copyJson">В буфер обмена (JSON)</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    <div v-if="result" class="shrink-0 border-b px-2 py-1 text-xs text-muted-foreground">
      {{ result.className }} «{{ result.name || result.id }}» · ID {{ result.id }}
    </div>
    <div v-if="loading" class="flex flex-col gap-1 p-1"><Skeleton v-for="index in 12" :key="index" class="h-6 w-full" /></div>
    <Empty v-else-if="error" class="min-h-0 flex-1"><EmptyHeader><EmptyTitle>Не удалось открыть объект</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader></Empty>
    <Empty v-else-if="!fields.length" class="min-h-0 flex-1"><EmptyHeader><EmptyTitle>Нет подходящих полей</EmptyTitle><EmptyDescription>Измените фильтры отображения.</EmptyDescription></EmptyHeader></Empty>
    <Table v-else container-class="min-h-0 flex-1 overflow-auto">
      <TableHeader class="sticky top-0 bg-background"><TableRow>
        <SortableTableHead class="h-7 min-w-56 px-2" :active="sortKey === 'attributeName'" :direction="sortDirection" @sort="sort('attributeName')">Имя атрибута</SortableTableHead>
        <SortableTableHead class="h-7 min-w-96 px-2" :active="sortKey === 'value'" :direction="sortDirection" @sort="sort('value')">Значение атрибута</SortableTableHead>
        <SortableTableHead class="h-7 min-w-40 px-2" :active="sortKey === 'tableField'" :direction="sortDirection" @sort="sort('tableField')">Поле таблицы</SortableTableHead>
        <SortableTableHead class="h-7 min-w-32 px-2" :active="sortKey === 'distribution'" :direction="sortDirection" @sort="sort('distribution')">Дистрибуция</SortableTableHead>
      </TableRow></TableHeader>
      <TableBody><TableRow v-for="(field, index) in fields" :key="`${field.kind}-${field.attributeId ?? field.tableField}-${index}`">
        <TableCell class="px-2 py-1" :title="field.kind === 'property' ? 'Свойство таблицы' : `Атрибут ${field.attributeId}`">{{ field.attributeName }}</TableCell>
        <TableCell class="max-w-[48rem] px-2 py-1" :title="display(field.value)"><span class="block truncate">{{ display(field.value) }}</span></TableCell>
        <TableCell class="px-2 py-1">{{ field.tableField }}</TableCell><TableCell class="px-2 py-1">{{ field.distribution }}</TableCell>
      </TableRow></TableBody>
    </Table>
    <footer v-if="result && !loading" class="shrink-0 border-t px-2 py-0.5 text-right text-[0.625rem] text-muted-foreground">Строк: {{ fields.length }}</footer>
  </main>
</template>

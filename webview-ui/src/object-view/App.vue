<script setup lang="ts">
import { ArrowDown01Icon, FileExportIcon, RefreshIcon, Settings02Icon, ViewIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import type { ObjectViewHostMessage } from '../../../src/core/webviewProtocol';
import type { ObjectFieldRow, ObjectViewResult } from '../../../src/features/classes/models';
import SortableTableHead from '@/components/SortableTableHead.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
  <main class="object-view flex h-screen min-h-0 min-w-0 flex-col gap-2 overflow-hidden bg-background p-2 text-foreground">
    <header class="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <div class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <HugeiconsIcon :icon="ViewIcon" class="size-4 text-kind-object" />
      </div>
      <div class="min-w-40 flex-1">
        <h1 class="truncate text-sm font-semibold" :title="result?.name || undefined">{{ result?.name || (loading ? 'Загрузка объекта…' : 'Просмотр объекта') }}</h1>
        <p class="truncate text-[0.6875rem] text-muted-foreground">
          <template v-if="result">{{ result.className }}<template v-if="result.ownerName"> · {{ result.ownerName }}</template><template v-if="result.packageName"> · {{ result.packageName }}</template></template>
          <template v-else>Универсальный просмотр атрибутов и свойств</template>
        </p>
      </div>
      <div v-if="result" class="flex flex-wrap items-center gap-1">
        <Badge variant="object">Объект</Badge>
        <Badge variant="outline">ID {{ result.id }}</Badge>
        <Badge variant="secondary">{{ fields.length }} / {{ result.fields.length }}</Badge>
      </div>
      <div class="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger as-child><Button variant="outline" size="sm"><HugeiconsIcon :icon="Settings02Icon" data-icon="inline-start" />Поля<HugeiconsIcon :icon="ArrowDown01Icon" data-icon="inline-end" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-56">
            <DropdownMenuLabel>Показывать в таблице</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuCheckboxItem :model-value="showAttributes" @update:model-value="showAttributes = $event">Атрибуты</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem :model-value="showProperties" @update:model-value="showProperties = $event">Свойства таблицы</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem :model-value="showEmpty" @update:model-value="showEmpty = $event">Пустые значения</DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="icon-sm" :disabled="loading" aria-label="Обновить" title="Обновить" @click="refresh"><HugeiconsIcon :icon="RefreshIcon" /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child><Button variant="outline" size="icon-sm" :disabled="!result" aria-label="Экспорт" title="Экспорт"><HugeiconsIcon :icon="FileExportIcon" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem @select="copyJson">В буфер обмена (JSON)</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    <div v-if="loading" class="flex min-h-0 flex-1 flex-col gap-1 rounded-lg border bg-card p-1"><Skeleton v-for="index in 12" :key="index" class="h-6 w-full" /></div>
    <Empty v-else-if="error" class="min-h-0 flex-1 rounded-lg border bg-card"><EmptyHeader><EmptyTitle>Не удалось открыть объект</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader></Empty>
    <Empty v-else-if="!fields.length" class="min-h-0 flex-1 rounded-lg border bg-card"><EmptyHeader><EmptyTitle>Нет подходящих полей</EmptyTitle><EmptyDescription>Измените фильтры отображения.</EmptyDescription></EmptyHeader></Empty>
    <Table v-else container-class="min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border bg-card">
      <TableHeader class="sticky top-0 bg-card"><TableRow>
        <SortableTableHead class="h-7 min-w-48 px-2" :active="sortKey === 'attributeName'" :direction="sortDirection" @sort="sort('attributeName')">Имя</SortableTableHead>
        <SortableTableHead class="h-7 min-w-72 px-2" :active="sortKey === 'value'" :direction="sortDirection" @sort="sort('value')">Значение</SortableTableHead>
        <SortableTableHead class="h-7 min-w-32 px-2" :active="sortKey === 'tableField'" :direction="sortDirection" @sort="sort('tableField')">Поле таблицы</SortableTableHead>
        <SortableTableHead class="h-7 min-w-28 px-2" :active="sortKey === 'distribution'" :direction="sortDirection" @sort="sort('distribution')">Дистрибуция</SortableTableHead>
      </TableRow></TableHeader>
      <TableBody><TableRow v-for="(field, index) in fields" :key="`${field.kind}-${field.attributeId ?? field.tableField}-${index}`" class="h-7">
        <TableCell class="px-2 py-1" :title="field.kind === 'property' ? 'Свойство таблицы' : `Атрибут ${field.attributeId}`">{{ field.attributeName }}</TableCell>
        <TableCell class="max-w-[48rem] px-2 py-1" :title="display(field.value)"><span class="block truncate">{{ display(field.value) }}</span></TableCell>
        <TableCell class="px-2 py-1">{{ field.tableField }}</TableCell><TableCell class="px-2 py-1">{{ field.distribution }}</TableCell>
      </TableRow></TableBody>
    </Table>
    <footer v-if="result && !loading" class="shrink-0 px-1 text-right text-[0.625rem] text-muted-foreground">Показано строк: {{ fields.length }}</footer>
  </main>
</template>

<script setup lang="ts">
import { Add01Icon, ColumnsThreeCogIcon, Database02Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, nextTick, ref } from 'vue';
import type { ClassObjectsHostMessage } from '../../../src/core/webviewProtocol';
import { normalizeClassObjectColumnSettings } from '../../../src/features/classes/classObjectColumnSettings';
import type { ClassObjectColumn, ClassObjectColumnSettings, ClassObjectsResult } from '../../../src/features/classes/models';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { vscode } from '@/vscode';
import EntityContextMenu from '@/components/EntityContextMenu.vue';

const result = ref<ClassObjectsResult>();
const loading = ref(true);
const loadingMore = ref(false);
const error = ref('');
const sortKey = ref('');
const sortDirection = ref<1 | -1>(1);
const revealedObjectId = ref<string>();
const visibleColumns = ref<string[]>([]);
const columnOrder = ref<string[]>([]);
const compact = ref(true);
const canCreateSpu = computed(() => result.value?.classId === 12609684 || result.value?.className.toLocaleLowerCase('en-US') === 'syspackageupdate');
const activeColumns = computed<ClassObjectColumn[]>(() => {
  const columns = result.value?.columns ?? [];
  return columnOrder.value.flatMap(key => {
    const column = columns.find(item => item.key === key);
    return column && visibleColumns.value.includes(column.key) ? [column] : [];
  });
});

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

function toggleColumn(key: string, checked: boolean | 'indeterminate'): void {
  if (checked) {
    if (!visibleColumns.value.includes(key)) visibleColumns.value.push(key);
  } else if (visibleColumns.value.length > 1) {
    visibleColumns.value = visibleColumns.value.filter(value => value !== key);
  }
  saveColumnSettings();
}

function moveColumn(key: string, direction: -1 | 1): void {
  const index = columnOrder.value.indexOf(key);
  const target = index + direction;
  if (target < 0 || target >= columnOrder.value.length) return;
  const next = [...columnOrder.value];
  [next[index], next[target]] = [next[target], next[index]];
  columnOrder.value = next;
  saveColumnSettings();
}

function resetColumns(): void {
  const keys = result.value?.columns.map(column => column.key) ?? [];
  visibleColumns.value = [...keys];
  columnOrder.value = [...keys];
  compact.value = true;
  saveColumnSettings();
}

function setCompact(value: boolean | 'indeterminate'): void {
  compact.value = value === true;
  saveColumnSettings();
}

function saveColumnSettings(): void {
  vscode.postMessage({
    command: 'saveClassObjectColumnSettings',
    settings: { visible: [...visibleColumns.value], order: [...columnOrder.value], compact: compact.value },
  });
}

function applyColumnSettings(settings?: ClassObjectColumnSettings): void {
  const normalized = normalizeClassObjectColumnSettings(
    result.value?.columns.map(column => column.key) ?? [],
    settings,
  );
  visibleColumns.value = normalized.visible;
  columnOrder.value = normalized.order;
  compact.value = normalized.compact;
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

function createSpu(preferredPackageName?: unknown): void {
  if (!canCreateSpu.value) return;
  vscode.postMessage({
    command: 'createSpu',
    preferredPackageName: typeof preferredPackageName === 'string' && preferredPackageName ? preferredPackageName : undefined,
  });
}

function createSpuForEntity(entityId?: string): void {
  const row = entityId === undefined
    ? undefined
    : rows.value.find(item => String(item.ID ?? item.id ?? '') === entityId);
  createSpu(row?.__package);
}

function editSpu(row: Record<string, unknown>): void {
  if (!canCreateSpu.value) return;
  const id = Number(row.ID ?? row.id);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  vscode.postMessage({ command: 'viewObject', id });
}

function loadMore(): void {
  if (!result.value?.hasMore || loading.value || loadingMore.value) return;
  loadingMore.value = true;
  vscode.postMessage({ command: 'loadMoreClassObjects', offset: result.value.offset + result.value.rows.length });
}

async function revealObject(objectId: number): Promise<void> {
  revealedObjectId.value = String(objectId);
  await nextTick();
  const row = document.querySelector<HTMLTableRowElement>(`tbody tr[data-entity-id="${objectId}"]`);
  row?.scrollIntoView({ block: 'center', inline: 'nearest' });
}

function clearRevealedObject(): void {
  revealedObjectId.value = undefined;
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
      ? { ...message.result, offset: result.value.offset, rows: [...result.value.rows, ...message.result.rows] }
      : message.result;
    if (!message.append) {
      applyColumnSettings(message.columnSettings);
    }
    loading.value = false;
    loadingMore.value = false;
  } else if (message.command === 'revealClassObject') {
    void revealObject(message.objectId);
  } else if (message.command === 'classObjectsLoadFailed') {
    error.value = message.message;
    loading.value = false;
    loadingMore.value = false;
  }
});

vscode.postMessage({ command: 'classObjectsReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 min-w-0 flex-col gap-4 p-3 sm:p-5">
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><HugeiconsIcon :icon="Database02Icon" class="size-5 text-kind-object" /></div>
        <div class="min-w-0"><h1 class="truncate text-lg font-semibold" :title="result?.className">{{ result?.className || 'Объекты класса' }}</h1><p class="text-xs text-muted-foreground">Данные класса · {{ canCreateSpu ? 'пакетные обновления' : 'просмотр объектов' }}</p></div>
      </div>
      <div class="flex flex-wrap items-center gap-2"><Badge variant="object">Объекты</Badge><Badge v-if="result" variant="outline">Класс ID {{ result.classId }}</Badge></div>
    </header>
    <Card class="min-h-0 min-w-0 flex-1">
      <CardHeader class="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div class="flex flex-col gap-1"><CardTitle>Таблица объектов <Badge v-if="result" variant="secondary">{{ result.totalCount }}</Badge></CardTitle><CardDescription>Настройте колонки и выберите строки для копирования</CardDescription></div>
        <div class="flex flex-wrap items-center gap-2">
        <Button v-if="canCreateSpu" size="sm" @click="createSpu()"><HugeiconsIcon :icon="Add01Icon" data-icon="inline-start" />Создать СПУ</Button>
        <Popover>
          <PopoverTrigger as-child>
            <Button variant="outline" size="sm" :disabled="!result">
              <HugeiconsIcon :icon="ColumnsThreeCogIcon" data-icon="inline-start" />
              Колонки
            </Button>
          </PopoverTrigger>
          <PopoverContent class="w-80" align="end">
            <div class="flex items-center justify-between">
              <p class="font-semibold">Отображение таблицы</p>
              <Button size="xs" variant="ghost" @click="resetColumns">Сбросить</Button>
            </div>
            <Separator class="my-3" />
            <FieldGroup class="max-h-80 gap-2 overflow-auto">
              <Field v-for="(key, index) in columnOrder" :key="key" orientation="horizontal" class="gap-2">
                <Checkbox :id="`dictionary-column-${key}`" :model-value="visibleColumns.includes(key)" @update:model-value="toggleColumn(key, $event)" />
                <FieldLabel class="min-w-0 flex-1 truncate" :for="`dictionary-column-${key}`" :title="result?.columns.find(column => column.key === key)?.attributeName">
                  {{ result?.columns.find(column => column.key === key)?.title || key }}
                </FieldLabel>
                <Button size="icon-xs" variant="ghost" title="Сдвинуть влево" :disabled="index === 0" @click="moveColumn(key, -1)">←</Button>
                <Button size="icon-xs" variant="ghost" title="Сдвинуть вправо" :disabled="index === columnOrder.length - 1" @click="moveColumn(key, 1)">→</Button>
              </Field>
            </FieldGroup>
            <Separator class="my-3" />
            <Field orientation="horizontal">
              <Checkbox id="compact-dictionary-rows" :model-value="compact" @update:model-value="setCompact" />
              <FieldLabel for="compact-dictionary-rows" class="font-normal">Компактные строки</FieldLabel>
            </Field>
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="sm" :disabled="loading || loadingMore" @click="refresh">
          <HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />
          Обновить
        </Button>
      </div>
      </CardHeader>
      <CardContent class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div v-if="loading" class="flex flex-col gap-1 p-1">
      <Skeleton v-for="index in 12" :key="index" class="h-6 w-full" />
    </div>
    <Empty v-else-if="error" class="min-h-0 flex-1">
      <EmptyHeader><EmptyTitle>Не удалось загрузить объекты</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader>
      <Button variant="outline" size="sm" @click="refresh">Повторить</Button>
    </Empty>
    <EntityContextMenu v-else-if="!result?.rows.length" :create="canCreateSpu" @create="createSpu()">
      <Empty class="min-h-0 flex-1">
        <EmptyHeader><EmptyTitle>Объектов нет</EmptyTitle><EmptyDescription>В таблице этого класса не найдено записей.</EmptyDescription></EmptyHeader>
      </Empty>
    </EntityContextMenu>
	<EntityContextMenu
	  v-else
	  :create="canCreateSpu"
	  :entity-type="result?.className"
	  :view-label="canCreateSpu ? 'Редактировать' : undefined"
	  :view-as-edit="canCreateSpu"
	  @create="createSpuForEntity"
	>
      <Table container-class="min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border" @pointerdown="clearRevealedObject" @scroll="handleScroll">
        <TableHeader class="sticky top-0 bg-card">
          <TableRow>
            <TableHead
              v-for="column in activeColumns"
              :key="column.key"
              class="min-w-32 cursor-pointer whitespace-nowrap"
              :title="`${column.attributeName} · ${column.key}`"
              @click="sort(column.key)"
            >
              <Button variant="ghost" size="sm" @click.stop="sort(column.key)">{{ column.title }}<template v-if="sortKey === column.key"> {{ sortDirection === 1 ? '↑' : '↓' }}</template></Button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
			v-for="(row, index) in rows"
			:key="String(row.ID ?? row.id ?? index)"
			:data-entity-id="String(row.ID ?? row.id ?? '')"
			:data-row-selected="revealedObjectId === String(row.ID ?? row.id ?? '') ? '' : undefined"
			:aria-selected="revealedObjectId === String(row.ID ?? row.id ?? '') ? 'true' : undefined"
			:class="cn(compact ? 'h-7' : 'h-10', canCreateSpu && 'cursor-pointer')"
			:title="canCreateSpu ? 'Двойной щелчок — редактировать СПУ' : undefined"
			@dblclick="editSpu(row)"
		  >
            <TableCell v-for="column in activeColumns" :key="column.key" class="max-w-80 whitespace-nowrap" :title="display(row[column.key])">
              {{ display(row[column.key]) }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </EntityContextMenu>
      </CardContent>
      <CardFooter v-if="result" class="shrink-0 flex-wrap justify-between gap-2">
        <p class="text-xs text-muted-foreground">Загружено {{ result.rows.length }} из {{ result.totalCount }} · Колонок {{ activeColumns.length }} из {{ result.columns.length }}</p>
        <Button v-if="result.hasMore" size="sm" variant="outline" :disabled="loading || loadingMore" @click="loadMore">{{ loadingMore ? 'Загрузка…' : 'Загрузить ещё' }}</Button>
        <Badge v-else variant="secondary">Все строки загружены</Badge>
      </CardFooter>
    </Card>
  </main>
</template>

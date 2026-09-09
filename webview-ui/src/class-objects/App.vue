<script setup lang="ts">
import { ColumnsThreeCogIcon, RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, nextTick, ref } from 'vue';
import type { ClassObjectsHostMessage } from '../../../src/core/webviewProtocol';
import { normalizeClassObjectColumnSettings } from '../../../src/features/classes/classObjectColumnSettings';
import type { ClassObjectColumn, ClassObjectColumnSettings, ClassObjectsResult } from '../../../src/features/classes/models';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
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
  <main class="flex h-screen min-h-0 flex-col p-1">
    <header class="flex shrink-0 items-center justify-between gap-2 border-b px-1 py-1">
      <div class="min-w-0">
        <div class="truncate text-sm font-medium">{{ result?.className || 'Объекты класса' }}</div>
        <div v-if="result" class="text-xs text-muted-foreground">
          Загружено {{ result.rows.length }} из {{ result.totalCount }}
        </div>
      </div>
      <div class="flex items-center gap-2">
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
            <div class="flex max-h-80 flex-col gap-1 overflow-auto">
              <div v-for="(key, index) in columnOrder" :key="key" class="flex items-center gap-2">
                <Checkbox :id="`dictionary-column-${key}`" :model-value="visibleColumns.includes(key)" @update:model-value="toggleColumn(key, $event)" />
                <label class="min-w-0 flex-1 truncate" :for="`dictionary-column-${key}`" :title="result?.columns.find(column => column.key === key)?.attributeName">
                  {{ result?.columns.find(column => column.key === key)?.title || key }}
                </label>
                <Button size="icon-xs" variant="ghost" title="Сдвинуть влево" :disabled="index === 0" @click="moveColumn(key, -1)">←</Button>
                <Button size="icon-xs" variant="ghost" title="Сдвинуть вправо" :disabled="index === columnOrder.length - 1" @click="moveColumn(key, 1)">→</Button>
              </div>
            </div>
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
    </header>

    <div v-if="loading" class="flex flex-col gap-1 p-1">
      <Skeleton v-for="index in 12" :key="index" class="h-6 w-full" />
    </div>
    <Empty v-else-if="error" class="min-h-0 flex-1">
      <EmptyHeader><EmptyTitle>Не удалось загрузить объекты</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader>
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
      <Table container-class="min-h-0 flex-1 overflow-auto" @pointerdown="clearRevealedObject" @scroll="handleScroll">
        <TableHeader class="sticky top-0 bg-background">
          <TableRow>
            <TableHead
              v-for="column in activeColumns"
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
    <div v-if="loadingMore" class="shrink-0 border-t px-2 py-1 text-center text-xs text-muted-foreground">Загрузка следующих 100 строк…</div>
  </main>
</template>

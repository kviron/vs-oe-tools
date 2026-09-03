<script setup lang="ts">
import type { ClassDetailsHostMessage } from '../../../src/core/webviewProtocol';
import type { ClassAttribute, ClassDetails, ClassMethod } from '../../../src/features/classes/models';
import { computed, ref, shallowRef } from 'vue';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { vscode } from '@/vscode';
import { formatId } from '@/lib/formatId';
import EntityContextMenu from '@/components/EntityContextMenu.vue';
import SortableTableHead from '@/components/SortableTableHead.vue';
import DatePicker from '@/components/DatePicker.vue';
import { nextSort, sortedRows, type SortDirection } from '@/lib/tableSort';

interface SignaturePart {
  text: string;
  kind: 'plain' | 'parameter' | 'type';
}

interface ClassDetailsViewState {
  activeTab?: string;
}

const restoredState = (vscode.getState() ?? {}) as ClassDetailsViewState;
const restoredTab = ['class', 'attributes', 'methods'].includes(restoredState.activeTab ?? '') ? restoredState.activeTab : 'class';
const details = ref<ClassDetails>();
const activeTab = ref(restoredTab);
const attributes = shallowRef<ClassAttribute[]>([]);
const attributesLoading = ref(false);
const attributesLoaded = ref(false);
const attributesError = ref('');
const includeInheritedAttributes = ref(false);
const attributeSearchQuery = ref('');
const attributeCreatorQuery = ref('');
const attributeDateFrom = ref('');
const attributeDateTo = ref('');
const methods = shallowRef<ClassMethod[]>([]);
const methodsLoading = ref(false);
const methodsLoaded = ref(false);
const methodsError = ref('');
const includeInheritedMethods = ref(false);
const methodSearchQuery = ref('');
const methodCreatorQuery = ref('');
const methodDateFrom = ref('');
const methodDateTo = ref('');
const attributeSortKey = ref<string>();
const attributeSortDirection = ref<SortDirection>('asc');
const methodSortKey = ref<string>();
const methodSortDirection = ref<SortDirection>('asc');
const dateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });
const formattedDateCache = new Map<string, string>();
const localDateCache = new Map<string, string>();
const signaturePartsCache = new Map<string, SignaturePart[]>();

function persistViewState(): void {
  vscode.setState({ activeTab: activeTab.value } satisfies ClassDetailsViewState);
}
const tableColumns = [
  ['Имя', 'name'], ['Владелец', 'owner'], ['Сигнатура', 'signature'], ['Тип', 'type'],
  ['ID', 'id'], ['Видимость', 'visibility'], ['Пакет', 'package'], ['Строка', 'line'],
  ['Дата обновления', 'updatedAt'], ['Создал', 'createdBy'],
] as const;
const filteredAttributes = computed(() => {
  return attributes.value.filter(attribute => matchesFilters(attribute, attributeSearchQuery.value, attributeCreatorQuery.value, attributeDateFrom.value, attributeDateTo.value));
});
const sortedAttributes = computed(() => sortedRows(filteredAttributes.value, attributeSortKey.value, attributeSortDirection.value, (row, key) => row[key as keyof ClassAttribute]));
const filteredMethods = computed(() => {
  return methods.value.filter(method => matchesFilters(method, methodSearchQuery.value, methodCreatorQuery.value, methodDateFrom.value, methodDateTo.value));
});
const sortedMethods = computed(() => sortedRows(filteredMethods.value, methodSortKey.value, methodSortDirection.value, (row, key) => row[key as keyof ClassMethod]));
const virtualRowHeight = 24;
const virtualOverscan = 12;
const attributeScrollTop = ref(0);
const attributeViewportHeight = ref(600);
const methodScrollTop = ref(0);
const methodViewportHeight = ref(600);

function virtualRange(length: number, scrollTop: number, viewportHeight: number): { start: number; end: number } {
  const visibleCount = Math.ceil(viewportHeight / virtualRowHeight);
  const start = Math.max(0, Math.min(Math.floor(scrollTop / virtualRowHeight) - virtualOverscan, Math.max(0, length - visibleCount)));
  return { start, end: Math.min(length, start + visibleCount + virtualOverscan * 2) };
}

const attributeVirtualRange = computed(() => virtualRange(sortedAttributes.value.length, attributeScrollTop.value, attributeViewportHeight.value));
const methodVirtualRange = computed(() => virtualRange(sortedMethods.value.length, methodScrollTop.value, methodViewportHeight.value));
const visibleAttributes = computed(() => sortedAttributes.value.slice(attributeVirtualRange.value.start, attributeVirtualRange.value.end));
const visibleMethods = computed(() => sortedMethods.value.slice(methodVirtualRange.value.start, methodVirtualRange.value.end));

function trackVirtualScroll(kind: 'attributes' | 'methods', event: Event): void {
  const element = event.currentTarget;
  if (!(element instanceof HTMLElement)) return;
  if (kind === 'attributes') {
    attributeScrollTop.value = element.scrollTop;
    attributeViewportHeight.value = element.clientHeight;
  } else {
    methodScrollTop.value = element.scrollTop;
    methodViewportHeight.value = element.clientHeight;
  }
}
const fieldColumns = [
  [
    ['Имя', 'name'],
    ['Псевдонимы', 'aliases'],
    ['Полное имя', 'title'],
    ['Имя объекта', 'dbtablename'],
    ['Вывод', 'dispexpression'],
    ['Доп. вывод', 'adddispexpression'],
  ],
  [
    ['ID', 'id'],
    ['Таблица', 'dbtablename'],
    ['Класс детей', 'childclassname'],
    ['Класс владельца', 'parentclassname'],
    ['Кэш-объекты', 'cacheobjclass'],
    ['Проверка ссылочной целостности', 'refintegritycheck'],
    ['Алиас по умолчанию', 'defaultdbalias'],
  ],
] as const;
const properties = [
  ['Абстрактный', 'isabstract'], ['Виртуальный', 'virtual'], ['Наследуемый', 'isinheritable'],
  ['Кэшируемый', 'cached'], ['Одна таблица', 'onedbtable'], ['Общая таблица', 'tableshared'],
  ['Упорядочиваемый', 'ordered'], ['Класс-представление', 'isview'], ['Неиспользуемый', 'unreferenced'],
] as const;

window.addEventListener('message', (event: MessageEvent<ClassDetailsHostMessage>) => {
  if (event.data.command === 'classDetailsLoaded') {
    if (event.data.activeTab && ['class', 'attributes', 'methods'].includes(event.data.activeTab)) activeTab.value = event.data.activeTab;
    if (details.value?.id !== event.data.details.id) {
      attributes.value = [];
      attributesLoading.value = false;
      attributesLoaded.value = false;
      attributesError.value = '';
      attributeSearchQuery.value = '';
      attributeCreatorQuery.value = '';
      attributeDateFrom.value = '';
      attributeDateTo.value = '';
      methods.value = [];
      methodsLoading.value = false;
      methodsLoaded.value = false;
      methodsError.value = '';
      methodSearchQuery.value = '';
      methodCreatorQuery.value = '';
      methodDateFrom.value = '';
      methodDateTo.value = '';
    }
    details.value = event.data.details;
    loadAttributesForActiveTab();
    loadMethodsForActiveTab();
  } else if (event.data.command === 'classAttributesLoaded' && event.data.includeInherited === includeInheritedAttributes.value) {
    attributes.value = event.data.attributes;
    attributesLoading.value = false;
    attributesLoaded.value = true;
  } else if (event.data.command === 'classAttributesLoadFailed' && event.data.includeInherited === includeInheritedAttributes.value) {
    attributesLoading.value = false;
    attributesError.value = event.data.message;
  } else if (event.data.command === 'classMethodsLoaded' && event.data.includeInherited === includeInheritedMethods.value) {
    methods.value = event.data.methods;
    methodsLoading.value = false;
    methodsLoaded.value = true;
  } else if (event.data.command === 'classMethodsLoadFailed' && event.data.includeInherited === includeInheritedMethods.value) {
    methodsLoading.value = false;
    methodsError.value = event.data.message;
  }
});

function onTabChange(value: string | number): void {
  activeTab.value = String(value);
  persistViewState();
  vscode.postMessage({ command: 'classDetailsStateChanged', activeTab: activeTab.value });
  loadAttributesForActiveTab();
  loadMethodsForActiveTab();
}

function loadMethodsForActiveTab(): void {
  if (activeTab.value !== 'methods' || methodsLoading.value || methodsLoaded.value) return;
  methodsLoading.value = true;
  methodsError.value = '';
  vscode.postMessage({ command: 'loadClassMethods', includeInherited: includeInheritedMethods.value });
}

function toggleInheritedMethods(value: boolean | 'indeterminate'): void {
  includeInheritedMethods.value = value === true;
  methods.value = [];
  methodsLoaded.value = false;
  loadMethodsForActiveTab();
}

function signatureParts(signature: string): SignaturePart[] {
  const cached = signaturePartsCache.get(signature);
  if (cached) return cached;
  const parts: SignaturePart[] = [];
  const pattern = /([\p{L}_][\p{L}\p{N}_]*)(\s*:\s*)([\p{L}_][\p{L}\p{N}_.]*)/gu;
  let position = 0;
  for (const match of signature.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > position) parts.push({ text: signature.slice(position, index), kind: 'plain' });
    parts.push({ text: match[1], kind: 'parameter' });
    parts.push({ text: match[2], kind: 'plain' });
    parts.push({ text: match[3], kind: 'type' });
    position = index + match[0].length;
  }
  if (position < signature.length) parts.push({ text: signature.slice(position), kind: 'plain' });
  signaturePartsCache.set(signature, parts);
  return parts;
}

function signaturePartClass(kind: SignaturePart['kind']): string | undefined {
  if (kind === 'parameter') return 'signature-parameter font-medium';
  if (kind === 'type') return 'signature-type font-medium';
  return undefined;
}

function displayClassField(key: string, value: unknown): string {
  return key === 'id' ? formatId(value) : String(value ?? '');
}

function formatDate(value: string): string {
  if (!value) return '';
  const cached = formattedDateCache.get(value);
  if (cached !== undefined) return cached;
  const date = new Date(value);
  const formatted = Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
  formattedDateCache.set(value, formatted);
  return formatted;
}

function matchesFilters(row: ClassAttribute | ClassMethod, search: string, creator: string, dateFrom: string, dateTo: string): boolean {
  const searchQuery = search.trim().toLocaleLowerCase('ru');
  const creatorQuery = creator.trim().toLocaleLowerCase('ru');
  if (searchQuery && ![row.name, row.signature, row.owner, row.id, formatId(row.id)]
    .some(value => String(value ?? '').toLocaleLowerCase('ru').includes(searchQuery))) return false;
  if (creatorQuery && !row.createdBy.toLocaleLowerCase('ru').includes(creatorQuery)) return false;
  if (!dateFrom && !dateTo) return true;
  const updatedDate = localDateKey(row.updatedAt);
  if (!updatedDate) return false;
  return (!dateFrom || updatedDate >= dateFrom) && (!dateTo || updatedDate <= dateTo);
}

function localDateKey(value: string): string {
  const cached = localDateCache.get(value);
  if (cached !== undefined) return cached;
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const key = `${year}-${month}-${day}`;
  localDateCache.set(value, key);
  return key;
}

function loadAttributesForActiveTab(): void {
  if (activeTab.value !== 'attributes' || attributesLoading.value || attributesLoaded.value) return;
  attributesLoading.value = true;
  attributesError.value = '';
  vscode.postMessage({ command: 'loadClassAttributes', includeInherited: includeInheritedAttributes.value });
}

function toggleInheritedAttributes(value: boolean | 'indeterminate'): void {
  includeInheritedAttributes.value = value === true;
  attributes.value = [];
  attributesLoaded.value = false;
  loadAttributesForActiveTab();
}

function openMethod(method: ClassMethod): void {
  const id = Number(method.id);
  if (Number.isSafeInteger(id)) vscode.postMessage({ command: 'openMethod', id });
}

function methodSvnAction(method: ClassMethod, action: 'localDiff' | 'history' | 'blame'): void {
  const id = Number(method.id);
  if (Number.isSafeInteger(id)) vscode.postMessage({ command: 'methodSvnAction', id, action });
}

function sortAttributes(key: string): void {
  attributeSortDirection.value = nextSort(attributeSortKey.value, attributeSortDirection.value, key);
  attributeSortKey.value = key;
}

function sortMethods(key: string): void {
  methodSortDirection.value = nextSort(methodSortKey.value, methodSortDirection.value, key);
  methodSortKey.value = key;
}

vscode.postMessage({ command: 'classDetailsReady' });
</script>

<template>
  <main v-if="details" class="flex h-screen min-h-0 flex-col p-1">
    <Tabs :model-value="activeTab" class="min-h-0 flex-1 gap-1" @update:model-value="onTabChange">
      <TabsList variant="line">
        <TabsTrigger value="class">Класс</TabsTrigger>
        <TabsTrigger value="attributes">Атрибуты</TabsTrigger>
        <TabsTrigger value="methods">Методы</TabsTrigger>
      </TabsList>
      <EntityContextMenu :entity-id="details.id">
      <TabsContent value="class" class="flex max-w-4xl flex-col gap-2 p-1">
        <FieldGroup class="grid gap-x-5 gap-y-2 lg:grid-cols-2">
          <FieldGroup class="gap-2">
            <FieldGroup class="gap-1">
              <Field v-for="[label, key] in fieldColumns[0]" :key="`${label}-${key}`" orientation="horizontal" class="gap-2">
                <FieldLabel :for="`class-${key}-${label}`" class="w-28 shrink-0 flex-none">{{ label }}</FieldLabel>
                <Input :id="`class-${key}-${label}`" :model-value="displayClassField(key, details[key])" class="h-6" readonly />
              </Field>
            </FieldGroup>

            <FieldSet class="gap-1">
              <FieldLegend>Свойства</FieldLegend>
              <FieldGroup class="grid grid-cols-3 gap-x-2 gap-y-0.5">
                <Field v-for="[label, key] in properties" :key="key" orientation="horizontal" class="gap-1" data-disabled>
                  <Checkbox :id="`property-${key}`" :model-value="Boolean(details[key])" disabled />
                  <FieldLabel :for="`property-${key}`">{{ label }}</FieldLabel>
                </Field>
              </FieldGroup>
            </FieldSet>
          </FieldGroup>

          <FieldGroup class="gap-1">
            <Field v-for="[label, key] in fieldColumns[1]" :key="`${label}-${key}`" orientation="horizontal" class="gap-2">
              <FieldLabel :for="`class-${key}-${label}`" class="w-36 shrink-0 flex-none">{{ label }}</FieldLabel>
              <Input :id="`class-${key}-${label}`" :model-value="displayClassField(key, details[key])" class="h-6" readonly />
            </Field>
          </FieldGroup>
        </FieldGroup>

        <FieldSet class="gap-1">
          <FieldLegend>Описание</FieldLegend>
          <FieldGroup class="gap-1">
            <Field>
              <Textarea readonly placeholder="Описание отсутствует" class="min-h-16" />
            </Field>
          </FieldGroup>
        </FieldSet>
      </TabsContent>
      </EntityContextMenu>

      <TabsContent value="attributes" class="flex min-h-0 flex-1 flex-col gap-1 p-1">
        <div class="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
          <label class="flex w-fit shrink-0 items-center gap-1 text-xs" title="Показать атрибуты родительских классов">
            <Checkbox
              :model-value="includeInheritedAttributes"
              :disabled="attributesLoading"
              @update:model-value="toggleInheritedAttributes"
            />
            <span aria-hidden="true">↥</span>
            Наследуемые атрибуты
          </label>
          <div class="flex shrink-0 flex-nowrap items-center justify-end gap-1">
            <Input v-model="attributeCreatorQuery" type="search" class="h-6 w-44" placeholder="Создатель…" aria-label="Фильтр атрибутов по создателю" />
            <DatePicker v-model="attributeDateFrom" label="Дата обновления атрибута с" title="Дата обновления с" />
            <span class="text-xs text-muted-foreground">—</span>
            <DatePicker v-model="attributeDateTo" label="Дата обновления атрибута по" title="Дата обновления по" />
            <Input v-model="attributeSearchQuery" type="search" class="h-6 w-56" placeholder="Поиск атрибута…" aria-label="Поиск атрибута по имени, сигнатуре, владельцу или ID" />
          </div>
        </div>
        <Table :key="`attributes-${includeInheritedAttributes}`" v-if="attributesLoading || filteredAttributes.length > 0" container-class="min-h-0 flex-1 overflow-auto" @scroll="trackVirtualScroll('attributes', $event)">
          <TableHeader class="sticky top-0 z-10 bg-background">
            <TableRow>
              <SortableTableHead v-for="[label, key] in tableColumns" :key="key" class="h-6 px-1" :active="attributeSortKey === key" :direction="attributeSortDirection" @sort="sortAttributes(key)">{{ label }}</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="attributesLoading">
              <TableRow v-for="row in 8" :key="row">
                <TableCell v-for="column in tableColumns.length" :key="column" class="px-1 py-0.5"><Skeleton class="h-4 w-full" /></TableCell>
              </TableRow>
            </template>
            <TableRow v-if="!attributesLoading && attributeVirtualRange.start > 0" data-virtual-spacer><TableCell :colspan="tableColumns.length" class="p-0" :style="{ height: `${attributeVirtualRange.start * virtualRowHeight}px` }" /></TableRow>
            <EntityContextMenu v-for="attribute in attributesLoading ? [] : visibleAttributes" :key="attribute.id" :entity-id="attribute.id">
            <TableRow :data-entity-id="attribute.id">
              <TableCell class="max-w-64 px-1 py-0.5" :title="attribute.name">
                <span v-if="attribute.inherited" class="mr-1 text-muted-foreground" title="Наследуемый атрибут">↥</span>
                <span class="truncate">{{ attribute.name }}</span>
              </TableCell>
              <TableCell class="max-w-56 truncate px-1 py-0.5" :title="attribute.owner">{{ attribute.owner }}</TableCell>
              <TableCell class="max-w-96 truncate px-1 py-0.5" :title="attribute.signature">{{ attribute.signature }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ attribute.type }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ formatId(attribute.id) }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ attribute.visibility }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ attribute.package }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ attribute.line }}</TableCell>
              <TableCell class="whitespace-nowrap px-1 py-0.5">{{ formatDate(attribute.updatedAt) }}</TableCell>
              <TableCell class="max-w-64 truncate px-1 py-0.5" :title="attribute.createdBy">{{ attribute.createdBy }}</TableCell>
            </TableRow>
            </EntityContextMenu>
            <TableRow v-if="!attributesLoading && attributeVirtualRange.end < sortedAttributes.length" data-virtual-spacer><TableCell :colspan="tableColumns.length" class="p-0" :style="{ height: `${(sortedAttributes.length - attributeVirtualRange.end) * virtualRowHeight}px` }" /></TableRow>
          </TableBody>
          <TableFooter v-if="attributesLoaded" class="sticky bottom-0 z-10 bg-background">
            <TableRow>
              <TableCell :colspan="tableColumns.length" class="h-5 px-1 py-0 text-right text-[0.625rem] font-normal text-muted-foreground">
                Строк: {{ filteredAttributes.length }}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        <Empty v-else-if="attributesError" class="min-h-0 py-8">
          <EmptyHeader><EmptyTitle>Не удалось загрузить атрибуты</EmptyTitle><EmptyDescription>{{ attributesError }}</EmptyDescription></EmptyHeader>
        </Empty>
        <Empty v-else-if="attributesLoaded" class="min-h-0 py-8">
          <EmptyHeader>
            <EmptyTitle>Атрибуты не найдены</EmptyTitle>
            <EmptyDescription v-if="attributeSearchQuery.trim() || attributeCreatorQuery.trim() || attributeDateFrom || attributeDateTo">Измените или очистите фильтры.</EmptyDescription>
            <EmptyDescription v-else>Для этого класса нет доступных атрибутов.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </TabsContent>

      <TabsContent value="methods" class="flex min-h-0 flex-1 flex-col gap-1 p-1">
        <div class="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
          <label class="flex w-fit shrink-0 items-center gap-1 text-xs" title="Показать методы родительских классов">
            <Checkbox
              :model-value="includeInheritedMethods"
              :disabled="methodsLoading"
              @update:model-value="toggleInheritedMethods"
            />
            <span aria-hidden="true">↥</span>
            Наследуемые методы
          </label>
          <div class="flex shrink-0 flex-nowrap items-center justify-end gap-1">
            <Input v-model="methodCreatorQuery" type="search" class="h-6 w-44" placeholder="Создатель…" aria-label="Фильтр методов по создателю" />
            <DatePicker v-model="methodDateFrom" label="Дата обновления метода с" title="Дата обновления с" />
            <span class="text-xs text-muted-foreground">—</span>
            <DatePicker v-model="methodDateTo" label="Дата обновления метода по" title="Дата обновления по" />
            <Input v-model="methodSearchQuery" type="search" class="h-6 w-56" placeholder="Поиск метода…" aria-label="Поиск метода по имени, сигнатуре, владельцу или ID" />
          </div>
        </div>
        <Table :key="`methods-${includeInheritedMethods}`" v-if="methodsLoading || filteredMethods.length > 0" container-class="min-h-0 flex-1 overflow-auto" @scroll="trackVirtualScroll('methods', $event)">
          <TableHeader class="sticky top-0 z-10 bg-background">
            <TableRow>
              <SortableTableHead v-for="[label, key] in tableColumns" :key="key" class="h-6 px-1" :active="methodSortKey === key" :direction="methodSortDirection" @sort="sortMethods(key)">{{ label }}</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="methodsLoading">
              <TableRow v-for="row in 8" :key="row">
                <TableCell v-for="column in tableColumns.length" :key="column" class="px-1 py-0.5"><Skeleton class="h-4 w-full" /></TableCell>
              </TableRow>
            </template>
            <TableRow v-if="!methodsLoading && methodVirtualRange.start > 0" data-virtual-spacer><TableCell :colspan="tableColumns.length" class="p-0" :style="{ height: `${methodVirtualRange.start * virtualRowHeight}px` }" /></TableRow>
            <EntityContextMenu v-for="method in methodsLoading ? [] : visibleMethods" :key="method.id" :entity-id="method.id" svn @svn-action="methodSvnAction(method, $event)">
            <TableRow :data-entity-id="method.id" class="cursor-default" title="Двойной щелчок — открыть код метода" @dblclick="openMethod(method)">
              <TableCell class="max-w-64 px-1 py-0.5" :title="method.name">
                <span v-if="method.inherited" class="mr-1 text-muted-foreground" title="Наследуемый метод">↥</span>
                <span class="truncate">{{ method.name }}</span>
              </TableCell>
              <TableCell class="max-w-56 truncate px-1 py-0.5" :title="method.owner">{{ method.owner }}</TableCell>
              <TableCell class="max-w-96 px-1 py-0.5" :title="method.signature">
                <span class="block truncate font-mono text-xs">
                  <span v-for="(part, index) in signatureParts(method.signature)" :key="index" :class="signaturePartClass(part.kind)">{{ part.text }}</span>
                </span>
              </TableCell>
              <TableCell class="px-1 py-0.5">{{ method.type }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ formatId(method.id) }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ method.visibility }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ method.package }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ method.line }}</TableCell>
              <TableCell class="whitespace-nowrap px-1 py-0.5">{{ formatDate(method.updatedAt) }}</TableCell>
              <TableCell class="max-w-64 truncate px-1 py-0.5" :title="method.createdBy">{{ method.createdBy }}</TableCell>
            </TableRow>
            </EntityContextMenu>
            <TableRow v-if="!methodsLoading && methodVirtualRange.end < sortedMethods.length" data-virtual-spacer><TableCell :colspan="tableColumns.length" class="p-0" :style="{ height: `${(sortedMethods.length - methodVirtualRange.end) * virtualRowHeight}px` }" /></TableRow>
          </TableBody>
          <TableFooter v-if="methodsLoaded" class="sticky bottom-0 z-10 bg-background">
            <TableRow>
              <TableCell :colspan="tableColumns.length" class="h-5 px-1 py-0 text-right text-[0.625rem] font-normal text-muted-foreground">
                Строк: {{ filteredMethods.length }}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        <Empty v-else-if="methodsError" class="min-h-0 py-8">
          <EmptyHeader><EmptyTitle>Не удалось загрузить методы</EmptyTitle><EmptyDescription>{{ methodsError }}</EmptyDescription></EmptyHeader>
        </Empty>
        <Empty v-else-if="methodsLoaded" class="min-h-0 py-8">
          <EmptyHeader>
            <EmptyTitle>Методы не найдены</EmptyTitle>
            <EmptyDescription v-if="methodSearchQuery.trim() || methodCreatorQuery.trim() || methodDateFrom || methodDateTo">Измените или очистите фильтры.</EmptyDescription>
            <EmptyDescription v-else>Для этого класса нет доступных методов.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </TabsContent>
    </Tabs>
  </main>
  <Empty v-else class="min-h-0 py-8"><EmptyHeader><EmptyTitle>Загрузка класса…</EmptyTitle><EmptyDescription>Получаем данные класса из расширения.</EmptyDescription></EmptyHeader></Empty>
</template>

<style scoped>
.signature-parameter { color: var(--vscode-symbolIcon-variableForeground, var(--primary)); }
.signature-type { color: var(--vscode-symbolIcon-classForeground, var(--foreground)); }
</style>

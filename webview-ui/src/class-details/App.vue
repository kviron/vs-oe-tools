<script setup lang="ts">
import type { ClassDetailsHostMessage } from '../../../src/core/webviewProtocol';
import type { ClassAttribute, ClassDetails, ClassMethod, ClassProperty } from '../../../src/features/classes/models';
import { computed, nextTick, ref, shallowRef } from 'vue';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Add01Icon, Layers01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import MemberToolbar from './MemberToolbar.vue';
import { HugeiconsIcon } from '@hugeicons/vue';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { vscode } from '@/vscode';
import { formatId } from '@/lib/formatId';
import EntityContextMenu from '@/components/EntityContextMenu.vue';
import SortableTableHead from '@/components/SortableTableHead.vue';
import { nextSort, sortedRows, type SortDirection } from '@/lib/tableSort';

interface SignaturePart {
  text: string;
  kind: 'plain' | 'parameter' | 'type';
}

interface ClassDetailsViewState {
  activeTab?: string;
  includeInheritedAttributes?: boolean;
  includeInheritedMethods?: boolean;
  includeInheritedProperties?: boolean;
}

const restoredState = (vscode.getState() ?? {}) as ClassDetailsViewState;
const restoredTab = ['class', 'attributes', 'methods', 'properties'].includes(restoredState.activeTab ?? '') ? restoredState.activeTab : 'class';
const details = ref<ClassDetails>();
const activeTab = ref(restoredTab);
const attributes = shallowRef<ClassAttribute[]>([]);
const attributesLoading = ref(false);
const attributesLoaded = ref(false);
const attributesError = ref('');
const includeInheritedAttributes = ref(restoredState.includeInheritedAttributes ?? false);
const attributeSearchQuery = ref('');
const attributeCreatorQuery = ref('');
const attributeDateFrom = ref('');
const attributeDateTo = ref('');
const methods = shallowRef<ClassMethod[]>([]);
const methodsLoading = ref(false);
const methodsLoaded = ref(false);
const methodsError = ref('');
const includeInheritedMethods = ref(restoredState.includeInheritedMethods ?? false);
const methodSearchQuery = ref('');
const methodCreatorQuery = ref('');
const methodDateFrom = ref('');
const methodDateTo = ref('');
const classProperties = shallowRef<ClassProperty[]>([]);
const classPropertiesLoading = ref(false);
const classPropertiesLoaded = ref(false);
const classPropertiesError = ref('');
const includeInheritedProperties = ref(restoredState.includeInheritedProperties ?? false);
const propertySearchQuery = ref('');
const attributeSortKey = ref<string>();
const attributeSortDirection = ref<SortDirection>('asc');
const methodSortKey = ref<string>();
const methodSortDirection = ref<SortDirection>('asc');
const propertySortKey = ref<string>();
const propertySortDirection = ref<SortDirection>('asc');
const dateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });
const formattedDateCache = new Map<string, string>();
const localDateCache = new Map<string, string>();
const signaturePartsCache = new Map<string, SignaturePart[]>();

function persistViewState(): void {
  vscode.setState({
    activeTab: activeTab.value,
    includeInheritedAttributes: includeInheritedAttributes.value,
    includeInheritedMethods: includeInheritedMethods.value,
    includeInheritedProperties: includeInheritedProperties.value,
  } satisfies ClassDetailsViewState);
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
const filteredProperties = computed(() => {
  const query = propertySearchQuery.value.trim().toLocaleLowerCase('ru');
  if (!query) return classProperties.value;
  return classProperties.value.filter(property => [property.name, property.aliases, property.owner, property.type, property.id, formatId(property.id), property.visibility, property.package]
    .some(value => String(value ?? '').toLocaleLowerCase('ru').includes(query)));
});
const attributeCount = computed(() => attributesLoaded.value
  ? attributes.value.length
  : includeInheritedAttributes.value ? details.value?.inheritedAttributeCount ?? 0 : details.value?.attributeCount ?? 0);
const methodCount = computed(() => methodsLoaded.value
  ? methods.value.length
  : includeInheritedMethods.value ? details.value?.inheritedMethodCount ?? 0 : details.value?.methodCount ?? 0);
const propertyCount = computed(() => classPropertiesLoaded.value
  ? classProperties.value.length
  : includeInheritedProperties.value ? details.value?.inheritedPropertyCount ?? 0 : details.value?.propertyCount ?? 0);
const sortedProperties = computed(() => sortedRows(filteredProperties.value, propertySortKey.value, propertySortDirection.value, (row, key) => row[key as keyof ClassProperty]));
const virtualRowHeight = 32;
const virtualOverscan = 12;
const attributeScrollTop = ref(0);
const attributeViewportHeight = ref(600);
const methodScrollTop = ref(0);
const methodViewportHeight = ref(600);
const revealedMethodId = ref<string>();
const pendingMethodId = ref<string>();

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
    if (event.data.activeTab && ['class', 'attributes', 'methods', 'properties'].includes(event.data.activeTab)) activeTab.value = event.data.activeTab;
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
      classProperties.value = [];
      classPropertiesLoading.value = false;
      classPropertiesLoaded.value = false;
      classPropertiesError.value = '';
      propertySearchQuery.value = '';
    }
    details.value = event.data.details;
    loadAttributesForActiveTab();
    loadMethodsForActiveTab();
    loadPropertiesForActiveTab();
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
    void revealPendingMethod();
  } else if (event.data.command === 'classMethodsLoadFailed' && event.data.includeInherited === includeInheritedMethods.value) {
    methodsLoading.value = false;
    methodsError.value = event.data.message;
  } else if (event.data.command === 'classPropertiesLoaded' && event.data.includeInherited === includeInheritedProperties.value) {
    classProperties.value = event.data.properties;
    classPropertiesLoading.value = false;
    classPropertiesLoaded.value = true;
  } else if (event.data.command === 'classPropertiesLoadFailed' && event.data.includeInherited === includeInheritedProperties.value) {
    classPropertiesLoading.value = false;
    classPropertiesError.value = event.data.message;
  } else if (event.data.command === 'revealClassMethod') {
    activeTab.value = 'methods';
    methodSearchQuery.value = '';
    methodCreatorQuery.value = '';
    methodDateFrom.value = '';
    methodDateTo.value = '';
    pendingMethodId.value = String(event.data.methodId);
    persistViewState();
    loadMethodsForActiveTab();
    void revealPendingMethod();
  }
});

async function revealPendingMethod(): Promise<void> {
  const methodId = pendingMethodId.value;
  if (!methodId || !methodsLoaded.value) return;
  const index = sortedMethods.value.findIndex(method => method.id === methodId);
  if (index < 0) return;
  revealedMethodId.value = methodId;
  methodScrollTop.value = index * virtualRowHeight;
  await nextTick();
  const container = document.querySelector<HTMLElement>('[data-method-table][data-slot="table-container"]');
  if (container) container.scrollTop = methodScrollTop.value;
  await nextTick();
  document.querySelector<HTMLElement>(`tr[data-entity-id="${CSS.escape(methodId)}"]`)?.scrollIntoView({ block: 'center' });
  pendingMethodId.value = undefined;
}

function onTabChange(value: string | number): void {
  activeTab.value = String(value);
  persistViewState();
  vscode.postMessage({ command: 'classDetailsStateChanged', activeTab: activeTab.value });
  loadAttributesForActiveTab();
  loadMethodsForActiveTab();
  loadPropertiesForActiveTab();
}

function loadMethodsForActiveTab(): void {
  if (activeTab.value !== 'methods' || methodsLoading.value || methodsLoaded.value) return;
  methodsLoading.value = true;
  methodsError.value = '';
  vscode.postMessage({ command: 'loadClassMethods', includeInherited: includeInheritedMethods.value });
}

function toggleInheritedMethods(value: boolean | 'indeterminate'): void {
  includeInheritedMethods.value = value === true;
  persistViewState();
  methods.value = [];
  methodsLoaded.value = false;
  loadMethodsForActiveTab();
}

function loadPropertiesForActiveTab(): void {
  if (activeTab.value !== 'properties' || classPropertiesLoading.value || classPropertiesLoaded.value) return;
  classPropertiesLoading.value = true;
  classPropertiesError.value = '';
  vscode.postMessage({ command: 'loadClassProperties', includeInherited: includeInheritedProperties.value });
}

function toggleInheritedProperties(value: boolean | 'indeterminate'): void {
  includeInheritedProperties.value = value === true;
  persistViewState();
  classProperties.value = [];
  classPropertiesLoaded.value = false;
  loadPropertiesForActiveTab();
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
  persistViewState();
  attributes.value = [];
  attributesLoaded.value = false;
  loadAttributesForActiveTab();
}

function openMethod(method: ClassMethod): void {
  const id = Number(method.id);
  if (Number.isSafeInteger(id)) vscode.postMessage({ command: 'openMethod', id });
}

function openAttribute(attribute: ClassAttribute): void {
  const id = Number(attribute.id);
  if (Number.isSafeInteger(id)) vscode.postMessage({ command: 'openAttribute', id });
}

function createAttribute(): void {
  if (details.value) vscode.postMessage({ command: 'createAttribute', classId: details.value.id });
}

function createMethod(): void {
  if (details.value) vscode.postMessage({ command: 'createMethod', classId: details.value.id });
}

function openProperty(property: ClassProperty): void {
  const id = Number(property.id);
  if (Number.isSafeInteger(id)) vscode.postMessage({ command: 'openProperty', id });
}

function viewEntityProperties(id: number | string): void {
  const numericId = Number(id);
  if (Number.isSafeInteger(numericId)) vscode.postMessage({ command: 'viewEntityProperties', id: numericId });
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

function sortProperties(key: string): void {
  propertySortDirection.value = nextSort(propertySortKey.value, propertySortDirection.value, key);
  propertySortKey.value = key;
}

vscode.postMessage({ command: 'classDetailsReady' });
</script>

<template>
  <main v-if="details" class="flex h-screen min-h-0 min-w-0 flex-col gap-4 p-3 sm:p-5">
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><HugeiconsIcon :icon="Layers01Icon" class="size-5 text-kind-class" /></div>
        <div class="min-w-0"><h1 class="truncate text-lg font-semibold" :title="details.name">{{ details.name }}</h1><p class="truncate text-xs text-muted-foreground">{{ details.title || 'Структура и метаданные класса' }}</p></div>
      </div>
      <EntityContextMenu :entity-id="details.id" entity-type="Класс" :view-objects-class-id="!details.virtual && details.dbtablename ? details.id : undefined">
        <div class="flex flex-wrap items-center gap-2"><Badge variant="class">Класс</Badge><Badge variant="outline">ID {{ formatId(details.id) }}</Badge><Badge v-if="details.virtual" variant="secondary">Виртуальный</Badge></div>
      </EntityContextMenu>
    </header>
    <Tabs :model-value="activeTab" class="min-h-0 min-w-0 flex-1 gap-3" @update:model-value="onTabChange">
      <TabsList class="h-auto min-h-8 max-w-full shrink-0 flex-wrap">
        <TabsTrigger value="class">Обзор</TabsTrigger>
        <TabsTrigger value="attributes">Атрибуты <Badge variant="attribute">{{ attributeCount }}</Badge></TabsTrigger>
        <TabsTrigger value="methods">Методы <Badge variant="method">{{ methodCount }}</Badge></TabsTrigger>
        <TabsTrigger value="properties">Свойства <Badge variant="secondary">{{ propertyCount }}</Badge></TabsTrigger>
      </TabsList>
      <EntityContextMenu :entity-id="details.id" entity-type="Класс" :view-objects-class-id="!details.virtual && details.dbtablename ? details.id : undefined">
      <TabsContent value="class" class="min-h-0 flex-1 overflow-auto p-0.5">
        <div class="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(240px,0.7fr)]">
          <Card v-for="(column, index) in fieldColumns" :key="index" class="min-w-0">
            <CardHeader><CardTitle>{{ index === 0 ? 'Основное' : 'Хранение и связи' }}</CardTitle><CardDescription>{{ index === 0 ? 'Имена и выражения отображения' : 'Таблица, связанные классы и целостность' }}</CardDescription></CardHeader>
            <CardContent><FieldGroup class="gap-3">
              <Field v-for="[label, key] in column" :key="`${label}-${key}`" class="gap-1.5">
                <FieldLabel :for="`class-${key}-${label}`">{{ label }}</FieldLabel>
                <Input :id="`class-${key}-${label}`" :model-value="displayClassField(key, details[key])" readonly />
              </Field>
            </FieldGroup></CardContent>
          </Card>
          <Card class="min-w-0">
            <CardHeader><CardTitle>Поведение</CardTitle><CardDescription>Свойства класса · только чтение</CardDescription></CardHeader>
            <CardContent><FieldSet><FieldLegend class="sr-only">Свойства класса</FieldLegend><FieldGroup class="gap-3">
              <Field v-for="[label, key] in properties" :key="key" orientation="horizontal" data-disabled>
                <Checkbox :id="`property-${key}`" :model-value="Boolean(details[key])" disabled />
                <FieldLabel :for="`property-${key}`">{{ label }}</FieldLabel>
              </Field>
            </FieldGroup></FieldSet></CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="properties" class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-0.5">
        <MemberToolbar title="Свойства" description="Скриптовые свойства класса. Бинарные RTTI-свойства доступны в клиенте." :count="filteredProperties.length" :loading="classPropertiesLoading" :inherited="includeInheritedProperties" v-model:search="propertySearchQuery" @inherited-change="toggleInheritedProperties" />
        <Table v-if="classPropertiesLoading || sortedProperties.length" container-class="min-h-24 min-w-0 flex-1 overflow-auto rounded-lg border bg-card">
          <TableHeader class="sticky top-0 z-10 bg-card"><TableRow>
            <SortableTableHead class="h-9 min-w-56 px-1" :active="propertySortKey === 'name'" :direction="propertySortDirection" @sort="sortProperties('name')">Имя</SortableTableHead>
            <SortableTableHead class="h-9 min-w-40 px-1" :active="propertySortKey === 'aliases'" :direction="propertySortDirection" @sort="sortProperties('aliases')">Псевдоним</SortableTableHead>
            <SortableTableHead class="h-9 min-w-40 px-1" :active="propertySortKey === 'owner'" :direction="propertySortDirection" @sort="sortProperties('owner')">Владелец</SortableTableHead>
            <SortableTableHead class="h-9 min-w-32 px-1" :active="propertySortKey === 'type'" :direction="propertySortDirection" @sort="sortProperties('type')">Тип</SortableTableHead>
            <SortableTableHead class="h-9 min-w-28 px-1" :active="propertySortKey === 'readOnly'" :direction="propertySortDirection" @sort="sortProperties('readOnly')">Только чтение</SortableTableHead>
            <SortableTableHead class="h-9 min-w-28 px-1" :active="propertySortKey === 'id'" :direction="propertySortDirection" @sort="sortProperties('id')">ID</SortableTableHead>
            <SortableTableHead class="h-9 min-w-28 px-1" :active="propertySortKey === 'visibility'" :direction="propertySortDirection" @sort="sortProperties('visibility')">Видимость</SortableTableHead>
            <SortableTableHead class="h-9 min-w-40 px-1" :active="propertySortKey === 'package'" :direction="propertySortDirection" @sort="sortProperties('package')">Пакет</SortableTableHead>
          </TableRow></TableHeader>
          <TableBody>
            <template v-if="classPropertiesLoading"><TableRow v-for="row in 8" :key="row"><TableCell v-for="column in 8" :key="column" class="px-3 py-1"><Skeleton class="h-4 w-full" /></TableCell></TableRow></template>
            <EntityContextMenu v-for="property in classPropertiesLoading ? [] : sortedProperties" :key="property.id" :entity-id="property.id" entity-type="Свойство" edit @edit="openProperty(property)" @properties="viewEntityProperties(property.id)">
              <TableRow :data-entity-id="property.id" class="h-8 cursor-default" title="Двойной щелчок — открыть карточку свойства" @dblclick="openProperty(property)">
                <TableCell class="max-w-64 px-3 py-1" :title="property.name"><span v-if="property.inherited" class="mr-1 text-muted-foreground" title="Наследуемое свойство">↥</span>{{ property.name }}</TableCell>
                <TableCell class="max-w-48 truncate px-3 py-1" :title="property.aliases">{{ property.aliases }}</TableCell>
                <TableCell class="max-w-48 truncate px-3 py-1" :title="property.owner">{{ property.owner }}</TableCell>
                <TableCell class="px-3 py-1"><Badge variant="secondary">{{ property.type }}</Badge></TableCell>
                <TableCell class="px-3 py-1">{{ property.readOnly ? 'Да' : '' }}</TableCell>
                <TableCell class="px-3 py-1">{{ formatId(property.id) }}</TableCell>
                <TableCell class="px-3 py-1">{{ property.visibility }}</TableCell>
                <TableCell class="max-w-48 truncate px-3 py-1" :title="property.package">{{ property.package }}</TableCell>
              </TableRow>
            </EntityContextMenu>
          </TableBody>
          <TableFooter v-if="classPropertiesLoaded" class="sticky bottom-0 z-10 bg-card"><TableRow><TableCell :colspan="8" class="h-5 px-1 py-0 text-right text-[0.625rem] font-normal text-muted-foreground">Строк: {{ filteredProperties.length }}</TableCell></TableRow></TableFooter>
        </Table>
        <Empty v-else-if="classPropertiesError" class="min-h-0 py-8"><EmptyHeader><EmptyTitle>Не удалось загрузить свойства</EmptyTitle><EmptyDescription>{{ classPropertiesError }}</EmptyDescription></EmptyHeader></Empty>
        <Empty v-else-if="classPropertiesLoaded" class="min-h-0 py-8"><EmptyHeader><EmptyTitle>Свойства не найдены</EmptyTitle><EmptyDescription>{{ propertySearchQuery.trim() ? 'Очистите строку поиска.' : 'Для этого класса нет скриптовых свойств.' }}</EmptyDescription></EmptyHeader></Empty>
      </TabsContent>
      </EntityContextMenu>

      <TabsContent value="attributes" class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-0.5">
        <MemberToolbar title="Атрибуты" description="Поля данных, типы и наследование" :count="filteredAttributes.length" :loading="attributesLoading" :inherited="includeInheritedAttributes" advanced v-model:search="attributeSearchQuery" v-model:creator="attributeCreatorQuery" v-model:date-from="attributeDateFrom" v-model:date-to="attributeDateTo" @inherited-change="toggleInheritedAttributes">
          <Button size="sm" @click="createAttribute"><HugeiconsIcon :icon="Add01Icon" data-icon="inline-start" />Создать атрибут</Button>
        </MemberToolbar>
        <Table :key="`attributes-${includeInheritedAttributes}`" v-if="attributesLoading || filteredAttributes.length > 0" container-class="min-h-24 min-w-0 flex-1 overflow-auto rounded-lg border bg-card" @scroll="trackVirtualScroll('attributes', $event)">
          <TableHeader class="sticky top-0 z-10 bg-card">
            <TableRow>
              <SortableTableHead v-for="[label, key] in tableColumns" :key="key" class="h-9 px-3" :active="attributeSortKey === key" :direction="attributeSortDirection" @sort="sortAttributes(key)">{{ label }}</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="attributesLoading">
              <TableRow v-for="row in 8" :key="row">
                <TableCell v-for="column in tableColumns.length" :key="column" class="px-3 py-1"><Skeleton class="h-4 w-full" /></TableCell>
              </TableRow>
            </template>
            <TableRow v-if="!attributesLoading && attributeVirtualRange.start > 0" data-virtual-spacer><TableCell :colspan="tableColumns.length" class="p-0" :style="{ height: `${attributeVirtualRange.start * virtualRowHeight}px` }" /></TableRow>
            <EntityContextMenu v-for="attribute in attributesLoading ? [] : visibleAttributes" :key="attribute.id" :entity-id="attribute.id" entity-type="Атрибут" edit @edit="openAttribute(attribute)" @properties="viewEntityProperties(attribute.id)">
            <TableRow :data-entity-id="attribute.id" class="h-8 cursor-default" title="Двойной щелчок — открыть карточку атрибута" @dblclick="openAttribute(attribute)">
              <TableCell class="max-w-64 px-3 py-1" :title="attribute.name">
                <span v-if="attribute.inherited" class="mr-1 text-muted-foreground" title="Наследуемый атрибут">↥</span>
                <span class="truncate">{{ attribute.name }}</span>
              </TableCell>
              <TableCell class="max-w-56 truncate px-3 py-1" :title="attribute.owner">{{ attribute.owner }}</TableCell>
              <TableCell class="max-w-96 truncate px-3 py-1" :title="attribute.signature">{{ attribute.signature }}</TableCell>
              <TableCell class="px-3 py-1"><Badge variant="attribute">{{ attribute.type }}</Badge></TableCell>
              <TableCell class="px-3 py-1">{{ formatId(attribute.id) }}</TableCell>
              <TableCell class="px-3 py-1">{{ attribute.visibility }}</TableCell>
              <TableCell class="px-3 py-1">{{ attribute.package }}</TableCell>
              <TableCell class="px-3 py-1">{{ attribute.line }}</TableCell>
              <TableCell class="whitespace-nowrap px-3 py-1">{{ formatDate(attribute.updatedAt) }}</TableCell>
              <TableCell class="max-w-64 truncate px-3 py-1" :title="attribute.createdBy">{{ attribute.createdBy }}</TableCell>
            </TableRow>
            </EntityContextMenu>
            <TableRow v-if="!attributesLoading && attributeVirtualRange.end < sortedAttributes.length" data-virtual-spacer><TableCell :colspan="tableColumns.length" class="p-0" :style="{ height: `${(sortedAttributes.length - attributeVirtualRange.end) * virtualRowHeight}px` }" /></TableRow>
          </TableBody>
          <TableFooter v-if="attributesLoaded" class="sticky bottom-0 z-10 bg-card">
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

      <TabsContent value="methods" class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-0.5">
        <MemberToolbar title="Методы" description="Двойной щелчок по строке открывает код метода" :count="filteredMethods.length" :loading="methodsLoading" :inherited="includeInheritedMethods" advanced v-model:search="methodSearchQuery" v-model:creator="methodCreatorQuery" v-model:date-from="methodDateFrom" v-model:date-to="methodDateTo" @inherited-change="toggleInheritedMethods">
          <Button size="sm" @click="createMethod"><HugeiconsIcon :icon="Add01Icon" data-icon="inline-start" />Создать метод</Button>
        </MemberToolbar>
        <Table :key="`methods-${includeInheritedMethods}`" v-if="methodsLoading || filteredMethods.length > 0" data-method-table container-class="min-h-24 min-w-0 flex-1 overflow-auto rounded-lg border bg-card" @scroll="trackVirtualScroll('methods', $event)">
          <TableHeader class="sticky top-0 z-10 bg-card">
            <TableRow>
              <SortableTableHead v-for="[label, key] in tableColumns" :key="key" class="h-9 px-3" :active="methodSortKey === key" :direction="methodSortDirection" @sort="sortMethods(key)">{{ label }}</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="methodsLoading">
              <TableRow v-for="row in 8" :key="row">
                <TableCell v-for="column in tableColumns.length" :key="column" class="px-3 py-1"><Skeleton class="h-4 w-full" /></TableCell>
              </TableRow>
            </template>
            <TableRow v-if="!methodsLoading && methodVirtualRange.start > 0" data-virtual-spacer><TableCell :colspan="tableColumns.length" class="p-0" :style="{ height: `${methodVirtualRange.start * virtualRowHeight}px` }" /></TableRow>
            <EntityContextMenu v-for="method in methodsLoading ? [] : visibleMethods" :key="method.id" :entity-id="method.id" entity-type="Метод" edit svn @edit="openMethod(method)" @properties="viewEntityProperties(method.id)" @svn-action="methodSvnAction(method, $event)">
            <TableRow :data-entity-id="method.id" class="h-8 cursor-default" :data-row-selected="method.id === revealedMethodId ? '' : undefined" :aria-selected="method.id === revealedMethodId ? 'true' : undefined" title="Двойной щелчок — открыть код метода" @dblclick="openMethod(method)">
              <TableCell class="max-w-64 px-3 py-1" :title="method.name">
                <span v-if="method.inherited" class="mr-1 text-muted-foreground" title="Наследуемый метод">↥</span>
                <span class="truncate">{{ method.name }}</span>
              </TableCell>
              <TableCell class="max-w-56 truncate px-3 py-1" :title="method.owner">{{ method.owner }}</TableCell>
              <TableCell class="max-w-96 px-3 py-1" :title="method.signature">
                <span class="block truncate font-mono text-xs">
                  <span v-for="(part, index) in signatureParts(method.signature)" :key="index" :class="signaturePartClass(part.kind)">{{ part.text }}</span>
                </span>
              </TableCell>
              <TableCell class="px-3 py-1"><Badge variant="method">{{ method.type }}</Badge></TableCell>
              <TableCell class="px-3 py-1">{{ formatId(method.id) }}</TableCell>
              <TableCell class="px-3 py-1">{{ method.visibility }}</TableCell>
              <TableCell class="px-3 py-1">{{ method.package }}</TableCell>
              <TableCell class="px-3 py-1">{{ method.line }}</TableCell>
              <TableCell class="whitespace-nowrap px-3 py-1">{{ formatDate(method.updatedAt) }}</TableCell>
              <TableCell class="max-w-64 truncate px-3 py-1" :title="method.createdBy">{{ method.createdBy }}</TableCell>
            </TableRow>
            </EntityContextMenu>
            <TableRow v-if="!methodsLoading && methodVirtualRange.end < sortedMethods.length" data-virtual-spacer><TableCell :colspan="tableColumns.length" class="p-0" :style="{ height: `${(sortedMethods.length - methodVirtualRange.end) * virtualRowHeight}px` }" /></TableRow>
          </TableBody>
          <TableFooter v-if="methodsLoaded" class="sticky bottom-0 z-10 bg-card">
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
.signature-parameter { color: var(--kind-attribute); }
.signature-type { color: var(--kind-class); }
</style>

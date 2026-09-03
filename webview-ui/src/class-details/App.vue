<script setup lang="ts">
import type { ClassDetailsHostMessage } from '../../../src/core/webviewProtocol';
import type { ClassAttribute, ClassDetails, ClassMethod } from '../../../src/features/classes/models';
import { computed, ref } from 'vue';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { vscode } from '@/vscode';
import { formatId } from '@/lib/formatId';
import EntityContextMenu from '@/components/EntityContextMenu.vue';
import SortableTableHead from '@/components/SortableTableHead.vue';
import { nextSort, sortedRows, type SortDirection } from '@/lib/tableSort';

interface SignaturePart {
  text: string;
  kind: 'plain' | 'parameter' | 'type';
}

const details = ref<ClassDetails>();
const activeTab = ref('class');
const attributes = ref<ClassAttribute[]>([]);
const attributesLoading = ref(false);
const attributesLoaded = ref(false);
const attributesError = ref('');
const includeInheritedAttributes = ref(false);
const attributeSearchQuery = ref('');
const methods = ref<ClassMethod[]>([]);
const methodsLoading = ref(false);
const methodsLoaded = ref(false);
const methodsError = ref('');
const includeInheritedMethods = ref(false);
const methodSearchQuery = ref('');
const attributeSortKey = ref<string>();
const attributeSortDirection = ref<SortDirection>('asc');
const methodSortKey = ref<string>();
const methodSortDirection = ref<SortDirection>('asc');
const tableColumns = [
  ['Имя', 'name'], ['Владелец', 'owner'], ['Сигнатура', 'signature'], ['Тип', 'type'],
  ['ID', 'id'], ['Видимость', 'visibility'], ['Пакет', 'package'], ['Строка', 'line'],
] as const;
const filteredAttributes = computed(() => {
  const query = attributeSearchQuery.value.trim().toLocaleLowerCase('ru');
  if (!query) return attributes.value;
  return attributes.value.filter(attribute => [attribute.name, attribute.signature, attribute.owner, attribute.id, formatId(attribute.id)]
    .some(value => String(value ?? '').toLocaleLowerCase('ru').includes(query)));
});
const sortedAttributes = computed(() => sortedRows(filteredAttributes.value, attributeSortKey.value, attributeSortDirection.value, (row, key) => row[key as keyof ClassAttribute]));
const filteredMethods = computed(() => {
  const query = methodSearchQuery.value.trim().toLocaleLowerCase('ru');
  if (!query) return methods.value;
  return methods.value.filter(method => [method.name, method.signature, method.owner, method.id, formatId(method.id)]
    .some(value => String(value ?? '').toLocaleLowerCase('ru').includes(query)));
});
const sortedMethods = computed(() => sortedRows(filteredMethods.value, methodSortKey.value, methodSortDirection.value, (row, key) => row[key as keyof ClassMethod]));
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
    if (details.value?.id !== event.data.details.id) {
      attributes.value = [];
      attributesLoading.value = false;
      attributesLoaded.value = false;
      attributesError.value = '';
      attributeSearchQuery.value = '';
      methods.value = [];
      methodsLoading.value = false;
      methodsLoaded.value = false;
      methodsError.value = '';
      methodSearchQuery.value = '';
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
  <main v-if="details" class="flex flex-col p-1">
    <Tabs :model-value="activeTab" class="gap-1" @update:model-value="onTabChange">
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

      <TabsContent value="attributes" class="flex flex-col gap-1 p-1">
        <div class="flex items-center justify-between gap-2">
          <label class="flex w-fit shrink-0 items-center gap-1 text-xs" title="Показать атрибуты родительских классов">
            <Checkbox
              :model-value="includeInheritedAttributes"
              :disabled="attributesLoading"
              @update:model-value="toggleInheritedAttributes"
            />
            <span aria-hidden="true">↥</span>
            Наследуемые атрибуты
          </label>
          <Input
            v-model="attributeSearchQuery"
            type="search"
            class="h-6 max-w-sm"
            placeholder="Поиск атрибута…"
            aria-label="Поиск атрибута по имени, сигнатуре, владельцу или ID"
          />
        </div>
        <Table v-if="attributesLoading || filteredAttributes.length > 0">
          <TableHeader>
            <TableRow>
              <SortableTableHead v-for="[label, key] in tableColumns" :key="key" class="h-6 px-1" :active="attributeSortKey === key" :direction="attributeSortDirection" @sort="sortAttributes(key)">{{ label }}</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="attributesLoading">
              <TableRow v-for="row in 8" :key="row">
                <TableCell v-for="column in 8" :key="column" class="px-1 py-0.5"><Skeleton class="h-4 w-full" /></TableCell>
              </TableRow>
            </template>
            <EntityContextMenu v-for="attribute in sortedAttributes" v-else :key="attribute.id" :entity-id="attribute.id">
            <TableRow>
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
            </TableRow>
            </EntityContextMenu>
          </TableBody>
        </Table>
        <Empty v-else-if="attributesError" class="min-h-0 py-8">
          <EmptyHeader><EmptyTitle>Не удалось загрузить атрибуты</EmptyTitle><EmptyDescription>{{ attributesError }}</EmptyDescription></EmptyHeader>
        </Empty>
        <Empty v-else-if="attributesLoaded" class="min-h-0 py-8">
          <EmptyHeader>
            <EmptyTitle>Атрибуты не найдены</EmptyTitle>
            <EmptyDescription v-if="attributeSearchQuery.trim()">Измените строку поиска или очистите её.</EmptyDescription>
            <EmptyDescription v-else>Для этого класса нет доступных атрибутов.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </TabsContent>

      <TabsContent value="methods" class="flex flex-col gap-1 p-1">
        <div class="flex items-center justify-between gap-2">
          <label class="flex w-fit shrink-0 items-center gap-1 text-xs" title="Показать методы родительских классов">
            <Checkbox
              :model-value="includeInheritedMethods"
              :disabled="methodsLoading"
              @update:model-value="toggleInheritedMethods"
            />
            <span aria-hidden="true">↥</span>
            Наследуемые методы
          </label>
          <Input
            v-model="methodSearchQuery"
            type="search"
            class="h-6 max-w-sm"
            placeholder="Поиск метода…"
            aria-label="Поиск метода по имени, сигнатуре, владельцу или ID"
          />
        </div>
        <Table v-if="methodsLoading || filteredMethods.length > 0">
          <TableHeader>
            <TableRow>
              <SortableTableHead v-for="[label, key] in tableColumns" :key="key" class="h-6 px-1" :active="methodSortKey === key" :direction="methodSortDirection" @sort="sortMethods(key)">{{ label }}</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="methodsLoading">
              <TableRow v-for="row in 8" :key="row">
                <TableCell v-for="column in 8" :key="column" class="px-1 py-0.5"><Skeleton class="h-4 w-full" /></TableCell>
              </TableRow>
            </template>
            <EntityContextMenu v-for="method in sortedMethods" v-else :key="method.id" :entity-id="method.id" svn @svn-action="methodSvnAction(method, $event)">
            <TableRow class="cursor-default" title="Двойной щелчок — открыть код метода" @dblclick="openMethod(method)">
              <TableCell class="max-w-64 px-1 py-0.5" :title="method.name">
                <span v-if="method.inherited" class="mr-1 text-muted-foreground" title="Наследуемый метод">↥</span>
                <span class="truncate">{{ method.name }}</span>
              </TableCell>
              <TableCell class="max-w-56 truncate px-1 py-0.5" :title="method.owner">{{ method.owner }}</TableCell>
              <TableCell class="max-w-96 px-1 py-0.5" :title="method.signature">
                <span class="whitespace-pre-wrap break-words font-mono text-xs">
                  <span v-for="(part, index) in signatureParts(method.signature)" :key="index" :class="signaturePartClass(part.kind)">{{ part.text }}</span>
                </span>
              </TableCell>
              <TableCell class="px-1 py-0.5">{{ method.type }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ formatId(method.id) }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ method.visibility }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ method.package }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ method.line }}</TableCell>
            </TableRow>
            </EntityContextMenu>
          </TableBody>
        </Table>
        <Empty v-else-if="methodsError" class="min-h-0 py-8">
          <EmptyHeader><EmptyTitle>Не удалось загрузить методы</EmptyTitle><EmptyDescription>{{ methodsError }}</EmptyDescription></EmptyHeader>
        </Empty>
        <Empty v-else-if="methodsLoaded" class="min-h-0 py-8">
          <EmptyHeader>
            <EmptyTitle>Методы не найдены</EmptyTitle>
            <EmptyDescription v-if="methodSearchQuery.trim()">Измените строку поиска или очистите её.</EmptyDescription>
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

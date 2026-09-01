<script setup lang="ts">
import type { ClassDetailsHostMessage } from '../../../src/core/webviewProtocol';
import type { ClassAttribute, ClassDetails } from '../../../src/features/classes/models';
import { ref } from 'vue';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { vscode } from '@/vscode';

const details = ref<ClassDetails>();
const activeTab = ref('class');
const attributes = ref<ClassAttribute[]>([]);
const attributesLoading = ref(false);
const attributesLoaded = ref(false);
const attributesError = ref('');
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
      activeTab.value = 'class';
    }
    details.value = event.data.details;
  } else if (event.data.command === 'classAttributesLoaded') {
    attributes.value = event.data.attributes;
    attributesLoading.value = false;
    attributesLoaded.value = true;
  } else if (event.data.command === 'classAttributesLoadFailed') {
    attributesLoading.value = false;
    attributesError.value = event.data.message;
  }
});

function onTabChange(value: string | number): void {
  activeTab.value = String(value);
  if (activeTab.value !== 'attributes' || attributesLoading.value || attributesLoaded.value) return;
  attributesLoading.value = true;
  attributesError.value = '';
  vscode.postMessage({ command: 'loadClassAttributes' });
}

vscode.postMessage({ command: 'classDetailsReady' });
</script>

<template>
  <main v-if="details" class="flex flex-col p-1">
    <Tabs :model-value="activeTab" class="gap-1" @update:model-value="onTabChange">
      <TabsList variant="line">
        <TabsTrigger value="class">Класс</TabsTrigger>
        <TabsTrigger value="attributes">Атрибуты</TabsTrigger>
      </TabsList>
      <TabsContent value="class" class="flex max-w-4xl flex-col gap-2 p-1">
        <FieldGroup class="grid gap-x-5 gap-y-2 lg:grid-cols-2">
          <FieldGroup class="gap-2">
            <FieldGroup class="gap-1">
              <Field v-for="[label, key] in fieldColumns[0]" :key="`${label}-${key}`" orientation="horizontal" class="gap-2">
                <FieldLabel :for="`class-${key}-${label}`" class="w-28 shrink-0 flex-none">{{ label }}</FieldLabel>
                <Input :id="`class-${key}-${label}`" :model-value="String(details[key] ?? '')" class="h-6" readonly />
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
              <Input :id="`class-${key}-${label}`" :model-value="String(details[key] ?? '')" class="h-6" readonly />
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

      <TabsContent value="attributes" class="p-1">
        <Table v-if="attributesLoading || attributes.length > 0">
          <TableHeader>
            <TableRow>
              <TableHead class="h-6 px-1">Имя</TableHead>
              <TableHead class="h-6 px-1">Владелец</TableHead>
              <TableHead class="h-6 px-1">Сигнатура</TableHead>
              <TableHead class="h-6 px-1">Тип</TableHead>
              <TableHead class="h-6 px-1">ID</TableHead>
              <TableHead class="h-6 px-1">Видимость</TableHead>
              <TableHead class="h-6 px-1">Пакет</TableHead>
              <TableHead class="h-6 px-1">Строка</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="attributesLoading">
              <TableRow v-for="row in 8" :key="row">
                <TableCell v-for="column in 8" :key="column" class="px-1 py-0.5"><Skeleton class="h-4 w-full" /></TableCell>
              </TableRow>
            </template>
            <TableRow v-for="attribute in attributes" v-else :key="attribute.id">
              <TableCell class="max-w-64 truncate px-1 py-0.5" :title="attribute.name">{{ attribute.name }}</TableCell>
              <TableCell class="max-w-56 truncate px-1 py-0.5" :title="attribute.owner">{{ attribute.owner }}</TableCell>
              <TableCell class="max-w-96 truncate px-1 py-0.5" :title="attribute.signature">{{ attribute.signature }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ attribute.type }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ attribute.id }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ attribute.visibility }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ attribute.package }}</TableCell>
              <TableCell class="px-1 py-0.5">{{ attribute.line }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Empty v-else-if="attributesError" class="min-h-0 py-8">
          <EmptyHeader><EmptyTitle>Не удалось загрузить атрибуты</EmptyTitle><EmptyDescription>{{ attributesError }}</EmptyDescription></EmptyHeader>
        </Empty>
        <Empty v-else-if="attributesLoaded" class="min-h-0 py-8">
          <EmptyHeader><EmptyTitle>Атрибуты не найдены</EmptyTitle><EmptyDescription>Для этого класса нет доступных атрибутов.</EmptyDescription></EmptyHeader>
        </Empty>
      </TabsContent>
    </Tabs>
  </main>
  <Empty v-else class="min-h-0 py-8"><EmptyHeader><EmptyTitle>Загрузка класса…</EmptyTitle><EmptyDescription>Получаем данные класса из расширения.</EmptyDescription></EmptyHeader></Empty>
</template>

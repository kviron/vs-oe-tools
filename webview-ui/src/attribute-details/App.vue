<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AttributeDetailsHostMessage } from '../../../src/core/webviewProtocol';
import type { AttributeDetails, AttributeEditorOptions, ClassAttributeDraft } from '../../../src/features/classes/models';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { vscode } from '@/vscode';

const details = ref<AttributeDetails>();
const creationOptions = ref<AttributeEditorOptions>();
const draft = ref<ClassAttributeDraft>();
const saving = ref(false);
const creationError = ref('');
const normalizedData = computed(() => new Map(
  Object.entries(details.value?.data ?? {}).map(([key, value]) => [key.toLocaleLowerCase('ru'), value]),
));

const mainLeftFields = [
  ['Идентификатор', ['id']],
  ['Владелец', ['owner', 'ownername', 'classname']],
  ['Имя', ['name']],
  ['Псевдоним', ['alias', 'aliases']],
  ['Тип', ['typename', 'type', 'attrtype', 'attributetype']],
] as const;

const mainRightFields = [
  ['Поле таблицы', ['dbfieldname', 'dbfield', 'fieldname', 'columnname']],
  ['Дистрибуция', ['distribution', 'distrib', 'package', 'packagename']],
  ['Обл. видимости', ['visibility', 'access', 'scope']],
] as const;

const flags = [
  ['Исторический', ['historical', 'ishistorical', 'history']],
  ['Вычисляемый', ['calculated', 'iscalculated', 'computed']],
  ['Статический', ['static', 'isstatic']],
  ['Не пустой', ['notnull', 'required', 'notempty']],
  ['Виртуальный', ['virtual', 'isvirtual']],
  ['Скрытый', ['hidden', 'ishidden']],
] as const;

const additionalLeftFields = [
  ['Классы значений (расширение)', ['valueclasses', 'valueclassextension', 'classextension']],
  ['Порядок', ['ord', 'order', 'sortorder']],
  ['Заголовок', ['caption', 'title']],
  ['Формат вывода', ['displayformat', 'outputformat']],
  ['Формат редактора', ['editorformat', 'editformat']],
  ['Роль для записи', ['writerole', 'editrole']],
  ['Роль для чтения', ['readrole', 'viewrole']],
  ['Значение', ['value', 'defvalue', 'defaultvalue']],
] as const;

const eventFields = [
  ['При сохранении', ['onsave', 'beforesave', 'aftersave']],
  ['При записи', ['onwrite', 'beforewrite', 'afterwrite']],
  ['При выборе', ['onselect', 'onchoice', 'onlookup']],
] as const;

function rawValue(...names: readonly string[]): unknown {
  for (const name of names) {
    const value = normalizedData.value.get(name.toLocaleLowerCase('ru'));
    if (value !== undefined && value !== null) return value;
  }
  return '';
}

function displayValue(names: readonly string[]): string {
  const value = rawValue(...names);
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value, null, 2);
  return String(value);
}

function booleanValue(names: readonly string[]): boolean {
  const value = rawValue(...names);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return ['1', 'true', 'yes', 'да'].includes(String(value).trim().toLocaleLowerCase('ru'));
}

function fieldValue(names: readonly string[]): string {
  if (names[0] === 'owner') return details.value?.ownerClassName ?? '';
  if (names.includes('attrtype') && details.value?.attributeTypeName) return details.value.attributeTypeName;
  return displayValue(names);
}

const expression = computed(() => displayValue(['calcexpression', 'calculatedexpression', 'expression', 'formula']));
const description = computed(() => displayValue(['description', 'descr', 'comment', 'notes']));
const props = computed(() => displayValue(['props', 'properties', 'propertytext']));

window.addEventListener('message', (event: MessageEvent<AttributeDetailsHostMessage>) => {
  if (event.data.command === 'attributeDetailsLoaded') details.value = event.data.details;
  else if (event.data.command === 'attributeCreationInitialized') {
    creationOptions.value = event.data.options;
    draft.value = { ...event.data.draft };
  } else if (event.data.command === 'attributeCreating') {
    saving.value = true;
    creationError.value = '';
  } else if (event.data.command === 'attributeCreated') {
    saving.value = false;
    details.value = event.data.details;
    creationOptions.value = undefined;
    draft.value = undefined;
  } else if (event.data.command === 'attributeCreationFailed') {
    saving.value = false;
    creationError.value = event.data.message;
  }
});

function setNumericField(field: 'attributeTypeId' | 'visibilityId' | 'distributionModeId', event: Event): void {
  if (draft.value && event.target instanceof HTMLSelectElement) draft.value[field] = Number(event.target.value);
}

function saveNewAttribute(): void {
  if (!draft.value || saving.value) return;
  vscode.postMessage({ command: 'createClassAttribute', draft: { ...draft.value } });
}
vscode.postMessage({ command: 'attributeDetailsReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col p-2">
    <template v-if="creationOptions && draft">
      <header class="mb-2 flex items-center gap-2">
        <h1 class="truncate text-sm font-semibold">Новый атрибут — {{ creationOptions.ownerClassName }}</h1>
        <Badge variant="secondary">виртуальный</Badge>
        <Button class="ml-auto" size="sm" :disabled="saving" @click="saveNewAttribute">{{ saving ? 'Сохранение…' : 'Создать атрибут' }}</Button>
      </header>
      <Tabs default-value="main" class="min-h-0 flex-1 gap-2">
        <TabsList variant="line"><TabsTrigger value="main">Основное</TabsTrigger><TabsTrigger value="additional">Дополнительное</TabsTrigger></TabsList>
        <TabsContent value="main" class="min-h-0 overflow-auto p-1">
          <FieldGroup class="gap-3">
            <p v-if="creationError" class="text-xs text-destructive">{{ creationError }}</p>
            <FieldGroup class="grid gap-x-6 gap-y-2 lg:grid-cols-2">
              <FieldGroup class="gap-1">
                <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-32 shrink-0 flex-none" for="attribute-owner">Владелец</FieldLabel><Input id="attribute-owner" :model-value="creationOptions.ownerClassName" readonly class="h-6" /></Field>
                <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-32 shrink-0 flex-none" for="attribute-name">Имя</FieldLabel><Input id="attribute-name" v-model="draft.name" autofocus class="h-6" /></Field>
                <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-32 shrink-0 flex-none" for="attribute-alias">Псевдоним</FieldLabel><Input id="attribute-alias" v-model="draft.aliases" class="h-6" /></Field>
                <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-32 shrink-0 flex-none" for="attribute-type">Тип</FieldLabel><NativeSelect id="attribute-type" class="w-full" :model-value="String(draft.attributeTypeId)" @change="setNumericField('attributeTypeId', $event)"><NativeSelectOption v-for="item in creationOptions.types" :key="item.id" :value="String(item.id)">{{ item.name }} ({{ item.id }})</NativeSelectOption></NativeSelect></Field>
                <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-32 shrink-0 flex-none" for="attribute-value-classes">Классы значений</FieldLabel><Input id="attribute-value-classes" v-model="draft.valueClasses" placeholder="ID через запятую" class="h-6" /></Field>
              </FieldGroup>
              <FieldGroup class="gap-1">
                <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-36 shrink-0 flex-none" for="attribute-field">Поле таблицы</FieldLabel><Input id="attribute-field" v-model="draft.dbFieldName" class="h-6" /></Field>
                <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-36 shrink-0 flex-none" for="attribute-visibility">Обл. видимости</FieldLabel><NativeSelect id="attribute-visibility" class="w-full" :model-value="String(draft.visibilityId)" @change="setNumericField('visibilityId', $event)"><NativeSelectOption v-for="item in creationOptions.visibilities" :key="item.id" :value="String(item.id)">{{ item.name }}</NativeSelectOption></NativeSelect></Field>
                <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-36 shrink-0 flex-none" for="attribute-distribution">Дистрибуция</FieldLabel><NativeSelect id="attribute-distribution" class="w-full" :model-value="String(draft.distributionModeId)" @change="setNumericField('distributionModeId', $event)"><NativeSelectOption v-for="item in creationOptions.distributionModes" :key="item.id" :value="String(item.id)">{{ item.name }}</NativeSelectOption></NativeSelect></Field>
                <FieldSet class="gap-1"><FieldLegend>Вид</FieldLegend><FieldGroup class="grid grid-cols-2 gap-x-3 gap-y-1">
                  <Field orientation="horizontal" class="gap-1"><Checkbox :model-value="draft.isNotNull" @update:model-value="value => draft && (draft.isNotNull = value === true)" /><FieldLabel>Не пустой</FieldLabel></Field>
                  <Field orientation="horizontal" class="gap-1" data-disabled><Checkbox :model-value="draft.virtual" disabled /><FieldLabel>Виртуальный</FieldLabel></Field>
                  <Field orientation="horizontal" class="gap-1"><Checkbox :model-value="draft.refIntegrityCheck" @update:model-value="value => draft && (draft.refIntegrityCheck = value === true)" /><FieldLabel>Проверять ссылки</FieldLabel></Field>
                </FieldGroup></FieldSet>
              </FieldGroup>
            </FieldGroup>
            <p class="text-xs text-muted-foreground">Физические атрибуты пока не создаются: для них нужен отдельно подтверждённый сценарий изменения таблицы.</p>
          </FieldGroup>
        </TabsContent>
        <TabsContent value="additional" class="min-h-0 overflow-auto p-1"><p class="text-xs text-muted-foreground">Остальные параметры будут добавляться после фиксации соответствующих операций в SQL-мониторе.</p></TabsContent>
      </Tabs>
    </template>
    <template v-else-if="details">
      <header class="mb-2 flex items-center gap-2">
        <h1 class="truncate text-sm font-semibold">{{ details.ownerClassName }}.{{ details.name }}</h1>
        <Badge variant="secondary">только чтение</Badge>
        <span class="ml-auto text-xs text-muted-foreground">ID {{ details.id }}</span>
      </header>

      <Tabs default-value="main" class="min-h-0 flex-1 gap-2">
        <TabsList variant="line">
          <TabsTrigger value="main">Основное</TabsTrigger>
          <TabsTrigger value="additional">Дополнительное</TabsTrigger>
          <TabsTrigger value="props">Props</TabsTrigger>
        </TabsList>

        <TabsContent value="main" class="min-h-0 overflow-auto p-1">
          <FieldGroup class="gap-3">
            <FieldGroup class="grid gap-x-6 gap-y-2 lg:grid-cols-2">
              <FieldGroup class="gap-1">
                <Field v-for="[label, names] in mainLeftFields" :key="label" orientation="horizontal" class="gap-2">
                  <FieldLabel class="w-28 shrink-0 flex-none">{{ label }}</FieldLabel>
                  <Input :model-value="fieldValue(names)" readonly class="h-6" />
                </Field>
              </FieldGroup>
              <FieldGroup class="gap-1">
                <Field v-for="[label, names] in mainRightFields" :key="label" orientation="horizontal" class="gap-2">
                  <FieldLabel class="w-32 shrink-0 flex-none">{{ label }}</FieldLabel>
                  <Input :model-value="fieldValue(names)" readonly class="h-6" />
                </Field>
                <FieldSet class="gap-1">
                  <FieldLegend>Вид</FieldLegend>
                  <FieldGroup class="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                    <Field v-for="[label, names] in flags" :key="label" orientation="horizontal" class="gap-1" data-disabled>
                      <Checkbox :model-value="booleanValue(names)" disabled />
                      <FieldLabel>{{ label }}</FieldLabel>
                    </Field>
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            </FieldGroup>

            <FieldSet class="min-h-64 flex-1 gap-1">
              <FieldLegend>Вычисляемое выражение</FieldLegend>
              <FieldGroup class="min-h-56 flex-1 gap-1">
                <Field class="min-h-56 flex-1"><Textarea :model-value="expression" readonly class="h-full min-h-56 resize-none font-mono" /></Field>
              </FieldGroup>
            </FieldSet>
          </FieldGroup>
        </TabsContent>

        <TabsContent value="additional" class="min-h-0 overflow-auto p-1">
          <FieldGroup class="gap-3">
            <FieldGroup class="grid gap-x-6 gap-y-2 lg:grid-cols-2">
              <FieldGroup class="gap-1">
                <Field v-for="[label, names] in additionalLeftFields" :key="label" orientation="horizontal" class="gap-2">
                  <FieldLabel class="w-48 shrink-0 flex-none">{{ label }}</FieldLabel>
                  <Input :model-value="fieldValue(names)" readonly class="h-6" />
                </Field>
                <Field orientation="horizontal" class="gap-1" data-disabled>
                  <Checkbox :model-value="booleanValue(['displayvaluetext', 'showvaluetext'])" disabled />
                  <FieldLabel>Задать текст вывода значений</FieldLabel>
                </Field>
                <Field v-for="[label, names] in [['1', ['valuetext1']], ['0', ['valuetext0']], ['Null', ['valuetextnull']]] as const" :key="label" orientation="horizontal" class="gap-2">
                  <FieldLabel class="w-10 shrink-0 flex-none">{{ label }}</FieldLabel>
                  <Input :model-value="fieldValue(names)" readonly class="h-6 max-w-48" />
                </Field>
              </FieldGroup>
              <FieldGroup class="gap-1">
                <Field v-for="[label, names] in eventFields" :key="label" orientation="horizontal" class="gap-2">
                  <FieldLabel class="w-28 shrink-0 flex-none">{{ label }}</FieldLabel>
                  <Input :model-value="fieldValue(names)" readonly class="h-6" />
                </Field>
              </FieldGroup>
            </FieldGroup>
            <FieldSet class="min-h-64 flex-1 gap-1">
              <FieldLegend>Описание</FieldLegend>
              <FieldGroup class="min-h-56 flex-1 gap-1">
                <Field class="min-h-56 flex-1"><Textarea :model-value="description" readonly class="h-full min-h-56 resize-none" /></Field>
              </FieldGroup>
            </FieldSet>
          </FieldGroup>
        </TabsContent>

        <TabsContent value="props" class="min-h-0 flex-1 p-1">
          <FieldGroup class="h-full gap-1">
            <Field class="h-full"><Textarea :model-value="props" readonly class="h-full min-h-80 resize-none font-mono" /></Field>
          </FieldGroup>
        </TabsContent>
      </Tabs>
    </template>
    <FieldGroup v-else class="gap-2">
      <Skeleton class="h-7 w-72" />
      <Skeleton class="h-7 w-full" />
      <Skeleton class="h-64 w-full" />
    </FieldGroup>
  </main>
</template>

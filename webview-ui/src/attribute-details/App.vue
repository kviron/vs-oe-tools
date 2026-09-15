<script setup lang="ts">
import { computed, ref } from 'vue';
import { Add01Icon, ArrowLeft01Icon, Copy01Icon, Edit02Icon, RefreshIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import type { AttributeDetailsHostMessage, AttributeDetailsWebviewMessage } from '../../../src/core/webviewProtocol';
import { validateNativeAttributeDraft, type NativeAttributeDraft } from '../../../src/features/classes/nativeAttributeEditing';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { vscode } from '@/vscode';

const state = ref<AttributeDetailsHostMessage>();
const draft = ref<NativeAttributeDraft>();
const saving = ref(false);
const attempted = ref(false);
const formError = ref('');
const editing = computed(() => state.value?.mode !== 'view');
const creating = computed(() => state.value?.mode === 'create');
const busy = computed(() => saving.value || Boolean(state.value?.busy));
const canSave = computed(() => editing.value && !busy.value && !state.value?.blocked);
const typeName = computed(() => state.value?.options.types.find(item => item.id === draft.value?.attributeTypeId)?.name ?? state.value?.details?.attributeTypeName ?? 'Тип не выбран');
const referenceType = computed(() => [322, 324, 325, 330, 333].includes(draft.value?.attributeTypeId ?? 0));
const typeOptions = computed(() => {
  const options = state.value?.options.types ?? [];
  return draft.value && !options.some(item => item.id === draft.value?.attributeTypeId)
    ? [{ id: draft.value.attributeTypeId, name: typeName.value }, ...options] : options;
});
const nameInvalid = computed(() => attempted.value && !draft.value?.name.trim());
const fieldInvalid = computed(() => attempted.value && draft.value?.storageInDb && !draft.value.dbFieldName.trim());
const classInvalid = computed(() => attempted.value && referenceType.value && !draft.value?.valueClass.trim());
const packageInvalid = computed(() => attempted.value && creating.value && !draft.value?.sysPackage.trim());
const expressionInvalid = computed(() => attempted.value && draft.value?.isComputedBy && !draft.value.computedByExpression.trim());
const extraFields = [
  ['aliases', 'Псевдоним'], ['title', 'Заголовок'], ['visibility', 'Видимость'], ['attrvaluedistrmode', 'Дистрибуция'],
  ['ord', 'Порядок'], ['defvalue', 'Значение по умолчанию'], ['dispformat', 'Формат вывода'], ['editformat', 'Формат редактора'],
  ['roleread', 'Роль для чтения'], ['rolewrite', 'Роль для записи'], ['onsetmethod', 'При записи'],
  ['onsavemethod', 'При сохранении'], ['onchoosemethod', 'При выборе'],
] as const;
const flags = [
  { key: 'isHistoric', label: 'Исторический', description: 'Хранить историю значений.' },
  { key: 'isStatic', label: 'Статический', description: 'Значение на уровне класса.' },
  { key: 'isComputedBy', label: 'Вычисляемый', description: 'Получать значение по SQL-выражению.' },
] as const;
function raw(key: string): string {
  const value = state.value?.details?.data[key];
  return value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}
function flag(key: string): boolean {
  return ['true', '1', '-1'].includes(raw(key).toLowerCase());
}
function action(command: Exclude<AttributeDetailsWebviewMessage['command'], 'attributeSave'>): void {
  if (busy.value) return;
  vscode.postMessage({ command });
}
function save(): void {
  if (!draft.value || !canSave.value) return;
  attempted.value = true; formError.value = '';
  try {
    validateNativeAttributeDraft(draft.value);
    if (creating.value && !draft.value.sysPackage.trim()) throw new Error('Укажите пакет для нового атрибута.');
  } catch (error) { formError.value = error instanceof Error ? error.message : String(error); return; }
  saving.value = true;
  vscode.postMessage({ command: 'attributeSave', draft: { ...draft.value } });
}
window.addEventListener('message', (event: MessageEvent<AttributeDetailsHostMessage>) => {
  const message = event.data;
  if (message.command !== 'attributeEditorState') return;
  // Copy/open-owner acknowledgements must not replace a locally edited draft.
  if (!draft.value || state.value?.mode !== message.mode || message.busy || message.mode === 'view') {
    draft.value = { ...message.draft };
  }
  if (state.value?.mode !== message.mode) { attempted.value = false; formError.value = ''; }
  state.value = message; saving.value = message.busy;
});
vscode.postMessage({ command: 'attributeDetailsReady' });
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <main class="flex h-screen min-h-0 flex-col overflow-auto bg-background p-4 sm:p-5">
        <div v-if="state && draft" class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
          <header class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" :disabled="busy" @click="action('attributeOpenOwner')">
                <HugeiconsIcon :icon="ArrowLeft01Icon" data-icon="inline-start" />{{ state.options.ownerClassName }}
              </Button>
              <span class="text-xs text-muted-foreground">Класс-владелец · {{ state.options.ownerClassId }}</span>
            </div>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="flex min-w-0 flex-col gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant="attribute">Атрибут</Badge>
                  <Badge v-if="editing" variant="outline">{{ creating ? 'Создание' : 'Редактирование' }}</Badge>
                  <Button v-if="state.details" variant="ghost" size="sm" :disabled="busy" title="Скопировать ID атрибута" @click="action('attributeCopyId')">
                    <HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />ID {{ state.details.id }}
                  </Button>
                </div>
                <h1 class="break-all text-xl font-semibold tracking-tight">{{ creating ? 'Новый атрибут' : state.details?.name }}</h1>
                <p class="text-xs text-muted-foreground">{{ typeName }} · {{ draft.storageInDb ? 'Хранится в БД' : 'Виртуальный' }}<template v-if="draft.isComputedBy"> · Вычисляемый</template></p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <template v-if="!editing">
                  <Button variant="outline" size="sm" :disabled="busy" @click="action('attributeRefresh')"><HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />Обновить</Button>
                  <Button variant="outline" size="sm" :disabled="busy || state.blocked" @click="action('attributeNew')"><HugeiconsIcon :icon="Add01Icon" data-icon="inline-start" />Создать атрибут</Button>
                  <Button size="sm" :disabled="busy || state.blocked" @click="action('attributeEdit')"><HugeiconsIcon :icon="Edit02Icon" data-icon="inline-start" />Редактировать</Button>
                </template>
                <template v-else>
                  <Button variant="outline" size="sm" :disabled="busy" @click="action('attributeCancel')">Отмена</Button>
                  <Button size="sm" :disabled="!canSave" @click="save"><HugeiconsIcon :icon="Tick02Icon" data-icon="inline-start" />{{ busy ? 'Сохранение…' : creating ? 'Создать атрибут' : 'Сохранить' }}</Button>
                </template>
              </div>
            </div>
          </header>

          <Alert v-if="state.error || formError" variant="destructive" role="alert"><AlertTitle>{{ state.blocked ? 'Нужна проверка результата' : 'Не удалось сохранить изменения' }}</AlertTitle><AlertDescription>{{ state.error || formError }}</AlertDescription></Alert>
          <Alert v-if="state.warning"><AlertTitle>Проверьте пакетную привязку</AlertTitle><AlertDescription>{{ state.warning }}</AlertDescription></Alert>

          <Tabs default-value="main" class="flex flex-1 flex-col gap-4">
            <TabsList variant="line" aria-label="Разделы атрибута">
              <TabsTrigger value="main">Основное</TabsTrigger>
              <TabsTrigger v-if="!creating" value="additional">Дополнительно</TabsTrigger>
              <TabsTrigger v-if="!creating" value="metadata">Метаданные</TabsTrigger>
            </TabsList>
            <TabsContent value="main" class="flex flex-col gap-4">
              <div class="grid items-start gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Определение</CardTitle><CardDescription>Имя, тип и класс значения атрибута.</CardDescription></CardHeader>
                  <CardContent>
                    <FieldGroup class="gap-4">
                      <Field :data-invalid="nameInvalid || undefined"><FieldLabel for="attribute-name">Имя атрибута</FieldLabel><Input id="attribute-name" v-model="draft.name" :readonly="!editing" :disabled="busy" :aria-invalid="nameInvalid" :autofocus="creating" placeholder="ИмяАтрибута" /><FieldError v-if="nameInvalid">Введите имя атрибута.</FieldError></Field>
                      <Field><FieldLabel for="attribute-type">Тип данных</FieldLabel>
                        <Select v-if="editing" :model-value="String(draft.attributeTypeId)" :disabled="busy" @update:model-value="value => draft && (draft.attributeTypeId = Number(value))">
                          <SelectTrigger id="attribute-type" class="w-full"><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                          <SelectContent><SelectGroup><SelectItem v-for="item in typeOptions" :key="item.id" :value="String(item.id)">{{ item.name }} · {{ item.id }}</SelectItem></SelectGroup></SelectContent>
                        </Select>
                        <Input v-else id="attribute-type" :model-value="`${typeName} · ${draft.attributeTypeId}`" readonly />
                      </Field>
                      <Field :data-invalid="classInvalid || undefined"><FieldLabel for="attribute-value-class">Класс значения</FieldLabel><Input id="attribute-value-class" v-model="draft.valueClass" :readonly="!editing" :disabled="busy" :aria-invalid="classInvalid" :placeholder="editing ? 'Имя или ID класса' : 'Не задан'" /><FieldDescription v-if="editing">{{ referenceType ? 'Обязателен для выбранного ссылочного типа.' : 'Для типов, ссылающихся на класс.' }} Нативный метод принимает один класс.</FieldDescription><FieldError v-if="classInvalid">Укажите класс значения.</FieldError></Field>
                      <Field v-if="creating" :data-invalid="packageInvalid || undefined"><FieldLabel for="attribute-package">Пакет</FieldLabel><Input id="attribute-package" v-model="draft.sysPackage" :disabled="busy" :aria-invalid="packageInvalid" placeholder="Имя или ID пакета" /><FieldDescription>Подставлен пакет класса. Используется при создании и назначении ID.</FieldDescription><FieldError v-if="packageInvalid">Укажите пакет.</FieldError></Field>
                    </FieldGroup>
                  </CardContent>
                  <CardFooter><p class="text-xs text-muted-foreground">Владелец: {{ state.options.ownerClassName }}. Изменения относятся к этому классу, включая наследуемые атрибуты.</p></CardFooter>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Хранение и поведение</CardTitle><CardDescription>Поле таблицы и способ получения значения.</CardDescription></CardHeader>
                  <CardContent>
                    <FieldGroup class="gap-4">
                      <Field orientation="horizontal" :data-disabled="!editing || busy || undefined"><Checkbox id="attribute-storage" v-model="draft.storageInDb" :disabled="!editing || busy" /><FieldContent><FieldLabel for="attribute-storage">Хранить в базе данных</FieldLabel><FieldDescription>{{ draft.storageInDb ? 'Физический атрибут с полем таблицы.' : 'Виртуальный атрибут без хранения значения.' }}</FieldDescription></FieldContent></Field>
                      <Field :data-invalid="fieldInvalid || undefined"><FieldLabel for="attribute-db-field">Поле таблицы</FieldLabel><Input id="attribute-db-field" v-model="draft.dbFieldName" :readonly="!editing" :disabled="busy" :aria-invalid="Boolean(fieldInvalid)" :placeholder="editing ? 'Например, aValue' : 'Не задано'" /><FieldError v-if="fieldInvalid">Для хранения в БД укажите поле таблицы.</FieldError></Field>
                      <FieldSet class="gap-3"><FieldLegend variant="label">Свойства</FieldLegend><FieldGroup class="gap-3">
                        <Field v-for="item in flags" :key="item.key" orientation="horizontal" :data-disabled="!editing || busy || undefined"><Checkbox :id="`attribute-${item.key}`" :model-value="draft[item.key]" :disabled="!editing || busy" @update:model-value="value => draft && (draft[item.key] = value === true)" /><FieldContent><FieldLabel :for="`attribute-${item.key}`">{{ item.label }}</FieldLabel><FieldDescription>{{ item.description }}</FieldDescription></FieldContent></Field>
                      </FieldGroup></FieldSet>
                    </FieldGroup>
                  </CardContent>
                  <CardFooter v-if="editing && draft.storageInDb"><p class="text-xs text-muted-foreground">Изменение структуры таблицы потребует подтверждения перед сохранением.</p></CardFooter>
                </Card>
              </div>
              <Card v-if="draft.isComputedBy || draft.computedByExpression">
                <CardHeader><CardTitle>Вычисляемое выражение</CardTitle><CardDescription>SQL-выражение, передаваемое штатному методу клиента.</CardDescription></CardHeader>
                <CardContent><Field :data-invalid="expressionInvalid || undefined"><FieldLabel for="attribute-expression" class="sr-only">SQL-выражение</FieldLabel><Textarea id="attribute-expression" v-model="draft.computedByExpression" :readonly="!editing" :disabled="busy" :aria-invalid="Boolean(expressionInvalid)" class="min-h-32" placeholder="SQL-выражение" /><FieldError v-if="expressionInvalid">Введите вычисляемое выражение.</FieldError></Field></CardContent>
              </Card>
            </TabsContent>
            <TabsContent v-if="!creating" value="additional">
              <Card><CardHeader><CardTitle>Дополнительные свойства</CardTitle><CardDescription>Данные из метаданных. Штатный метод редактирования не изменяет эти поля.</CardDescription></CardHeader>
                <CardContent><FieldGroup class="grid gap-4 sm:grid-cols-2"><Field v-for="[key, label] in extraFields" :key="key"><FieldLabel :for="`extra-${key}`">{{ label }}</FieldLabel><Input :id="`extra-${key}`" :model-value="raw(key)" readonly /></Field></FieldGroup></CardContent>
                <CardFooter><div class="flex flex-wrap gap-2"><Badge variant="outline">Не пустой: {{ flag('isnotnull') ? 'да' : 'нет' }}</Badge><Badge variant="outline">Скрытый: {{ flag('hidden') ? 'да' : 'нет' }}</Badge><Badge v-if="state.details?.createdBy" variant="secondary">Автор: {{ state.details.createdBy }}</Badge></div></CardFooter>
              </Card>
            </TabsContent>
            <TabsContent v-if="!creating" value="metadata" class="flex flex-col gap-4">
              <Card><CardHeader><CardTitle>Props</CardTitle><CardDescription>Дополнительные параметры атрибута без преобразований.</CardDescription></CardHeader><CardContent><Field><FieldLabel for="attribute-props" class="sr-only">Props</FieldLabel><Textarea id="attribute-props" :model-value="raw('props')" readonly class="min-h-32" /></Field></CardContent></Card>
              <Card><CardHeader><CardTitle>Все метаданные</CardTitle><CardDescription>Исходные значения полей · только чтение.</CardDescription></CardHeader><CardContent><Field><FieldLabel for="attribute-metadata" class="sr-only">Все метаданные</FieldLabel><Textarea id="attribute-metadata" :model-value="JSON.stringify(state.details?.data ?? {}, null, 2)" readonly class="min-h-72" /></Field></CardContent></Card>
            </TabsContent>
          </Tabs>
          <p role="status" aria-live="polite" class="text-xs text-muted-foreground">{{ busy ? 'Сохранение через клиент ВЭ и проверка результата…' : editing ? 'Изменения будут применены только после сохранения через клиент ВЭ.' : 'Просмотр атрибута. Для изменения данных нажмите «Редактировать».' }}</p>
        </div>
        <FieldGroup v-else class="mx-auto max-w-5xl gap-4" aria-label="Загрузка атрибута"><Skeleton class="h-8 w-60" /><Skeleton class="h-12 w-full" /><Skeleton class="h-80 w-full" /></FieldGroup>
      </main>
    </ContextMenuTrigger>
    <ContextMenuContent v-if="state">
      <ContextMenuGroup>
        <ContextMenuItem v-if="!editing" :disabled="busy || state.blocked" @select="action('attributeEdit')"><HugeiconsIcon :icon="Edit02Icon" data-icon="inline-start" />Редактировать атрибут</ContextMenuItem>
        <ContextMenuItem v-if="!editing" :disabled="busy || state.blocked" @select="action('attributeNew')"><HugeiconsIcon :icon="Add01Icon" data-icon="inline-start" />Создать атрибут в этом классе…</ContextMenuItem>
        <ContextMenuItem v-if="editing" :disabled="!canSave" @select="save"><HugeiconsIcon :icon="Tick02Icon" data-icon="inline-start" />{{ creating ? 'Создать атрибут' : 'Сохранить изменения' }}</ContextMenuItem>
        <ContextMenuItem v-if="state.details" :disabled="busy" @select="action('attributeCopyId')"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />Скопировать ID</ContextMenuItem>
        <ContextMenuItem v-if="!editing" :disabled="busy" @select="action('attributeRefresh')"><HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />Обновить</ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  </ContextMenu>
</template>

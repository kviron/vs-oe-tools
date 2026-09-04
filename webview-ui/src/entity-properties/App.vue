<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ObjectViewResult } from '../../../src/features/classes/models';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { vscode } from '@/vscode';

const result = ref<ObjectViewResult>();
const attributes = ref<Record<string, unknown>>({});
const isMethod = computed(() => result.value?.className.toLocaleLowerCase('ru').includes('метод') ?? false);
function value(name: string): unknown { return attributes.value[name.toLocaleLowerCase('ru')]; }
function propertyValue(...names: string[]): unknown {
  const normalized = names.map(name => name.toLocaleLowerCase('ru'));
  return result.value?.fields.find(field => normalized.includes(field.attributeName.toLocaleLowerCase('ru')))?.value;
}
const methodType = computed(() => String(value('methtype') ?? ''));
const methodKind = computed(() => String(value('methkind') ?? '0'));
function display(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
function closePanel(): void { window.close(); }
window.addEventListener('message', event => {
  if (event.data?.command === 'entityPropertiesLoaded') { result.value = event.data.result; attributes.value = event.data.attributes ?? {}; }
});
vscode.postMessage({ command: 'entityPropertiesReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col bg-background p-3 text-foreground">
    <template v-if="result">
      <header class="mb-3 flex items-center gap-2"><h1 class="truncate text-sm font-semibold">{{ result.className }} — {{ result.name }}</h1><Badge variant="secondary">только чтение</Badge><span class="ml-auto text-xs text-muted-foreground">ID {{ result.id }}</span></header>
      <FieldGroup v-if="isMethod" class="max-w-3xl gap-2">
        <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-40 shrink-0">Имя / Ид</FieldLabel><Input :model-value="String(value('name') ?? result.name)" readonly class="h-7" /></Field>
        <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-40 shrink-0">Псевдонимы</FieldLabel><Input :model-value="String(value('aliases') ?? '')" readonly class="h-7" /></Field>
        <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-40 shrink-0">Полное имя</FieldLabel><Input :model-value="String(value('fullname') ?? '')" readonly class="h-7" /></Field>
        <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-40 shrink-0">Обл. видимости</FieldLabel><Input :model-value="String(propertyValue('ОбластьВидимости', 'Видимость') ?? value('visibility') ?? '')" readonly class="h-7" /></Field>
        <div class="grid grid-cols-2 gap-3 pt-1 text-xs">
          <fieldset class="rounded border p-2"><legend class="px-1">Тип метода</legend><RadioGroup :model-value="methodType === '3' ? 'interpreted' : 'object'" disabled class="gap-1"><label class="flex items-center gap-1"><RadioGroupItem value="object" />Объектный</label><label class="flex items-center gap-1"><RadioGroupItem value="interpreted" />Интерпретируемый</label></RadioGroup></fieldset>
          <fieldset class="rounded border p-2"><legend class="px-1">Принадлежит</legend><RadioGroup model-value="class" disabled class="gap-1"><label class="flex items-center gap-1"><RadioGroupItem value="class" />Классу</label><label class="flex items-center gap-1"><RadioGroupItem value="object" />Объекту</label></RadioGroup></fieldset>
        </div>
        <fieldset class="rounded border p-2 text-xs"><legend class="px-1">Вид метода</legend><RadioGroup :model-value="methodKind" disabled class="flex gap-8"><label class="flex items-center gap-1"><RadioGroupItem value="0" />Простой</label><label class="flex items-center gap-1"><RadioGroupItem value="1" />Статический</label><label class="flex items-center gap-1"><RadioGroupItem value="2" />Конструктор</label></RadioGroup></fieldset>
      </FieldGroup>
      <FieldGroup v-else class="min-h-0 max-w-3xl gap-2 overflow-auto">
        <Field v-for="field in result.fields" :key="String(field.attributeId ?? field.attributeName)" orientation="horizontal" class="gap-2">
          <FieldLabel class="w-52 shrink-0">{{ field.attributeName }}</FieldLabel>
          <Input :model-value="display(field.value)" :title="display(field.value)" readonly class="h-7" />
        </Field>
      </FieldGroup>
      <footer class="mt-auto flex justify-end gap-2 border-t pt-2"><Button size="sm" disabled>Сохранить</Button><Button size="sm" variant="outline" disabled>Отменить</Button><Button size="sm" variant="outline" @click="closePanel">Закрыть</Button></footer>
    </template>
    <FieldGroup v-else class="gap-2"><Skeleton v-for="row in 7" :key="row" class="h-7 w-full" /></FieldGroup>
  </main>
</template>

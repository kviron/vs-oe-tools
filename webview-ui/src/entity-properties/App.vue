<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowLeft01Icon, CodeIcon, Copy01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import type { EntityPropertiesHostMessage, EntityPropertiesWebviewMessage } from '../../../src/core/webviewProtocol';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import MethodSignature from '@/components/MethodSignature.vue';
import { vscode } from '@/vscode';

const state = ref<EntityPropertiesHostMessage>();
const method = computed(() => state.value?.method);
const busy = computed(() => Boolean(state.value?.busy));
const kindLabel = computed(() => {
  if (method.value?.methodKind === 6) return 'Процедура класса';
  if (method.value?.methodKind === 2) return 'Конструктор';
  if (method.value?.methodKind === 1) return 'Статический';
  return 'Простой';
});
const typeLabel = computed(() => method.value?.methodType === 3 ? 'Интерпретируемый' : 'Объектный');
const visibleProperties = computed(() => state.value?.result.fields.filter((field) => {
  const name = field.attributeName.toLocaleLowerCase('ru').replaceAll(/[_\s]/g, '');
  const tableField = field.tableField.toLocaleLowerCase('ru').replaceAll(/[_\s]/g, '');
  return !['_группа', '_путькпакетам', '_путькфайлу'].includes(field.attributeName)
    && !['code', 'код'].includes(name)
    && !['code', 'код'].includes(tableField);
}) ?? []);

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}

function action(command: EntityPropertiesWebviewMessage['command']): void {
  if (!busy.value) vscode.postMessage({ command });
}

window.addEventListener('message', (event: MessageEvent<EntityPropertiesHostMessage>) => {
  if (event.data.command === 'entityPropertiesLoaded') state.value = event.data;
});
vscode.postMessage({ command: 'entityPropertiesReady' });
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <main class="flex h-screen min-h-0 min-w-0 flex-col overflow-auto bg-background p-3 sm:p-5">
        <div v-if="state" class="flex w-full min-w-0 flex-1 flex-col gap-4">
          <template v-if="method">
            <header class="flex shrink-0 flex-col gap-3">
              <div class="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" :disabled="busy" @click="action('methodPropertiesOpenOwner')">
                  <HugeiconsIcon :icon="ArrowLeft01Icon" data-icon="inline-start" />{{ method.ownerClassName || `Класс ${method.ownerClassId}` }}
                </Button>
                <span class="text-xs text-muted-foreground">Класс-владелец · {{ method.ownerClassId }}</span>
              </div>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-3">
                  <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <HugeiconsIcon :icon="CodeIcon" class="size-5 text-kind-method" />
                  </div>
                  <div class="min-w-0">
                    <h1 class="truncate text-lg font-semibold" :title="method.name">{{ method.name }}</h1>
                    <p class="truncate text-xs text-muted-foreground">{{ typeLabel }} · {{ kindLabel }}<template v-if="method.packageName"> · {{ method.packageName }}</template></p>
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant="method">Метод</Badge>
                  <Button variant="outline" size="sm" :disabled="busy" title="Скопировать ID метода" @click="action('methodPropertiesCopyId')"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />ID {{ method.id }}</Button>
                  <Button variant="outline" size="sm" :disabled="busy" @click="action('entityPropertiesRefresh')"><HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />Обновить</Button>
                  <Button size="sm" :disabled="busy" @click="action('methodPropertiesOpenCode')"><HugeiconsIcon :icon="CodeIcon" data-icon="inline-start" />Открыть код</Button>
                </div>
              </div>
            </header>

            <Alert v-if="state.error" variant="destructive" role="alert"><AlertTitle>Не удалось обновить свойства</AlertTitle><AlertDescription>{{ state.error }}</AlertDescription></Alert>

            <Tabs default-value="main" class="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              <TabsList class="h-auto min-h-8 max-w-full shrink-0 flex-wrap" aria-label="Разделы свойств метода"><TabsTrigger value="main">Основное</TabsTrigger><TabsTrigger value="metadata">Метаданные</TabsTrigger></TabsList>
              <TabsContent value="main" class="min-h-0 flex-1 overflow-auto p-0.5">
                <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
                  <Card class="min-w-0">
                    <CardHeader><CardTitle>Определение</CardTitle><CardDescription>Имя и расположение метода.</CardDescription></CardHeader>
                    <CardContent><FieldGroup class="gap-4">
                      <Field><FieldLabel for="method-name">Имя</FieldLabel><Input id="method-name" :model-value="method.name" readonly /></Field>
                      <Field><FieldLabel for="method-aliases">Псевдонимы</FieldLabel><Input id="method-aliases" :model-value="method.aliases || '—'" readonly /></Field>
                      <Field><FieldLabel for="method-full-name">Полное имя</FieldLabel><Input id="method-full-name" :model-value="method.fullName || '—'" readonly /></Field>
                      <Field><FieldLabel for="method-owner">Владелец</FieldLabel><Input id="method-owner" :model-value="method.ownerClassName || String(method.ownerClassId)" readonly /></Field>
                      <Field><FieldLabel for="method-belongs">Принадлежит</FieldLabel><Input id="method-belongs" model-value="Классу" readonly /></Field>
                      <Field><FieldLabel for="method-package">Пакет</FieldLabel><Input id="method-package" :model-value="method.packageName || '—'" readonly /></Field>
                    </FieldGroup></CardContent>
                  </Card>
                  <Card class="min-w-0">
                    <CardHeader><CardTitle>Исполнение</CardTitle><CardDescription>Тип, вид и область видимости метода.</CardDescription></CardHeader>
                    <CardContent><FieldGroup class="gap-4">
                      <Field><FieldLabel for="method-type">Тип метода</FieldLabel><Input id="method-type" :model-value="`${typeLabel} · ${method.methodType ?? '—'}`" readonly /></Field>
                      <Field><FieldLabel for="method-kind">Вид метода</FieldLabel><Input id="method-kind" :model-value="`${kindLabel} · ${method.methodKind ?? '—'}`" readonly /></Field>
                      <Field><FieldLabel for="method-visibility">Область видимости</FieldLabel><Input id="method-visibility" :model-value="method.visibility || '—'" readonly /></Field>
                    </FieldGroup></CardContent>
                  </Card>
                </div>
                <Card class="min-w-0">
                  <CardHeader><CardTitle>Сигнатура</CardTitle><CardDescription>Параметры и возвращаемое значение метода.</CardDescription></CardHeader>
                  <CardContent><pre class="whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 font-mono text-xs"><MethodSignature :signature="method.signature || 'Сигнатура не задана'" /></pre></CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="metadata" class="min-h-0 flex-1 overflow-auto p-0.5">
                <Card class="min-w-0">
                  <CardHeader><CardTitle>Все свойства объекта</CardTitle><CardDescription>Вычисляемые и системные значения метода · только чтение.</CardDescription></CardHeader>
                  <CardContent><FieldGroup class="grid gap-4 sm:grid-cols-2">
                    <Field v-for="field in visibleProperties" :key="String(field.attributeId ?? field.attributeName)">
                      <FieldLabel>{{ field.attributeName }}</FieldLabel>
                      <Textarea v-if="display(field.value).includes('\n')" :model-value="display(field.value)" readonly class="min-h-24 font-mono" />
                      <Input v-else :model-value="display(field.value)" readonly />
                    </Field>
                  </FieldGroup></CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            <p role="status" aria-live="polite" class="text-xs text-muted-foreground">{{ busy ? 'Обновление свойств…' : 'Просмотр свойств метода.' }}</p>
          </template>

          <template v-else>
            <header class="flex flex-wrap items-center gap-2"><Badge variant="secondary">{{ state.result.className }}</Badge><h1 class="truncate text-lg font-semibold">{{ state.result.name }}</h1><span class="ml-auto text-xs text-muted-foreground">ID {{ state.result.id }}</span><Button variant="outline" size="sm" @click="action('entityPropertiesRefresh')"><HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />Обновить</Button></header>
            <Card class="min-w-0"><CardHeader><CardTitle>Свойства объекта</CardTitle><CardDescription>Вычисляемые и системные значения · только чтение.</CardDescription></CardHeader><CardContent><FieldGroup class="grid gap-4 sm:grid-cols-2"><Field v-for="field in visibleProperties" :key="String(field.attributeId ?? field.attributeName)"><FieldLabel>{{ field.attributeName }}</FieldLabel><Input :model-value="display(field.value)" readonly /></Field></FieldGroup></CardContent></Card>
          </template>
        </div>
        <FieldGroup v-else class="w-full gap-4"><Skeleton class="h-8 w-64" /><Skeleton class="h-12 w-full" /><Skeleton class="h-80 w-full" /></FieldGroup>
      </main>
    </ContextMenuTrigger>
    <ContextMenuContent v-if="method"><ContextMenuGroup>
      <ContextMenuItem :disabled="busy" @select="action('methodPropertiesOpenCode')"><HugeiconsIcon :icon="CodeIcon" data-icon="inline-start" />Открыть код</ContextMenuItem>
      <ContextMenuItem :disabled="busy" @select="action('methodPropertiesCopyId')"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />Скопировать ID</ContextMenuItem>
      <ContextMenuItem :disabled="busy" @select="action('entityPropertiesRefresh')"><HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />Обновить</ContextMenuItem>
    </ContextMenuGroup></ContextMenuContent>
  </ContextMenu>
</template>

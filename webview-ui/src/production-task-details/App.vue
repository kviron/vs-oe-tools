<script setup lang="ts">
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, reactive, ref } from 'vue';
import type { ProductionTaskDetailsHostMessage } from '../../../src/core/webviewProtocol';
import type { DatabaseObjectSearchResult } from '../../../src/core/objectSearch';
import type { ProductionTaskAttachment, ProductionTaskSummary } from '../../../src/features/production-tasks/models';
import { splitWorkDescriptionObjectIds } from '../../../src/features/production-tasks/workDescriptionLinks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { vscode } from '@/vscode';

const task = ref<ProductionTaskSummary>();
const detailsTab = ref('description');
const attachments = ref<ProductionTaskAttachment[]>([]);
const attachmentsLoading = ref(false);
const attachmentsLoaded = ref(false);
const attachmentsError = ref('');
const peopleFields = [
  ['Автор', 'author'], ['Менеджер', 'manager'], ['Аналитик', 'analyst'],
  ['Исполнитель', 'executor'], ['Проверяющий', 'reviewer'],
] as const;
const workFields = [
  ['Вид деятельности', 'activityKind'], ['Обращение', 'appeal'], ['Крайний срок', 'deadline'],
  ['Пакет', 'packageName'], ['Раздел новостей', 'newsSection'],
] as const;
const typeFields = [
  ['Тип', 'workType'], ['Приоритет', 'priority'], ['Трудоёмкость', 'effort'],
  ['Релиз (план)', 'releasePlan'], ['Релиз (факт)', 'releaseActual'],
  ['Ревизия (trunk)', 'revisionTrunk'], ['Ревизия (branch)', 'revisionBranch'],
] as const;
const workDescriptionParts = computed(() => splitWorkDescriptionObjectIds(task.value?.workDescription || 'Описание работы не заполнено.'));
type PreviewState = { status: 'loading' } | { status: 'loaded'; object?: DatabaseObjectSearchResult } | { status: 'failed'; message: string };
const objectPreviews = reactive(new Map<number, PreviewState>());
const activePreviewIndex = ref<number>();
let closePreviewTimer: ReturnType<typeof setTimeout> | undefined;

function displayValue(key: keyof ProductionTaskSummary): string {
  const value = task.value?.[key];
  if (typeof value !== 'string' || !value) return '—';
  if (key === 'effort') {
    const numeric = Number(value.replace(',', '.'));
    return Number.isFinite(numeric) ? numeric.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value;
  }
  if (key === 'revisionTrunk' || key === 'revisionBranch') {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric.toLocaleString('ru-RU') : value;
  }
  return value;
}
function openInClient(): void { if (task.value) vscode.postMessage({ command: 'openProductionTaskInClient', id: task.value.id }); }
function loadAttachments(force = false): void {
  if (attachmentsLoading.value || attachmentsLoaded.value && !force) return;
  attachmentsLoading.value = true;
  attachmentsError.value = '';
  vscode.postMessage({ command: 'loadProductionTaskAttachments' });
}
function selectDetailsTab(value: string | number): void {
  detailsTab.value = String(value);
  if (detailsTab.value === 'attachments') loadAttachments();
}
function openDatabaseObject(id: number): void {
  activePreviewIndex.value = undefined;
  vscode.postMessage({ command: 'openDatabaseObjectById', id });
}
function showObjectPreview(id: number, index: number): void {
  if (closePreviewTimer) clearTimeout(closePreviewTimer);
  activePreviewIndex.value = index;
  if (objectPreviews.has(id)) return;
  objectPreviews.set(id, { status: 'loading' });
  vscode.postMessage({ command: 'loadDatabaseObjectPreview', id });
}
function keepObjectPreviewOpen(): void { if (closePreviewTimer) clearTimeout(closePreviewTimer); }
function closeObjectPreviewSoon(): void {
  if (closePreviewTimer) clearTimeout(closePreviewTimer);
  closePreviewTimer = setTimeout(() => { activePreviewIndex.value = undefined; }, 120);
}
function previewObject(id: number): DatabaseObjectSearchResult | undefined {
  const preview = objectPreviews.get(id);
  return preview?.status === 'loaded' ? preview.object : undefined;
}
function previewStatus(id: number): PreviewState['status'] | undefined { return objectPreviews.get(id)?.status; }
function previewError(id: number): string { const preview = objectPreviews.get(id); return preview?.status === 'failed' ? preview.message : ''; }
function objectKindLabel(kind: DatabaseObjectSearchResult['kind']): string {
  return { class: 'Класс', method: 'Метод', attribute: 'Атрибут', lifecycle: 'Жизненный цикл', journal: 'Журнал', list: 'Список', object: 'Объект' }[kind];
}
function objectKindBadgeVariant(kind: DatabaseObjectSearchResult['kind']): DatabaseObjectSearchResult['kind'] {
  return kind;
}
function previewRows(object: DatabaseObjectSearchResult): Array<[string, string]> {
  return [
    ['Владелец', [object.ownerName, object.ownerId && `ID ${object.ownerId}`].filter(Boolean).join(' · ')],
    ['Класс владельца', object.ownerClassName],
    ['Мета-класс', object.metaClassName],
    ['Пакет', object.packageName],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}
window.addEventListener('message', (event: MessageEvent<ProductionTaskDetailsHostMessage>) => {
  const message = event.data;
  if (message.command === 'productionTaskDetailsLoaded') { task.value = message.task; return; }
  if (message.command === 'productionTaskAttachmentsLoading') {
    attachmentsLoading.value = true;
    attachmentsError.value = '';
    return;
  }
  if (message.command === 'productionTaskAttachmentsLoaded') {
    attachments.value = message.attachments;
    attachmentsLoading.value = false;
    attachmentsLoaded.value = true;
    attachmentsError.value = '';
    return;
  }
  if (message.command === 'productionTaskAttachmentsFailed') {
    attachmentsLoading.value = false;
    attachmentsLoaded.value = false;
    attachmentsError.value = message.message;
    return;
  }
  if (message.command === 'databaseObjectPreviewLoaded') {
    objectPreviews.set(message.id, { status: 'loaded', object: message.object });
    return;
  }
  objectPreviews.set(message.id, { status: 'failed', message: message.message });
});
vscode.postMessage({ command: 'productionTaskDetailsReady' });
</script>

<template>
  <main class="min-h-screen bg-background p-3 text-foreground">
    <div v-if="!task" class="flex flex-col gap-2"><Skeleton class="h-9 w-72" /><Skeleton class="h-44 w-full" /></div>
    <div v-else class="mx-auto flex max-w-7xl flex-col gap-3">
      <header class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div>
          <h1 class="text-lg font-semibold">Задача {{ task.number || task.id }}</h1>
          <p class="text-xs text-muted-foreground">ID {{ task.id }}</p>
        </div>
        <Badge variant="secondary">{{ task.state || 'Без статуса' }}</Badge>
        <div class="min-w-0 text-xs text-muted-foreground">
          <p v-if="task.createdAt">{{ task.createdAt }}</p>
          <p v-if="task.executor" class="truncate">{{ task.executor }}</p>
        </div>
        <Button class="ml-auto" size="sm" @click="openInClient"><HugeiconsIcon :icon="ArrowUpRight01Icon" data-icon="inline-start" />Открыть в Восточном Экспрессе</Button>
      </header>
      <Separator />

      <Card>
        <CardContent class="grid gap-3 pt-4 md:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)]">
          <div><p class="mb-1 text-xs text-muted-foreground">Наименование</p><p class="whitespace-pre-wrap text-sm">{{ task.title || '—' }}</p></div>
          <div><p class="mb-1 text-xs text-muted-foreground">Проект</p><p class="break-words text-sm">{{ task.project || '—' }}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2"><CardTitle class="text-sm">Параметры работы</CardTitle></CardHeader>
        <CardContent class="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(14rem,1fr)_minmax(16rem,1.25fr)_minmax(13rem,.8fr)]">
          <dl class="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
            <template v-for="field in peopleFields" :key="field[1]"><dt class="text-muted-foreground">{{ field[0] }}</dt><dd class="break-words">{{ displayValue(field[1]) }}</dd></template>
          </dl>
          <dl class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
            <template v-for="field in workFields" :key="field[1]"><dt class="text-muted-foreground">{{ field[0] }}</dt><dd class="break-words">{{ displayValue(field[1]) }}</dd></template>
          </dl>
          <dl class="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
            <template v-for="field in typeFields" :key="field[1]"><dt class="text-muted-foreground">{{ field[0] }}</dt><dd class="break-words">{{ displayValue(field[1]) }}</dd></template>
          </dl>
        </CardContent>
      </Card>

      <Tabs :model-value="detailsTab" class="flex flex-col gap-2" @update:model-value="selectDetailsTab">
        <TabsList>
          <TabsTrigger value="description">Описание</TabsTrigger>
          <TabsTrigger value="attachments">Вложения<template v-if="attachmentsLoaded"> ({{ attachments.length }})</template></TabsTrigger>
        </TabsList>
        <TabsContent value="description">
          <Card>
            <CardHeader class="pb-2"><CardTitle class="text-sm">Описание работы</CardTitle></CardHeader>
        <CardContent class="whitespace-pre-wrap text-sm leading-5">
          <template v-for="(part, index) in workDescriptionParts" :key="index">
            <Popover v-if="part.id" :open="activePreviewIndex === index">
              <PopoverAnchor as-child>
                <Button variant="link" class="inline h-auto cursor-pointer p-0 align-baseline text-sm leading-5" :title="`Открыть объект ID=${part.id}`" @pointerenter="showObjectPreview(part.id, index)" @pointerleave="closeObjectPreviewSoon" @focus="showObjectPreview(part.id, index)" @blur="closeObjectPreviewSoon" @click="openDatabaseObject(part.id)">{{ part.text }}</Button>
              </PopoverAnchor>
              <PopoverContent class="w-80" align="start" @pointerenter="keepObjectPreviewOpen" @pointerleave="closeObjectPreviewSoon">
                <div v-if="previewStatus(part.id) === 'loading'" class="flex flex-col gap-2">
                  <Skeleton class="h-5 w-2/3" /><Skeleton class="h-4 w-full" /><Skeleton class="h-4 w-4/5" />
                </div>
                <div v-else-if="previewStatus(part.id) === 'failed'" class="flex flex-col gap-1">
                  <p class="font-medium">Не удалось загрузить объект</p><p class="break-words text-muted-foreground">{{ previewError(part.id) }}</p>
                </div>
                <div v-else-if="previewObject(part.id)" class="flex flex-col gap-3">
                  <div class="flex items-start gap-2">
                    <div class="min-w-0 flex-1"><p class="break-words font-semibold">{{ previewObject(part.id)?.name || `Объект ${part.id}` }}</p><p class="font-mono text-muted-foreground">ID {{ part.id }}</p></div>
                    <Badge :variant="objectKindBadgeVariant(previewObject(part.id)!.kind)">{{ objectKindLabel(previewObject(part.id)!.kind) }}</Badge>
                  </div>
                  <dl v-if="previewRows(previewObject(part.id)!).length" class="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                    <template v-for="row in previewRows(previewObject(part.id)!)" :key="row[0]"><dt class="text-muted-foreground">{{ row[0] }}</dt><dd class="break-words">{{ row[1] }}</dd></template>
                  </dl>
                  <p class="text-muted-foreground">Нажми на ID, чтобы выбрать способ открытия.</p>
                </div>
                <div v-else class="flex flex-col gap-1"><p class="font-medium">Объект не найден</p><p class="text-muted-foreground">В активной базе нет объекта с ID {{ part.id }}.</p></div>
              </PopoverContent>
            </Popover>
            <span v-else>{{ part.text }}</span>
          </template>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="attachments">
          <Card>
            <CardHeader class="pb-2"><CardTitle class="text-sm">Вложения</CardTitle></CardHeader>
            <CardContent>
              <div v-if="attachmentsLoading" class="flex flex-col gap-2"><Skeleton v-for="index in 5" :key="index" class="h-8 w-full" /></div>
              <Empty v-else-if="attachmentsError" class="py-8">
                <EmptyHeader><EmptyTitle>Не удалось загрузить вложения</EmptyTitle><EmptyDescription class="break-words">{{ attachmentsError }}</EmptyDescription></EmptyHeader>
                <EmptyContent><Button size="sm" variant="outline" @click="loadAttachments(true)">Повторить</Button></EmptyContent>
              </Empty>
              <Empty v-else-if="attachmentsLoaded && !attachments.length" class="py-8">
                <EmptyHeader><EmptyTitle>Вложений нет</EmptyTitle><EmptyDescription>К этой задаче не прикреплено файлов.</EmptyDescription></EmptyHeader>
              </Empty>
              <Table v-else container-class="max-h-[32rem] overflow-auto">
                <TableHeader class="sticky top-0 bg-background"><TableRow>
                  <TableHead class="w-28">ID</TableHead><TableHead class="min-w-64">Наименование</TableHead><TableHead class="min-w-64">Имя файла</TableHead>
                  <TableHead class="w-28">Расширение</TableHead><TableHead class="w-28">Размер</TableHead><TableHead class="w-40">Изменён</TableHead><TableHead class="min-w-72">Комментарий</TableHead>
                </TableRow></TableHeader>
                <TableBody><TableRow v-for="attachment in attachments" :key="attachment.id" :data-entity-id="attachment.id">
                  <TableCell class="font-mono">{{ attachment.id }}</TableCell><TableCell :title="attachment.name">{{ attachment.name || attachment.fileName || '—' }}</TableCell>
                  <TableCell :title="attachment.fileName">{{ attachment.fileName || '—' }}</TableCell><TableCell>{{ attachment.extension || '—' }}</TableCell>
                  <TableCell>{{ attachment.size || '—' }}</TableCell><TableCell>{{ attachment.changedAt || '—' }}</TableCell><TableCell :title="attachment.comment">{{ attachment.comment || '—' }}</TableCell>
                </TableRow></TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card v-if="task.stateComment">
        <CardHeader class="pb-2"><CardTitle class="text-sm">Комментарий к состоянию<span v-if="task.stateCommentAuthor" class="font-normal text-muted-foreground"> · {{ task.stateCommentAuthor }}</span></CardTitle></CardHeader>
        <CardContent class="whitespace-pre-wrap text-sm leading-5">{{ task.stateComment }}</CardContent>
      </Card>
    </div>
  </main>
</template>

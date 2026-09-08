<script setup lang="ts">
import { ArrowUpRight01Icon, Copy01Icon, Download01Icon, FolderOpenIcon, ViewIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, reactive, ref } from 'vue';
import type { ProductionTaskDetailsHostMessage } from '../../../src/core/webviewProtocol';
import type { DatabaseObjectSearchResult } from '../../../src/core/objectSearch';
import type { ProductionTaskAttachment, ProductionTaskHistoryEntry, ProductionTaskSummary } from '../../../src/features/production-tasks/models';
import { productionDeadlineInfo } from '../../../src/features/production-tasks/productionTaskPresentation';
import { splitWorkDescriptionObjectIds } from '../../../src/features/production-tasks/workDescriptionLinks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
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
const attachmentSearch = ref('');
const history = ref<ProductionTaskHistoryEntry[]>([]);
const historyLoading = ref(false);
const historyLoaded = ref(false);
const historyError = ref('');
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
const filteredAttachments = computed(() => {
  const query = attachmentSearch.value.trim().toLocaleLowerCase('ru-RU');
  return query ? attachments.value.filter(item => [item.name, item.fileName, item.extension, item.comment].join(' ').toLocaleLowerCase('ru-RU').includes(query)) : attachments.value;
});
const textExtensions = new Set(['.txt', '.pas', '.pkf', '.dfm', '.sql', '.json', '.xml', '.csv', '.log', '.md', '.ini', '.yaml', '.yml', '.bat', '.cmd', '.ps1', '.js', '.ts', '.vue']);
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
  if (detailsTab.value === 'history') loadHistory();
}
function loadHistory(force = false): void {
  if (historyLoading.value || historyLoaded.value && !force) return;
  historyLoading.value = true; historyError.value = '';
  vscode.postMessage({ command: 'loadProductionTaskHistory' });
}
function copyText(text: string): void { vscode.postMessage({ command: 'copyTableCells', text }); }
function openExternalUrl(url: string): void { vscode.postMessage({ command: 'openExternalUrl', url }); }
function openTaskReference(id: number): void { vscode.postMessage({ command: 'openProductionTaskReference', id }); }
function attachmentAction(attachment: ProductionTaskAttachment, action: 'open' | 'preview' | 'save' | 'reveal'): void { vscode.postMessage({ command: 'productionTaskAttachmentAction', id: attachment.id, action }); }
function openAttachment(attachment: ProductionTaskAttachment): void { attachmentAction(attachment, isTextAttachment(attachment) ? 'preview' : 'open'); }
function isTextAttachment(attachment: ProductionTaskAttachment): boolean {
  const rawExtension = attachment.extension || attachment.fileName.match(/\.[^.]+$/)?.[0] || '';
  const extension = rawExtension.startsWith('.') ? rawExtension : `.${rawExtension}`;
  return textExtensions.has(extension.toLocaleLowerCase('ru-RU'));
}
function isCopyField(key: keyof ProductionTaskSummary): boolean { return ['appeal', 'packageName', 'releasePlan', 'releaseActual', 'revisionTrunk', 'revisionBranch'].includes(key); }
function openDatabaseObject(id: number, target?: 'explorer' | 'object'): void {
  activePreviewIndex.value = undefined;
  vscode.postMessage({ command: 'openDatabaseObjectById', id, target });
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
  if (message.command === 'productionTaskHistoryLoading') { historyLoading.value = true; historyError.value = ''; return; }
  if (message.command === 'productionTaskHistoryLoaded') { history.value = message.history; historyLoading.value = false; historyLoaded.value = true; historyError.value = ''; return; }
  if (message.command === 'productionTaskHistoryFailed') { historyLoading.value = false; historyLoaded.value = false; historyError.value = message.message; return; }
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
        <Badge v-if="task.priority" variant="outline">{{ task.priority }}</Badge>
        <Badge v-if="task.deadline" :variant="productionDeadlineInfo(task.deadline).tone === 'overdue' ? 'destructive' : 'outline'" :title="task.deadline">{{ productionDeadlineInfo(task.deadline).label }}</Badge>
        <Badge v-if="task.effort" variant="outline">{{ displayValue('effort') }} ч</Badge>
        <Badge v-if="task.releasePlan" variant="outline">Релиз {{ task.releasePlan }}</Badge>
        <Badge v-if="task.attachmentCount" variant="outline">Файлы {{ task.attachmentCount }}</Badge>
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
            <template v-for="field in workFields" :key="field[1]"><dt class="text-muted-foreground">{{ field[0] }}</dt><dd class="break-words"><Button v-if="isCopyField(field[1]) && displayValue(field[1]) !== '—'" variant="link" class="h-auto p-0 text-xs" title="Копировать" @click="copyText(displayValue(field[1]))">{{ displayValue(field[1]) }}</Button><template v-else>{{ displayValue(field[1]) }}</template></dd></template>
          </dl>
          <dl class="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
            <template v-for="field in typeFields" :key="field[1]"><dt class="text-muted-foreground">{{ field[0] }}</dt><dd class="break-words"><Button v-if="isCopyField(field[1]) && displayValue(field[1]) !== '—'" variant="link" class="h-auto p-0 text-xs" title="Копировать" @click="copyText(displayValue(field[1]))">{{ displayValue(field[1]) }}</Button><template v-else>{{ displayValue(field[1]) }}</template></dd></template>
          </dl>
        </CardContent>
      </Card>

      <Tabs :model-value="detailsTab" class="flex flex-col gap-2" @update:model-value="selectDetailsTab">
        <TabsList>
          <TabsTrigger value="description">Описание</TabsTrigger>
          <TabsTrigger value="attachments">Вложения<template v-if="attachmentsLoaded"> ({{ attachments.length }})</template><template v-else-if="task.attachmentCount"> ({{ task.attachmentCount }})</template></TabsTrigger>
          <TabsTrigger value="history">История<template v-if="historyLoaded"> ({{ history.length }})</template></TabsTrigger>
        </TabsList>
        <TabsContent value="description">
          <Card>
            <CardHeader class="pb-2"><CardTitle class="text-sm">Описание работы</CardTitle></CardHeader>
        <CardContent class="whitespace-pre-wrap text-sm leading-5">
          <template v-for="(part, index) in workDescriptionParts" :key="index">
            <Button v-if="part.href" variant="link" class="inline h-auto cursor-pointer p-0 align-baseline text-sm leading-5" :title="part.href" @click="openExternalUrl(part.href)">{{ part.text }}</Button>
            <Button v-else-if="part.id && part.kind === 'task'" variant="link" class="inline h-auto cursor-pointer p-0 align-baseline text-sm leading-5" :title="`Открыть задачу ID=${part.id}`" @click="openTaskReference(part.id)">{{ part.text }}</Button>
            <Popover v-else-if="part.id" :open="activePreviewIndex === index">
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
                  <div class="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" @click="openDatabaseObject(part.id, 'explorer')">Открыть в проводнике</Button>
                    <Button size="sm" @click="openDatabaseObject(part.id, 'object')">Открыть</Button>
                  </div>
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
            <CardHeader class="pb-2"><div class="flex items-center gap-3"><CardTitle class="text-sm">Вложения</CardTitle><Input v-if="attachmentsLoaded && attachments.length" v-model="attachmentSearch" type="search" class="ml-auto h-7 max-w-xs" placeholder="Поиск по вложениям" aria-label="Поиск по вложениям" /><Button v-if="attachmentsLoaded" size="xs" variant="outline" @click="loadAttachments(true)">Обновить</Button></div></CardHeader>
            <CardContent>
              <div v-if="attachmentsLoading" class="flex flex-col gap-2"><Skeleton v-for="index in 5" :key="index" class="h-8 w-full" /></div>
              <Empty v-else-if="attachmentsError" class="py-8">
                <EmptyHeader><EmptyTitle>Не удалось загрузить вложения</EmptyTitle><EmptyDescription class="break-words">{{ attachmentsError }}</EmptyDescription></EmptyHeader>
                <EmptyContent><Button size="sm" variant="outline" @click="loadAttachments(true)">Повторить</Button></EmptyContent>
              </Empty>
              <Empty v-else-if="attachmentsLoaded && !attachments.length" class="py-8">
                <EmptyHeader><EmptyTitle>Вложений не найдено</EmptyTitle><EmptyDescription>Запрос проверил прямые файлы, RootObj и дочерние записи MainStoredFile для задачи {{ task.id }}.</EmptyDescription></EmptyHeader>
              </Empty>
              <Table v-else container-class="max-h-[32rem] overflow-auto">
                <TableHeader class="sticky top-0 bg-background"><TableRow>
                  <TableHead class="w-28">ID</TableHead><TableHead class="min-w-64">Наименование</TableHead><TableHead class="min-w-64">Имя файла</TableHead>
                  <TableHead class="w-28">Расширение</TableHead><TableHead class="w-28">Размер</TableHead><TableHead class="w-40">Изменён</TableHead><TableHead class="min-w-72">Комментарий</TableHead><TableHead class="w-64">Действия</TableHead>
                </TableRow></TableHeader>
                <TableBody><TableRow v-for="attachment in filteredAttachments" :key="attachment.id" :data-entity-id="attachment.id" tabindex="0" @dblclick="openAttachment(attachment)" @keydown.enter.prevent="openAttachment(attachment)">
                  <TableCell class="font-mono">{{ attachment.id }}</TableCell><TableCell :title="attachment.name">{{ attachment.name || attachment.fileName || '—' }}</TableCell>
                  <TableCell :title="attachment.fileName">{{ attachment.fileName || '—' }}</TableCell><TableCell>{{ attachment.extension || '—' }}</TableCell>
                  <TableCell>{{ attachment.size || '—' }}</TableCell><TableCell>{{ attachment.changedAt || '—' }}</TableCell><TableCell :title="attachment.comment"><Badge v-if="attachment.important" variant="destructive">Важно</Badge> {{ attachment.comment || '—' }}</TableCell>
                  <TableCell><div class="flex gap-1"><Button size="xs" @click="openAttachment(attachment)"><HugeiconsIcon :icon="ViewIcon" data-icon="inline-start" />{{ isTextAttachment(attachment) ? 'В редакторе' : 'Открыть' }}</Button><Button size="icon-xs" variant="outline" title="Показать в проводнике" @click="attachmentAction(attachment, 'reveal')"><HugeiconsIcon :icon="FolderOpenIcon" /></Button><Button size="icon-xs" variant="outline" title="Сохранить как…" @click="attachmentAction(attachment, 'save')"><HugeiconsIcon :icon="Download01Icon" /></Button><Button size="icon-xs" variant="ghost" title="Копировать ID" @click="copyText(String(attachment.id))"><HugeiconsIcon :icon="Copy01Icon" /></Button></div></TableCell>
                </TableRow></TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card><CardHeader class="pb-2"><div class="flex items-center gap-3"><CardTitle class="text-sm">История состояний</CardTitle><Button v-if="historyLoaded" class="ml-auto" size="xs" variant="outline" @click="loadHistory(true)">Обновить</Button></div></CardHeader><CardContent>
            <div v-if="historyLoading" class="flex flex-col gap-2"><Skeleton v-for="index in 6" :key="index" class="h-12 w-full" /></div>
            <Empty v-else-if="historyError" class="py-8"><EmptyHeader><EmptyTitle>Не удалось загрузить историю</EmptyTitle><EmptyDescription class="break-words">{{ historyError }}</EmptyDescription></EmptyHeader><EmptyContent><Button size="sm" variant="outline" @click="loadHistory(true)">Повторить</Button></EmptyContent></Empty>
            <Empty v-else-if="historyLoaded && !history.length" class="py-8"><EmptyHeader><EmptyTitle>История пуста</EmptyTitle><EmptyDescription>Для задачи нет доступных записей HistoryLC.</EmptyDescription></EmptyHeader></Empty>
            <Table v-else><TableHeader><TableRow><TableHead class="w-44">Дата</TableHead><TableHead class="w-48">Действие</TableHead><TableHead class="w-48">Состояние</TableHead><TableHead class="w-56">Автор</TableHead><TableHead>Комментарий</TableHead></TableRow></TableHeader><TableBody><TableRow v-for="entry in history" :key="entry.id"><TableCell>{{ entry.createdAt || '—' }}</TableCell><TableCell>{{ entry.action || '—' }}</TableCell><TableCell><Badge variant="secondary">{{ entry.state || '—' }}</Badge></TableCell><TableCell>{{ entry.person || '—' }}</TableCell><TableCell class="whitespace-pre-wrap">{{ entry.comment || '—' }}</TableCell></TableRow></TableBody></Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Card v-if="task.stateComment">
        <CardHeader class="pb-2"><CardTitle class="text-sm">Комментарий к состоянию<span v-if="task.stateCommentAuthor" class="font-normal text-muted-foreground"> · {{ task.stateCommentAuthor }}</span></CardTitle></CardHeader>
        <CardContent class="whitespace-pre-wrap text-sm leading-5">{{ task.stateComment }}</CardContent>
      </Card>
    </div>
  </main>
</template>

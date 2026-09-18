<script setup lang="ts">
import { ArrowDown01Icon, ArrowUpRight01Icon, Calendar03Icon, Copy01Icon, Download01Icon, Folder01Icon, FolderOpenIcon, Task01Icon, UserGroupIcon, ViewIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, reactive, ref } from 'vue';
import type { ProductionTaskDetailsHostMessage } from '../../../src/core/webviewProtocol';
import type { DatabaseObjectSearchResult } from '../../../src/core/objectSearch';
import type { ProductionTaskAction, ProductionTaskAttachment, ProductionTaskDescriptionPart, ProductionTaskHistoryEntry, ProductionTaskSummary } from '../../../src/features/production-tasks/models';
import { productionDeadlineInfo, productionTaskMarkdown } from '../../../src/features/production-tasks/productionTaskPresentation';
import { splitWorkDescriptionObjectIds, type WorkDescriptionPart } from '../../../src/features/production-tasks/workDescriptionLinks';
import ProductionTaskBadge from '@/components/ProductionTaskBadge.vue';
import IdReferencePopover from '@/components/IdReferencePopover.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogScrollContent, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { vscode } from '@/vscode';

const task = ref<ProductionTaskSummary>();
const detailsTab = ref('description');
const actions = ref<ProductionTaskAction[]>([]);
const actionsLoading = ref(false);
const actionsLoaded = ref(false);
const actionsError = ref('');
const attachments = ref<ProductionTaskAttachment[]>([]);
const attachmentsLoading = ref(false);
const attachmentsLoaded = ref(false);
const attachmentsError = ref('');
const attachmentSearch = ref('');
const history = ref<ProductionTaskHistoryEntry[]>([]);
const historyLoading = ref(false);
const historyLoaded = ref(false);
const historyError = ref('');
const selectedHistoryEntry = ref<ProductionTaskHistoryEntry>();
const richDescriptionParts = ref<ProductionTaskDescriptionPart[]>([]);
const richDescriptionError = ref('');
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
type WorkDescriptionRenderPart =
  | ({ renderKind: 'text' } & WorkDescriptionPart)
  | ({ renderKind: 'image' } & Omit<Extract<ProductionTaskDescriptionPart, { kind: 'image' }>, 'kind'>);
const workDescriptionParts = computed<WorkDescriptionRenderPart[]>(() => {
  const rich = richDescriptionParts.value;
  if (!rich.some(part => part.kind === 'image')) {
    return splitWorkDescriptionObjectIds(task.value?.workDescription || 'Описание работы не заполнено.').map(part => ({ renderKind: 'text', ...part }));
  }
  const result: WorkDescriptionRenderPart[] = [];
  for (const part of rich) {
    if (part.kind === 'image') {
      result.push({ renderKind: 'image', dataUrl: part.dataUrl, width: part.width, height: part.height });
    } else {
      result.push(...splitWorkDescriptionObjectIds(part.text).map(textPart => ({ renderKind: 'text' as const, ...textPart })));
    }
  }
  return result;
});
const detailGroups = [
  { title: 'Команда', description: 'Участники задачи', icon: UserGroupIcon, fields: peopleFields },
  { title: 'Работа', description: 'Контекст и связанные объекты', icon: Task01Icon, fields: workFields },
  { title: 'Поставка', description: 'Релизы и параметры разработки', icon: Folder01Icon, fields: typeFields },
] as const;
const filteredAttachments = computed(() => {
  const query = attachmentSearch.value.trim().toLocaleLowerCase('ru-RU');
  return query ? attachments.value.filter(item => [item.name, item.fileName, item.extension, item.comment].join(' ').toLocaleLowerCase('ru-RU').includes(query)) : attachments.value;
});
const textExtensions = new Set(['.txt', '.pas', '.pkf', '.dfm', '.sql', '.json', '.xml', '.csv', '.log', '.md', '.ini', '.yaml', '.yml', '.bat', '.cmd', '.ps1', '.js', '.ts', '.vue']);
type PreviewState = { status: 'loading' } | { status: 'loaded'; object?: DatabaseObjectSearchResult } | { status: 'failed'; message: string };
type TaskPreviewState = { status: 'loading' } | { status: 'loaded'; task?: ProductionTaskSummary } | { status: 'failed'; message: string };
const objectPreviews = reactive(new Map<number, PreviewState>());
const taskPreviews = reactive(new Map<number, TaskPreviewState>());
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
function taskReference(value: ProductionTaskSummary): number { return Number(value.number) || value.id; }
function openInClient(): void { if (task.value) vscode.postMessage({ command: 'openProductionTaskInClient', id: taskReference(task.value) }); }
function copyTaskTitle(): void { if (task.value) copyText(productionTaskMarkdown(task.value.number, task.value.title, task.value.id)); }
function loadActions(force = false): void {
  if (actionsLoading.value || actionsLoaded.value && !force) return;
  actionsLoading.value = true;
  actionsError.value = '';
  vscode.postMessage({ command: 'loadProductionTaskActions' });
}
function onActionsMenuOpen(open: boolean): void { if (open) loadActions(); }
function actionCaption(action: ProductionTaskAction): string { return action.verb || action.name || `Действие ${action.id}`; }
function actionDetails(action: ProductionTaskAction): string {
  return [action.group, action.targetState && `→ ${action.targetState}`].filter(Boolean).join(' · ');
}
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
function openHistoryEntry(entry: ProductionTaskHistoryEntry): void { selectedHistoryEntry.value = entry; }
function setHistoryDialogOpen(open: boolean): void { if (!open) selectedHistoryEntry.value = undefined; }
function copyText(text: string): void { vscode.postMessage({ command: 'copyTableCells', text }); }
function openExternalUrl(url: string): void { vscode.postMessage({ command: 'openExternalUrl', url }); }
function openTaskReference(id: number): void { activePreviewIndex.value = undefined; vscode.postMessage({ command: 'openProductionTaskReference', id }); }
function openTaskReferenceInClient(id: number): void { activePreviewIndex.value = undefined; vscode.postMessage({ command: 'openProductionTaskInClient', id }); }
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
function showTaskPreview(id: number, index: number): void {
  if (closePreviewTimer) clearTimeout(closePreviewTimer);
  activePreviewIndex.value = index;
  if (taskPreviews.has(id)) return;
  taskPreviews.set(id, { status: 'loading' });
  vscode.postMessage({ command: 'loadProductionTaskPreview', id });
}
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
function taskPreview(id: number): ProductionTaskSummary | undefined { const preview = taskPreviews.get(id); return preview?.status === 'loaded' ? preview.task : undefined; }
function taskPreviewStatus(id: number): TaskPreviewState['status'] | undefined { return taskPreviews.get(id)?.status; }
function taskPreviewError(id: number): string { const preview = taskPreviews.get(id); return preview?.status === 'failed' ? preview.message : ''; }
function objectKindLabel(kind: DatabaseObjectSearchResult['kind']): string {
  return { class: 'Класс', method: 'Метод', module: 'Модуль', attribute: 'Атрибут', lifecycle: 'Жизненный цикл', journal: 'Журнал', list: 'Список', object: 'Объект' }[kind];
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
  if (message.command === 'productionTaskRichDescriptionLoading') { richDescriptionError.value = ''; return; }
  if (message.command === 'productionTaskRichDescriptionLoaded') { richDescriptionParts.value = message.parts; richDescriptionError.value = ''; return; }
  if (message.command === 'productionTaskRichDescriptionFailed') { richDescriptionError.value = message.message; return; }
  if (message.command === 'productionTaskActionsLoading') { actionsLoading.value = true; actionsError.value = ''; return; }
  if (message.command === 'productionTaskActionsLoaded') {
    actions.value = message.actions;
    actionsLoading.value = false;
    actionsLoaded.value = true;
    actionsError.value = '';
    return;
  }
  if (message.command === 'productionTaskActionsFailed') {
    actionsLoading.value = false;
    actionsLoaded.value = false;
    actionsError.value = message.message;
    return;
  }
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
  if (message.command === 'databaseObjectPreviewFailed') { objectPreviews.set(message.id, { status: 'failed', message: message.message }); return; }
  if (message.command === 'productionTaskPreviewLoaded') { taskPreviews.set(message.id, { status: 'loaded', task: message.task }); return; }
  taskPreviews.set(message.id, { status: 'failed', message: message.message });
});
vscode.postMessage({ command: 'productionTaskDetailsReady' });
</script>

<template>
  <main class="min-h-screen bg-background p-4 text-foreground lg:p-6">
    <div v-if="!task" class="flex flex-col gap-2"><Skeleton class="h-9 w-72" /><Skeleton class="h-44 w-full" /></div>
    <div v-else class="mx-auto flex max-w-7xl flex-col gap-5">
      <header class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><p>Восточный Экспресс / Задачи / <span class="text-foreground">{{ task.number || task.id }}</span></p><Badge variant="outline">Только просмотр</Badge></header>
      <Card>
        <CardHeader class="gap-4">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <CardDescription>Задача № {{ task.number || task.id }}<span class="mx-2" aria-hidden="true">·</span><span class="font-mono">ID {{ task.id }}</span></CardDescription>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <Button size="icon-sm" variant="outline" aria-label="Скопировать название и ссылку" title="Скопировать название и ссылку" @click="copyTaskTitle"><HugeiconsIcon :icon="Copy01Icon" /></Button>
              <DropdownMenu @update:open="onActionsMenuOpen">
                <DropdownMenuTrigger as-child>
                  <Button size="sm" variant="outline">Действия<HugeiconsIcon :icon="ArrowDown01Icon" data-icon="inline-end" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent class="w-80" align="end">
                  <DropdownMenuGroup><DropdownMenuLabel>Действия по текущему состоянию</DropdownMenuLabel></DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem v-if="actionsLoading" disabled>Загрузка…</DropdownMenuItem>
                    <DropdownMenuItem v-else-if="actionsError" @select="loadActions(true)">
                      <div class="flex min-w-0 flex-col gap-0.5"><span>Повторить загрузку</span><span class="truncate text-muted-foreground" :title="actionsError">{{ actionsError }}</span></div>
                    </DropdownMenuItem>
                    <DropdownMenuItem v-else-if="actionsLoaded && !actions.length" disabled>Для текущего состояния действий не найдено</DropdownMenuItem>
                    <DropdownMenuItem v-for="action in actions" v-else :key="action.id" disabled>
                      <div class="flex min-w-0 flex-col gap-0.5">
                        <span class="truncate" :title="action.name">{{ actionCaption(action) }}</span>
                        <span v-if="actionDetails(action)" class="truncate text-muted-foreground" :title="actionDetails(action)">{{ actionDetails(action) }}</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator v-if="actions.length" />
                  <DropdownMenuGroup v-if="actions.length"><DropdownMenuLabel class="font-normal text-muted-foreground">Выполнение действий пока отключено</DropdownMenuLabel></DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" @click="openInClient"><HugeiconsIcon :icon="ArrowUpRight01Icon" data-icon="inline-start" />Открыть в клиенте</Button>
            </div>
          </div>
          <h1><Button variant="link" class="h-auto max-w-full justify-start whitespace-normal p-0 text-left" title="Скопировать название и ссылку" @click="copyTaskTitle"><span class="text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl">{{ task.title || 'Без наименования' }}</span></Button></h1>
          <div class="flex flex-wrap gap-1.5">
            <ProductionTaskBadge kind="status" :value="task.state" />
            <ProductionTaskBadge kind="priority" :value="task.priority" />
            <Badge v-if="task.effort" variant="outline">{{ displayValue('effort') }} ч</Badge>
            <Badge v-if="task.releasePlan" variant="outline">Релиз {{ task.releasePlan }}</Badge>
            <Badge v-if="task.attachmentCount" variant="outline">Файлы {{ task.attachmentCount }}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field class="bg-muted/50 p-3"><FieldDescription><span class="flex items-center gap-2"><HugeiconsIcon :icon="Folder01Icon" class="size-4" />Проект</span></FieldDescription><FieldTitle class="break-words">{{ task.project || '—' }}</FieldTitle></Field>
            <Field class="bg-muted/50 p-3"><FieldDescription><span class="flex items-center gap-2"><HugeiconsIcon :icon="UserGroupIcon" class="size-4" />Ответственный</span></FieldDescription><FieldTitle class="break-words">{{ task.responsibleUser || '—' }}</FieldTitle></Field>
            <Field class="bg-muted/50 p-3"><FieldDescription><span class="flex items-center gap-2"><HugeiconsIcon :icon="Calendar03Icon" class="size-4" />Крайний срок</span></FieldDescription><FieldTitle>{{ task.deadline || '—' }}</FieldTitle><div v-if="task.deadline"><Badge :variant="productionDeadlineInfo(task.deadline).tone === 'overdue' ? 'destructive' : 'outline'">{{ productionDeadlineInfo(task.deadline).label }}</Badge></div></Field>
            <Field class="bg-muted/50 p-3"><FieldDescription><span class="flex items-center gap-2"><HugeiconsIcon :icon="Task01Icon" class="size-4" />Создана</span></FieldDescription><FieldTitle>{{ task.createdAt || '—' }}</FieldTitle></Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label="Содержание задачи" class="flex min-w-0 flex-col gap-4">
      <Tabs :model-value="detailsTab" class="flex min-w-0 flex-col gap-3" @update:model-value="selectDetailsTab">
        <TabsList>
          <TabsTrigger value="description">Описание</TabsTrigger>
          <TabsTrigger value="attachments">Вложения<template v-if="attachmentsLoaded"> ({{ attachments.length }})</template><template v-else-if="task.attachmentCount"> ({{ task.attachmentCount }})</template></TabsTrigger>
          <TabsTrigger value="history">История<template v-if="historyLoaded"> ({{ history.length }})</template></TabsTrigger>
        </TabsList>
        <TabsContent value="description">
          <Card class="min-h-72">
            <CardHeader class="border-b"><CardTitle>Описание работы</CardTitle><CardDescription>Постановка задачи и связанные материалы</CardDescription></CardHeader>
        <CardContent class="break-words whitespace-pre-wrap text-sm leading-relaxed">
          <template v-for="(part, index) in workDescriptionParts" :key="index">
            <img v-if="part.renderKind === 'image'" :src="part.dataUrl" :width="part.width" :height="part.height" alt="Изображение из описания задачи" class="my-3 block h-auto max-w-full rounded-md border object-contain" />
            <Button v-else-if="part.href" variant="link" class="inline h-auto cursor-pointer p-0 align-baseline text-sm leading-5" :title="part.href" @click="openExternalUrl(part.href)">{{ part.text }}</Button>
            <IdReferencePopover v-else-if="part.id && part.kind === 'task'" :id="part.id" :label="part.text" :open="activePreviewIndex === index" :title="`Задача ${part.id}`" content-class="w-96" @show="showTaskPreview(part.id, index)" @hide="closeObjectPreviewSoon" @copy="copyText(String($event))">
                <div v-if="taskPreviewStatus(part.id) === 'loading'" class="flex flex-col gap-2"><Skeleton class="h-5 w-2/3" /><Skeleton class="h-4 w-full" /><Skeleton class="h-4 w-4/5" /></div>
                <div v-else-if="taskPreviewStatus(part.id) === 'failed'" class="flex flex-col gap-1"><p class="font-medium">Не удалось загрузить задачу</p><p class="break-words text-muted-foreground">{{ taskPreviewError(part.id) }}</p></div>
                <div v-else-if="taskPreview(part.id)" class="flex flex-col gap-3">
                  <div class="flex items-start gap-2"><div class="min-w-0 flex-1"><p class="font-mono text-xs text-muted-foreground">Задача {{ taskPreview(part.id)?.number || part.id }}</p><p class="mt-1 break-words font-semibold">{{ taskPreview(part.id)?.title || 'Без наименования' }}</p></div><ProductionTaskBadge kind="status" :value="taskPreview(part.id)?.state" /></div>
                  <dl class="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                    <dt class="text-muted-foreground">Проект</dt><dd class="break-words">{{ taskPreview(part.id)?.project || '—' }}</dd>
                    <dt class="text-muted-foreground">Исполнитель</dt><dd class="break-words">{{ taskPreview(part.id)?.executor || '—' }}</dd>
                    <dt class="text-muted-foreground">Срок</dt><dd>{{ taskPreview(part.id)?.deadline || '—' }}</dd>
                  </dl>
                  <div class="flex flex-wrap gap-2"><Button size="sm" variant="outline" @click="openTaskReference(part.id)"><HugeiconsIcon :icon="ViewIcon" data-icon="inline-start" />Открыть задачу</Button><Button size="sm" @click="openTaskReferenceInClient(part.id)"><HugeiconsIcon :icon="ArrowUpRight01Icon" data-icon="inline-start" />Открыть в клиенте</Button></div>
                </div>
                <div v-else class="flex flex-col gap-1"><p class="font-medium">Задача не найдена</p><p class="text-muted-foreground">Номер или ID {{ part.id }} не найден в production.</p></div>
            </IdReferencePopover>
            <IdReferencePopover v-else-if="part.id" :id="part.id" :label="part.text" :open="activePreviewIndex === index" :title="`Открыть объект ID=${part.id}`" activate-on-click @show="showObjectPreview(part.id, index)" @hide="closeObjectPreviewSoon" @activate="openDatabaseObject(part.id)" @copy="copyText(String($event))">
                <div v-if="previewStatus(part.id) === 'loading'" class="flex flex-col gap-2">
                  <Skeleton class="h-5 w-2/3" /><Skeleton class="h-4 w-full" /><Skeleton class="h-4 w-4/5" />
                </div>
                <div v-else-if="previewStatus(part.id) === 'failed'" class="flex flex-col gap-1">
                  <p class="font-medium">Не удалось загрузить объект</p><p class="break-words text-muted-foreground">{{ previewError(part.id) }}</p>
                </div>
                <div v-else-if="previewObject(part.id)" class="flex flex-col gap-3">
                  <div class="flex items-start gap-2">
                    <div class="min-w-0 flex-1"><p class="break-words font-semibold">{{ previewObject(part.id)?.name || `Объект ${part.id}` }}</p></div>
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
            </IdReferencePopover>
            <span v-else>{{ part.text }}</span>
          </template>
          <p v-if="richDescriptionError" class="mt-3 text-xs text-destructive">Не удалось загрузить встроенные изображения: {{ richDescriptionError }}</p>
        </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="attachments">
          <Card>
            <CardHeader class="pb-2"><div class="flex items-center gap-3"><CardTitle class="text-sm">Вложения</CardTitle><Field v-if="attachmentsLoaded && attachments.length" class="ml-auto max-w-xs"><FieldLabel for="attachment-search" class="sr-only">Поиск по вложениям</FieldLabel><Input id="attachment-search" v-model="attachmentSearch" type="search" placeholder="Поиск по вложениям" /></Field><Button v-if="attachmentsLoaded" size="xs" variant="outline" @click="loadAttachments(true)">Обновить</Button></div></CardHeader>
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
            <Table v-else container-class="max-h-[32rem] overflow-auto" class="min-w-[900px] whitespace-nowrap"><TableHeader class="sticky top-0 z-10 bg-background"><TableRow><TableHead class="w-44">Дата</TableHead><TableHead class="w-48">Действие</TableHead><TableHead class="w-48">Состояние</TableHead><TableHead class="w-56">Автор</TableHead><TableHead class="min-w-72">Комментарий</TableHead></TableRow></TableHeader><TableBody><TableRow v-for="entry in history" :key="entry.id" tabindex="0" class="h-8 cursor-default" title="Двойной щелчок — открыть запись истории" @dblclick="openHistoryEntry(entry)" @keydown.enter.prevent="openHistoryEntry(entry)"><TableCell class="whitespace-nowrap">{{ entry.createdAt || '—' }}</TableCell><TableCell class="max-w-48 truncate whitespace-nowrap" :title="entry.action">{{ entry.action || '—' }}</TableCell><TableCell class="whitespace-nowrap"><ProductionTaskBadge kind="status" :value="entry.state" /></TableCell><TableCell class="max-w-56 truncate whitespace-nowrap" :title="entry.person">{{ entry.person || '—' }}</TableCell><TableCell class="max-w-96 truncate whitespace-nowrap" :title="entry.comment">{{ entry.comment || '—' }}</TableCell></TableRow></TableBody></Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Card v-if="task.stateComment">
        <CardHeader><CardTitle>Комментарий к состоянию</CardTitle><CardDescription v-if="task.stateCommentAuthor">{{ task.stateCommentAuthor }}</CardDescription></CardHeader>
        <CardContent class="whitespace-pre-wrap text-sm leading-5">{{ task.stateComment }}</CardContent>
      </Card>
      </section>
      <aside aria-label="Детали задачи" class="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <Card v-for="group in detailGroups" :key="group.title" size="sm">
          <CardHeader><CardTitle><span class="flex items-center gap-2"><HugeiconsIcon :icon="group.icon" class="size-4 text-muted-foreground" />{{ group.title }}</span></CardTitle><CardDescription>{{ group.description }}</CardDescription></CardHeader>
          <CardContent>
            <FieldGroup class="gap-3">
              <Field v-for="field in group.fields" :key="field[1]" orientation="horizontal" class="grid grid-cols-[7rem_minmax(0,1fr)] items-start">
                <FieldDescription>{{ field[0] }}</FieldDescription>
                <FieldContent class="min-w-0">
                  <ProductionTaskBadge v-if="field[1] === 'priority'" kind="priority" :value="task.priority" />
                  <Button v-else-if="isCopyField(field[1]) && displayValue(field[1]) !== '—'" variant="link" class="h-auto justify-start whitespace-normal p-0 text-left" :aria-label="`Копировать: ${field[0]}`" @click="copyText(displayValue(field[1]))">{{ displayValue(field[1]) }}</Button>
                  <p v-else class="break-words">{{ displayValue(field[1]) }}</p>
                </FieldContent>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </aside>
      </div>
    </div>

    <Dialog :open="selectedHistoryEntry !== undefined" @update:open="setHistoryDialogOpen">
      <DialogScrollContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Запись истории задачи</DialogTitle>
          <DialogDescription>Полные данные изменения<template v-if="selectedHistoryEntry"> · ID {{ selectedHistoryEntry.id }}</template></DialogDescription>
        </DialogHeader>
        <template v-if="selectedHistoryEntry">
          <FieldGroup class="grid gap-3 sm:grid-cols-2">
            <Field class="bg-muted/50 p-3"><FieldDescription>Дата</FieldDescription><FieldTitle>{{ selectedHistoryEntry.createdAt || '—' }}</FieldTitle></Field>
            <Field class="bg-muted/50 p-3"><FieldDescription>Автор</FieldDescription><FieldTitle class="break-words">{{ selectedHistoryEntry.person || '—' }}</FieldTitle></Field>
            <Field class="bg-muted/50 p-3"><FieldDescription>Действие</FieldDescription><FieldTitle class="break-words">{{ selectedHistoryEntry.action || '—' }}</FieldTitle></Field>
            <Field class="bg-muted/50 p-3"><FieldDescription>Состояние</FieldDescription><FieldContent><ProductionTaskBadge kind="status" :value="selectedHistoryEntry.state" /></FieldContent></Field>
          </FieldGroup>
          <Card size="sm">
            <CardHeader><CardTitle>Комментарий</CardTitle><CardDescription>Полный текст комментария к изменению состояния</CardDescription></CardHeader>
            <CardContent class="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{{ selectedHistoryEntry.comment || 'Комментарий не указан.' }}</CardContent>
          </Card>
        </template>
        <DialogFooter><DialogClose as-child><Button variant="outline">Закрыть</Button></DialogClose></DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </main>
</template>

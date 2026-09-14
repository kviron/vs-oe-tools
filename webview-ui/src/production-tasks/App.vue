<script setup lang="ts">
import { Calendar03Icon, Clock01Icon, ColumnsThreeCogIcon, Copy01Icon, ExternalLinkIcon, FileImportIcon, Folder01Icon, RefreshIcon, Search01Icon, Task01Icon, ViewIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref, watch } from 'vue';
import type { ProductionTasksHostMessage } from '../../../src/core/webviewProtocol';
import type { ProductionTaskListItem } from '../../../src/features/production-tasks/models';
import { productionDeadlineInfo, productionTaskMarkdown, productionTaskPublicUrl } from '../../../src/features/production-tasks/productionTaskPresentation';
import ProductionTaskBadge from '@/components/ProductionTaskBadge.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import TaskFilter from './TaskFilter.vue';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { vscode } from '@/vscode';

type ColumnKey = 'id' | 'number' | 'title' | 'state' | 'createdAt' | 'deadline' | 'priority' | 'workType' | 'project' | 'releasePlan' | 'responsibleUser' | 'executor' | 'attachmentCount';
type SortDirection = 'asc' | 'desc';
interface Column { key: ColumnKey; label: string; width: string }
interface SavedState { search?: string; user?: string; status?: string; project?: string; priority?: string; workType?: string; release?: string; overdue?: boolean; compact?: boolean; sortKey?: ColumnKey; sortDirection?: SortDirection; visible?: ColumnKey[]; order?: ColumnKey[]; selected?: number }

const columns: readonly Column[] = [
  { key: 'id', label: 'ID', width: 'w-32' }, { key: 'number', label: '№ задачи', width: 'w-28' },
  { key: 'title', label: 'Наименование', width: 'min-w-80' }, { key: 'state', label: 'Статус', width: 'w-36' },
  { key: 'createdAt', label: 'Создана', width: 'w-40' }, { key: 'deadline', label: 'Срок', width: 'w-44' },
  { key: 'priority', label: 'Приоритет', width: 'w-28' }, { key: 'workType', label: 'Вид работ', width: 'w-36' },
  { key: 'project', label: 'Проект', width: 'w-56' }, { key: 'releasePlan', label: 'Релиз', width: 'w-24' },
  { key: 'responsibleUser', label: 'Ответственный', width: 'w-52' }, { key: 'executor', label: 'Исполнитель', width: 'w-52' },
  { key: 'attachmentCount', label: 'Файлы', width: 'w-20' },
];
const defaultOrder = columns.map(column => column.key);
const saved = (vscode.getState() as SavedState | undefined) ?? {};
const collator = new Intl.Collator('ru-RU', { numeric: true, sensitivity: 'base' });
const tasks = ref<ProductionTaskListItem[]>([]);
const loading = ref(true);
const error = ref('');
const loadedAt = ref('');
const searchQuery = ref(saved.search ?? '');
const userFilter = ref('current');
const currentUserId = ref('');
let appliedUserFilter: string | undefined;
let requestedUserFilter: string | undefined;
const statusFilter = ref(saved.status ?? '');
const projectFilter = ref(saved.project ?? '');
const priorityFilter = ref(saved.priority ?? '');
const workTypeFilter = ref(saved.workType ?? '');
const releaseFilter = ref(saved.release ?? '');
const overdueOnly = ref(saved.overdue ?? false);
const compact = ref(saved.compact ?? true);
const selectedTaskId = ref(saved.selected);
const sortKey = ref<ColumnKey>(isColumnKey(saved.sortKey) ? saved.sortKey : 'number');
const sortDirection = ref<SortDirection>(saved.sortDirection === 'desc' ? 'desc' : 'asc');
const visibleColumns = ref<ColumnKey[]>((saved.visible ?? defaultOrder).filter(isColumnKey));
const columnOrder = ref<ColumnKey[]>(normalizeOrder(saved.order));

const activeColumns = computed(() => columnOrder.value.map(key => columns.find(column => column.key === key)!).filter(column => visibleColumns.value.includes(column.key)));
const statuses = computed(() => uniqueValues('state'));
const projects = computed(() => uniqueValues('project'));
const priorities = computed(() => uniqueValues('priority'));
const workTypes = computed(() => uniqueValues('workType'));
const releases = computed(() => uniqueValues('releasePlan'));
const users = ref<{ id: string; name: string }[]>([]);
const userOptions = computed(() => {
  const options = users.value.map(user => ({ value: user.id, label: user.name }));
  if (userFilter.value && !options.some(option => option.value === userFilter.value)) {
    options.unshift({ value: userFilter.value, label: userFilter.value === 'current' ? 'Текущий пользователь' : `Пользователь · ID ${userFilter.value}` });
  }
  return options;
});
const filteredTasks = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('ru-RU');
  return tasks.value.filter(task => (!query || [task.id, task.number, task.title, task.state, task.project, task.responsibleUser, task.executor, task.appeal, task.packageName, task.releasePlan].join(' ').toLocaleLowerCase('ru-RU').includes(query))
    && (!userFilter.value || String(task.responsibleUserId) === userFilter.value)
    && (!statusFilter.value || task.state === statusFilter.value) && (!projectFilter.value || task.project === projectFilter.value)
    && (!priorityFilter.value || task.priority === priorityFilter.value) && (!workTypeFilter.value || task.workType === workTypeFilter.value)
    && (!releaseFilter.value || task.releasePlan === releaseFilter.value) && (!overdueOnly.value || productionDeadlineInfo(task.deadline).tone === 'overdue'));
});
const sortedTasks = computed(() => filteredTasks.value.map((task, index) => ({ task, index })).sort((left, right) => {
  const comparison = collator.compare(sortValue(left.task, sortKey.value), sortValue(right.task, sortKey.value));
  return comparison ? comparison * (sortDirection.value === 'asc' ? 1 : -1) : left.index - right.index;
}).map(entry => entry.task));
const filtersActive = computed(() => Boolean(searchQuery.value.trim() || userFilter.value || statusFilter.value || projectFilter.value || priorityFilter.value || workTypeFilter.value || releaseFilter.value || overdueOnly.value));
const countLabel = computed(() => loading.value ? 'Загрузка…' : filtersActive.value ? `${filteredTasks.value.length} из ${tasks.value.length}` : `${tasks.value.length}`);
const selectedUserLabel = computed(() => userFilter.value ? userOptions.value.find(option => option.value === userFilter.value)?.label || 'Текущий пользователь' : 'Все пользователи');
const overview = computed(() => [
  { label: 'В выборке', value: filteredTasks.value.length, note: 'С учётом фильтров', icon: Task01Icon },
  { label: 'Срок сегодня', value: filteredTasks.value.filter(task => productionDeadlineInfo(task.deadline).tone === 'today').length, note: 'Крайний срок — сегодня', icon: Calendar03Icon },
  { label: 'Срок истёк', value: filteredTasks.value.filter(task => productionDeadlineInfo(task.deadline).tone === 'overdue').length, note: 'По указанной дате срока', icon: Clock01Icon },
  { label: 'Проекты', value: new Set(filteredTasks.value.map(task => task.project).filter(Boolean)).size, note: 'В текущей выборке', icon: Folder01Icon },
]);

watch([searchQuery, userFilter, statusFilter, projectFilter, priorityFilter, workTypeFilter, releaseFilter, overdueOnly, compact, sortKey, sortDirection, visibleColumns, columnOrder, selectedTaskId], () => vscode.setState({
  search: searchQuery.value, user: userFilter.value, status: statusFilter.value, project: projectFilter.value, priority: priorityFilter.value, workType: workTypeFilter.value,
  release: releaseFilter.value, overdue: overdueOnly.value, compact: compact.value, sortKey: sortKey.value, sortDirection: sortDirection.value,
  visible: visibleColumns.value, order: columnOrder.value, selected: selectedTaskId.value,
} satisfies SavedState), { deep: true });

watch(userFilter, () => { if (userFilter.value !== appliedUserFilter) { refresh(); } });
function refresh(): void { requestedUserFilter = userFilter.value === 'current' ? undefined : userFilter.value; appliedUserFilter = undefined; loading.value = true; vscode.postMessage({ command: 'refreshProductionTasks', userFilter: requestedUserFilter }); }
function importSessionKey(): void { vscode.postMessage({ command: 'importProductionSessionKey' }); }
function setPassword(): void { vscode.postMessage({ command: 'setProductionTasksPassword' }); }
function openLog(): void { vscode.postMessage({ command: 'openProductionTasksLog' }); }
function openTask(id: number): void { vscode.postMessage({ command: 'openProductionTask', id }); }
function taskReference(task: ProductionTaskListItem): number { return Number(task.number) || task.id; }
function openTaskInClient(task: ProductionTaskListItem): void { vscode.postMessage({ command: 'openProductionTaskInClient', id: taskReference(task) }); }
function copyText(text: string): void { vscode.postMessage({ command: 'copyTableCells', text }); }
function changeSort(key: ColumnKey): void { if (sortKey.value === key) sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'; else { sortKey.value = key; sortDirection.value = 'asc'; } }
function sortValue(task: ProductionTaskListItem, key: ColumnKey): string { return key === 'deadline' ? String(productionDeadlineInfo(task.deadline).days).padStart(8, '0') : String(task[key] ?? ''); }
function uniqueValues(key: keyof ProductionTaskListItem): string[] { return [...new Set(tasks.value.map(task => String(task[key] ?? '')).filter(Boolean))].sort(collator.compare); }
function clearFilters(): void { searchQuery.value = ''; userFilter.value = currentUserId.value || 'current'; statusFilter.value = ''; projectFilter.value = ''; priorityFilter.value = ''; workTypeFilter.value = ''; releaseFilter.value = ''; overdueOnly.value = false; }
function toggleColumn(key: ColumnKey, checked: boolean | 'indeterminate'): void { if (checked) { if (!visibleColumns.value.includes(key)) visibleColumns.value.push(key); } else if (visibleColumns.value.length > 1) visibleColumns.value = visibleColumns.value.filter(value => value !== key); }
function moveColumn(key: ColumnKey, direction: -1 | 1): void { const index = columnOrder.value.indexOf(key); const target = index + direction; if (target < 0 || target >= columnOrder.value.length) return; const next = [...columnOrder.value]; [next[index], next[target]] = [next[target], next[index]]; columnOrder.value = next; }
function resetColumns(): void { visibleColumns.value = [...defaultOrder]; columnOrder.value = [...defaultOrder]; compact.value = true; }
function isColumnKey(value: unknown): value is ColumnKey { return typeof value === 'string' && defaultOrder.includes(value as ColumnKey); }
function normalizeOrder(order?: ColumnKey[]): ColumnKey[] { return [...(order ?? []).filter(isColumnKey), ...defaultOrder.filter(key => !order?.includes(key))]; }
function deadlineVariant(task: ProductionTaskListItem): 'destructive' | 'secondary' | 'outline' { const tone = productionDeadlineInfo(task.deadline).tone; return tone === 'overdue' ? 'destructive' : tone === 'today' ? 'secondary' : 'outline'; }

window.addEventListener('message', (event: MessageEvent<ProductionTasksHostMessage>) => {
  const message = event.data;
  if (message.command === 'productionTasksLoading') { loading.value = true; error.value = ''; return; }
  if (message.command === 'productionTasksFailed') { loading.value = false; error.value = message.message; return; }
  if (message.command === 'productionTaskUsersLoaded') {
    users.value = message.users.map(user => ({ id: String(user.id), name: user.name || `ID ${user.id}` }));
    return;
  }
  if (requestedUserFilter !== undefined && /^(?:\d+)?$/u.test(requestedUserFilter) && message.userFilter !== requestedUserFilter) { return; }
  tasks.value = message.tasks; loadedAt.value = message.loadedAt; loading.value = false; error.value = '';
  users.value = message.users.map(user => ({ id: String(user.id), name: user.name || `ID ${user.id}` }));
  appliedUserFilter = message.userFilter;
  currentUserId.value = String(message.currentPersonId);
  userFilter.value = message.userFilter;
  if (selectedTaskId.value && !tasks.value.some(task => task.id === selectedTaskId.value)) selectedTaskId.value = undefined;
});
vscode.postMessage({ command: 'productionTasksReady' });
</script>

<template>
  <main class="flex h-screen flex-col gap-4 overflow-auto bg-background p-4 text-foreground lg:p-6">
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-1">
        <p class="text-xs text-muted-foreground">Восточный Экспресс / Продакшен</p>
        <h1 class="text-2xl font-semibold tracking-tight">Задачи</h1>
        <p class="text-xs text-muted-foreground">{{ selectedUserLabel }}<span class="mx-2" aria-hidden="true">·</span>Рабочая очередь</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="outline" :disabled="loading" title="Выбрать новый файл и обновить ключ клиентской сессии OENP" @click="importSessionKey"><HugeiconsIcon :icon="FileImportIcon" data-icon="inline-start" />Обновить сессию</Button>
        <Button :disabled="loading" @click="refresh"><HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" :class="cn(loading && 'animate-spin')" />Обновить</Button>
      </div>
    </header>
    <section aria-label="Сводка по текущей выборке" class="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
      <Card v-for="metric in overview" :key="metric.label" size="sm">
        <CardHeader><CardDescription><span class="flex items-center justify-between gap-2">{{ metric.label }}<HugeiconsIcon :icon="metric.icon" class="size-4" aria-hidden="true" /></span></CardDescription></CardHeader>
        <CardContent><Skeleton v-if="loading" class="h-7 w-12" /><p v-else class="text-2xl font-semibold leading-none tracking-tight tabular-nums">{{ error ? '—' : metric.value }}</p><p class="mt-2 text-xs text-muted-foreground">{{ metric.note }}</p></CardContent>
      </Card>
    </section>
    <Card class="min-h-72 flex-1 gap-0 py-0">
    <CardHeader class="shrink-0 gap-3 border-b py-3">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2"><CardTitle>Рабочий список</CardTitle><Badge variant="secondary">{{ countLabel }}</Badge></div>
        <Field class="min-w-48 flex-1 sm:ml-auto sm:max-w-sm"><FieldLabel for="task-search" class="sr-only">Поиск задач</FieldLabel><InputGroup><InputGroupAddon><HugeiconsIcon :icon="Search01Icon" /></InputGroupAddon><InputGroupInput id="task-search" v-model="searchQuery" type="search" placeholder="Номер, название или параметр…" /></InputGroup></Field>
        <Popover><PopoverTrigger as-child><Button variant="outline" size="sm"><HugeiconsIcon :icon="ColumnsThreeCogIcon" data-icon="inline-start" />Колонки</Button></PopoverTrigger><PopoverContent class="w-80" align="end">
          <div class="flex items-center justify-between"><p class="font-semibold">Отображение таблицы</p><Button size="xs" variant="ghost" @click="resetColumns">Сбросить</Button></div>
          <FieldGroup class="max-h-80 gap-1 overflow-auto"><Field v-for="column in columnOrder.map(key => columns.find(item => item.key === key)!)" :key="column.key" orientation="horizontal"><Checkbox :id="`column-${column.key}`" :model-value="visibleColumns.includes(column.key)" @update:model-value="toggleColumn(column.key, $event)" /><FieldLabel class="min-w-0 flex-1 truncate" :for="`column-${column.key}`">{{ column.label }}</FieldLabel><Button size="icon-xs" variant="ghost" title="Сдвинуть влево" @click="moveColumn(column.key, -1)">←</Button><Button size="icon-xs" variant="ghost" title="Сдвинуть вправо" @click="moveColumn(column.key, 1)">→</Button></Field></FieldGroup>
          <Field orientation="horizontal"><Checkbox id="compact-tasks" v-model="compact" /><FieldLabel for="compact-tasks" class="font-normal">Компактные строки</FieldLabel></Field>
        </PopoverContent></Popover>
      </div>
      <FieldGroup class="flex-row flex-wrap items-center gap-2">
        <TaskFilter id="task-user" v-model="userFilter" label="Ответственный пользователь" all-label="Все пользователи" :options="userOptions" />
        <TaskFilter id="task-status" v-model="statusFilter" label="Статус" all-label="Все статусы" appearance="status" :options="statuses.map(value => ({ value, label: value }))" />
        <TaskFilter id="task-project" v-model="projectFilter" label="Проект" all-label="Все проекты" :options="projects.map(value => ({ value, label: value }))" />
        <TaskFilter id="task-priority" v-model="priorityFilter" label="Приоритет" all-label="Все приоритеты" appearance="priority" :options="priorities.map(value => ({ value, label: value }))" />
        <TaskFilter id="task-work-type" v-model="workTypeFilter" label="Вид работ" all-label="Все виды работ" :options="workTypes.map(value => ({ value, label: value }))" />
        <TaskFilter id="task-release" v-model="releaseFilter" label="Релиз" all-label="Все релизы" :options="releases.map(value => ({ value, label: value }))" />
        <Field orientation="horizontal" class="w-auto"><Checkbox id="overdue-only" v-model="overdueOnly" /><FieldLabel for="overdue-only" class="font-normal">Только просроченные</FieldLabel></Field>
        <Button v-if="filtersActive" size="xs" variant="ghost" @click="clearFilters">Сбросить фильтры</Button>
      </FieldGroup>
    </CardHeader>
    <CardContent class="flex min-h-0 flex-1 flex-col px-0">
    <div v-if="loading" class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-4"><Skeleton class="h-10 w-full" /><Skeleton v-for="index in 10" :key="index" class="h-9 w-full" /></div>
    <Empty v-else-if="error" class="min-h-0 flex-1 px-3"><EmptyHeader><EmptyTitle>Не удалось загрузить задачи</EmptyTitle><EmptyDescription class="break-words">{{ error }}</EmptyDescription></EmptyHeader><div class="flex flex-wrap justify-center gap-2"><Button size="sm" @click="importSessionKey"><HugeiconsIcon :icon="FileImportIcon" data-icon="inline-start" />Обновить сессию</Button><Button size="sm" variant="outline" @click="refresh">Повторить</Button><Button size="sm" variant="outline" @click="openLog">Открыть лог</Button><Button v-if="error.includes('пароль')" size="sm" @click="setPassword">Указать пароль production</Button></div></Empty>
    <Empty v-else-if="!tasks.length" class="min-h-0 flex-1"><EmptyHeader><EmptyTitle>Задач нет</EmptyTitle><EmptyDescription>{{ userFilter ? 'У выбранного пользователя нет задач.' : 'В рабочей базе нет задач.' }}</EmptyDescription></EmptyHeader></Empty>
    <Empty v-else-if="!sortedTasks.length" class="min-h-0 flex-1"><EmptyHeader><EmptyTitle>Ничего не найдено</EmptyTitle><EmptyDescription>Измените поиск или фильтры.</EmptyDescription></EmptyHeader></Empty>
    <Table v-else container-class="min-h-0 flex-1 overflow-auto" class="min-w-[1100px] whitespace-nowrap"><TableHeader class="sticky top-0 z-10 bg-background"><TableRow><TableHead v-for="column in activeColumns" :key="column.key" :class="column.width"><Button class="-ml-2 h-8 px-2" variant="ghost" size="sm" @click.stop="changeSort(column.key)">{{ column.label }} <span v-if="sortKey === column.key">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span></Button></TableHead></TableRow></TableHeader><TableBody>
      <ContextMenu v-for="task in sortedTasks" :key="task.id"><ContextMenuTrigger as-child><TableRow tabindex="0" :class="cn('cursor-default', compact ? 'h-7' : 'h-10')" :data-row-selected="selectedTaskId === task.id ? '' : undefined" @click="selectedTaskId = task.id" @dblclick="openTask(task.id)" @keydown.enter.prevent="openTask(task.id)"><TableCell v-for="column in activeColumns" :key="column.key" :class="cn('whitespace-nowrap', column.key === 'id' && 'font-mono', column.key === 'number' && 'font-semibold', column.key === 'title' && 'max-w-96')"><ProductionTaskBadge v-if="column.key === 'state'" kind="status" :value="task.state" /><ProductionTaskBadge v-else-if="column.key === 'priority'" kind="priority" :value="task.priority" /><Badge v-else-if="column.key === 'deadline'" :variant="deadlineVariant(task)" :title="task.deadline">{{ productionDeadlineInfo(task.deadline).label }}</Badge><template v-else-if="column.key === 'attachmentCount'">{{ task.attachmentCount || '—' }}</template><Button v-else-if="column.key === 'title'" variant="link" class="h-auto w-full justify-start truncate p-0 text-left text-foreground" :title="`${task.title || '—'} · Нажмите, чтобы скопировать название и ссылку`" @click.stop="copyText(productionTaskMarkdown(task.number, task.title, task.id))">{{ task.title || '—' }}</Button><span v-else class="block max-w-72 truncate" :title="String(task[column.key] || '—')">{{ task[column.key] || '—' }}</span></TableCell></TableRow></ContextMenuTrigger><ContextMenuContent><ContextMenuGroup><ContextMenuItem @select="openTask(task.id)"><HugeiconsIcon :icon="ViewIcon" data-icon="inline-start" />Просмотр</ContextMenuItem><ContextMenuItem @select="openTaskInClient(task)"><HugeiconsIcon :icon="ExternalLinkIcon" data-icon="inline-start" />Открыть в клиенте</ContextMenuItem></ContextMenuGroup><ContextMenuSeparator /><ContextMenuGroup><ContextMenuItem @select="copyText(String(task.id))"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />Копировать ID</ContextMenuItem><ContextMenuItem @select="copyText(productionTaskMarkdown(task.number, task.title, task.id))"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />Копировать название и ссылку</ContextMenuItem><ContextMenuItem @select="copyText(productionTaskPublicUrl(taskReference(task)))"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />Копировать URL</ContextMenuItem></ContextMenuGroup></ContextMenuContent></ContextMenu>
    </TableBody></Table>
    </CardContent>
    <footer class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground"><span>Двойной щелчок — открыть · Название — скопировать ссылку</span><span v-if="loadedAt && !loading">Обновлено {{ new Date(loadedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }}</span></footer>
    </Card>
  </main>
</template>

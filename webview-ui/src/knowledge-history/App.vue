<script setup lang="ts">
import { BookOpen01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, onUnmounted, ref } from 'vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { vscode } from '@/vscode';
import MarkdownContent from '@/components/MarkdownContent.vue';
import TaskSvnCommits, { type TaskSvnCommitRow } from '@/components/TaskSvnCommits.vue';

interface TaskRow {
  id: number; workspace: string; task_number: string; title: string; summary: string;
  status: string; agent_working: number; progress: string; updated_at: string; database_profile: string | null;
  changes: string; verification: string; limitations: string; sources_json: string;
  knowledge_extracted: number; knowledge_transferred: number; knowledge_reference: string | null;
}
interface CandidateRow {
  id: number; task_number: string; workspace: string; title: string; summary: string;
  reason: string; status: string; knowledge_reference: string | null; updated_at: string;
}
interface ArticleRow { id: string; title: string; excerpt: string }
interface DetailRow { id: number; [key: string]: unknown }
interface SvnCommit extends TaskSvnCommitRow { id: number }
interface TaskContext {
  task: TaskRow; entities: DetailRow[]; changes: DetailRow[]; verifications: DetailRow[];
  decisions: DetailRow[]; knowledgeCandidates: DetailRow[]; events: DetailRow[];
  svnCommits: SvnCommit[]; svnScan: { scanned_at: string; roots_json: string } | null;
}
type HostMessage =
  | { command: 'knowledgeHistoryLoaded'; tasks: TaskRow[]; candidates: CandidateRow[]; articles: ArticleRow[]; repository: string | null }
  | { command: 'knowledgeHistoryTasksUpdated'; tasks: TaskRow[] }
  | { command: 'knowledgeHistoryTask'; context: TaskContext }
  | { command: 'knowledgeHistorySvnLoading'; workspace: string; taskNumber: string }
  | { command: 'knowledgeHistorySvnLoaded'; workspace: string; taskNumber: string; commits: SvnCommit[]; scan: TaskContext['svnScan'] }
  | { command: 'knowledgeHistorySvnFailed'; workspace: string; taskNumber: string; message: string }
  | { command: 'knowledgeHistoryFailed'; message: string };

const tasks = ref<TaskRow[]>([]);
const candidates = ref<CandidateRow[]>([]);
const articles = ref<ArticleRow[]>([]);
const repository = ref<string | null>(null);
const selectedArticle = ref<ArticleRow>();
const context = ref<TaskContext>();
const selectedCandidate = ref<CandidateRow>();
const search = ref('');
const tab = ref('tasks');
const loading = ref(true);
const error = ref('');
const svnLoading = ref(false);
const svnError = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
const taskPoll = setInterval(() => {
  if (tab.value === 'tasks' && document.visibilityState === 'visible') vscode.postMessage({ command: 'knowledgeHistoryPollTasks' });
}, 5000);

const selectedTaskKey = computed(() => context.value ? `${context.value.task.workspace}:${context.value.task.task_number}` : '');

function onHostMessage(event: MessageEvent<HostMessage>): void {
  const message = event.data;
  if (message.command === 'knowledgeHistoryLoaded') {
    tasks.value = message.tasks;
    candidates.value = message.candidates;
    articles.value = message.articles;
    repository.value = message.repository;
    if (selectedArticle.value && !message.articles.some(article => article.id === selectedArticle.value?.id)) selectedArticle.value = undefined;
    loading.value = false;
    error.value = '';
  } else if (message.command === 'knowledgeHistoryTasksUpdated') {
    tasks.value = message.tasks;
  } else if (message.command === 'knowledgeHistoryTask') {
    context.value = message.context;
    selectedCandidate.value = undefined;
    error.value = '';
    svnError.value = '';
  } else if (message.command === 'knowledgeHistorySvnLoading' && context.value?.task.workspace === message.workspace && context.value.task.task_number === message.taskNumber) {
    svnLoading.value = true;
    svnError.value = '';
  } else if (message.command === 'knowledgeHistorySvnLoaded' && context.value?.task.workspace === message.workspace && context.value.task.task_number === message.taskNumber) {
    context.value.svnCommits = message.commits;
    context.value.svnScan = message.scan;
    svnLoading.value = false;
  } else if (message.command === 'knowledgeHistorySvnFailed' && context.value?.task.workspace === message.workspace && context.value.task.task_number === message.taskNumber) {
    svnLoading.value = false;
    svnError.value = message.message;
  } else if (message.command === 'knowledgeHistoryFailed') {
    loading.value = false;
    error.value = message.message;
  }
}
window.addEventListener('message', onHostMessage);
onUnmounted(() => { window.removeEventListener('message', onHostMessage); clearInterval(taskPoll); if (timer) clearTimeout(timer); });

function searchChanged(): void {
  if (timer) clearTimeout(timer);
  context.value = undefined;
  selectedCandidate.value = undefined;
  selectedArticle.value = undefined;
  timer = setTimeout(() => vscode.postMessage({ command: 'knowledgeHistorySearch', search: search.value }), 180);
}
function refresh(): void { loading.value = true; context.value = undefined; selectedCandidate.value = undefined; selectedArticle.value = undefined; vscode.postMessage({ command: 'knowledgeHistoryRefresh' }); }
function agentIsWorking(task: TaskRow): boolean {
  const updatedAt = Date.parse(`${task.updated_at.replace(' ', 'T')}Z`);
  return task.agent_working === 1 && Number.isFinite(updatedAt) && Date.now() - updatedAt < 15 * 60_000;
}
function selectTask(task: TaskRow): void {
  vscode.postMessage({ command: 'knowledgeHistorySelectTask', taskNumber: task.task_number, workspace: task.workspace });
}
function selectCandidate(candidate: CandidateRow): void { selectedCandidate.value = candidate; context.value = undefined; }
function selectArticle(article: ArticleRow): void { selectedArticle.value = article; }
function openArticle(article: ArticleRow): void { vscode.postMessage({ command: 'knowledgeHistoryOpenArticle', id: article.id }); }
function openObject(id: number): void { vscode.postMessage({ command: 'knowledgeHistoryOpenObject', id }); }
function refreshSvn(): void { if (context.value) vscode.postMessage({ command: 'knowledgeHistoryRefreshSvn', workspace: context.value.task.workspace, taskNumber: context.value.task.task_number }); }
function openSvnCommit(commit: SvnCommit): void { if (context.value) vscode.postMessage({ command: 'knowledgeHistoryOpenSvnCommit', workspace: context.value.task.workspace, taskNumber: context.value.task.task_number, commitId: commit.id }); }
function statusLabel(status: string): string {
  return ({ in_progress: 'В работе', blocked: 'Заблокирована', completed: 'Локально завершена',
    pending: 'Ожидает переноса', transferred: 'Перенесено', dismissed: 'Отклонено' } as Record<string, string>)[status] ?? status;
}
function date(value: string): string { return value ? new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z')).toLocaleString('ru-RU') : ''; }
function text(value: unknown): string { return value == null ? '' : String(value); }
function sources(value: string): string[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []; }
  catch { return []; }
}

vscode.postMessage({ command: 'knowledgeHistoryReady' });
</script>

<template>
  <main class="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-background p-3 text-foreground">
    <header class="flex shrink-0 items-center gap-3">
      <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><HugeiconsIcon :icon="BookOpen01Icon" class="size-5 text-primary" /></div>
      <div class="min-w-0 flex-1"><h1 class="truncate text-base font-semibold">Знания и история</h1><p class="truncate text-xs text-muted-foreground">Задачи, проверки и кандидаты в базу знаний</p></div>
      <Button variant="outline" size="sm" :disabled="loading" @click="refresh"><HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />Обновить</Button>
    </header>

    <Card size="sm" class="shrink-0 gap-0 py-0"><CardContent class="p-2"><Field class="gap-0"><FieldLabel for="knowledge-history-search" class="sr-only">Поиск в истории</FieldLabel><Input id="knowledge-history-search" v-model="search" type="search" placeholder="Номер задачи, название или текст…" @update:model-value="searchChanged" /></Field></CardContent></Card>

    <Empty v-if="error" class="min-h-0 flex-1 rounded-lg border bg-card"><EmptyHeader><EmptyTitle>Не удалось открыть историю</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader></Empty>
    <Tabs v-else v-model="tab" class="flex min-h-0 flex-1 flex-col gap-2">
      <TabsList class="shrink-0"><TabsTrigger value="tasks">Задачи</TabsTrigger><TabsTrigger value="knowledge">Кандидаты в знания</TabsTrigger><TabsTrigger value="articles">Статьи Git</TabsTrigger></TabsList>
      <TabsContent value="tasks" class="flex min-h-0 flex-1 data-[state=inactive]:hidden">
        <Card size="sm" class="min-h-0 flex-1 gap-0 py-0">
          <CardHeader class="sr-only"><CardTitle>История задач</CardTitle><CardDescription>Выберите задачу для просмотра контекста.</CardDescription></CardHeader>
          <CardContent class="min-h-0 flex-1 p-0">
            <Table container-class="h-full" class="min-w-[42rem]">
              <TableHeader class="sticky top-0 bg-card"><TableRow><TableHead class="w-28">Задача</TableHead><TableHead>Название и итог</TableHead><TableHead class="w-32">Статус</TableHead><TableHead class="w-44">Знания</TableHead><TableHead class="w-36">Обновлена</TableHead></TableRow></TableHeader>
              <TableBody><TableRow v-for="task in tasks" :key="`${task.workspace}:${task.task_number}`" tabindex="0" class="cursor-pointer" :data-row-selected="selectedTaskKey === `${task.workspace}:${task.task_number}` ? '' : undefined" @click="selectTask(task)" @keydown.enter.prevent="selectTask(task)">
                <TableCell class="font-mono text-xs">{{ task.task_number }}</TableCell>
                <TableCell class="max-w-0"><div class="truncate font-medium" :title="task.title">{{ task.title }}</div><div class="truncate text-xs text-muted-foreground" :title="task.summary || task.progress">{{ task.summary || task.progress }}</div></TableCell>
                <TableCell><Badge v-if="agentIsWorking(task)" variant="default">● Агент работает</Badge><Badge v-else :variant="task.status === 'blocked' ? 'destructive' : 'secondary'">{{ statusLabel(task.status) }}</Badge></TableCell>
                <TableCell><Badge v-if="task.knowledge_extracted" variant="secondary" title="Из задачи сохранена полезная информация в кандидаты; это не означает публикацию или полный разбор задачи">Извлечены в кандидаты</Badge><span v-else class="text-xs text-muted-foreground">Не извлечены</span><Badge v-if="task.knowledge_transferred" variant="outline">Опубликованы</Badge></TableCell>
                <TableCell class="whitespace-nowrap text-xs text-muted-foreground">{{ date(task.updated_at) }}</TableCell>
              </TableRow></TableBody>
            </Table>
          </CardContent>
          <CardFooter class="border-t px-3 py-1.5 text-xs text-muted-foreground">{{ loading ? 'Загрузка…' : `${tasks.length} задач` }}</CardFooter>
        </Card>
        <Dialog :open="!!context" @update:open="value => { if (!value) context = undefined; }">
          <DialogContent class="flex max-h-[90vh] w-[min(76rem,96vw)] max-w-none flex-col overflow-hidden sm:max-w-[min(76rem,96vw)]">
          <DialogHeader><DialogTitle>{{ context?.task.task_number }} · {{ context?.task.title }}</DialogTitle><DialogDescription>{{ context?.task.workspace }}<template v-if="context?.task.database_profile"> · {{ context.task.database_profile }}</template></DialogDescription></DialogHeader>
          <Tabs v-if="context" default-value="work" class="flex min-h-0 flex-1 flex-col">
            <TabsList><TabsTrigger value="work">Работа</TabsTrigger><TabsTrigger value="svn">SVN-коммиты · {{ context.svnCommits.length }}</TabsTrigger></TabsList>
          <TabsContent value="work" class="flex min-h-0 flex-col gap-3 overflow-y-auto text-sm">
            <MarkdownContent v-if="context.task.summary" :source="context.task.summary" @open-object="openObject" />
            <section v-if="context.task.progress"><h2 class="font-semibold">Прогресс</h2><MarkdownContent :source="context.task.progress" @open-object="openObject" /></section>
            <section v-if="context.task.changes"><h2 class="font-semibold">Изменения</h2><MarkdownContent :source="context.task.changes" @open-object="openObject" /></section>
            <section v-if="context.task.verification"><h2 class="font-semibold">Проверка</h2><MarkdownContent :source="context.task.verification" @open-object="openObject" /></section>
            <section v-if="context.task.limitations"><h2 class="font-semibold">Ограничения</h2><MarkdownContent :source="context.task.limitations" @open-object="openObject" /></section>
            <section v-if="sources(context.task.sources_json).length"><h2 class="font-semibold">Источники</h2><p v-for="source in sources(context.task.sources_json)" :key="source" class="break-all text-muted-foreground">{{ source }}</p></section>
            <section v-if="context.entities.length"><h2 class="font-semibold">Связанные объекты</h2><p v-for="item in context.entities" :key="item.id" class="text-muted-foreground">{{ text(item.entity_type) }}: <Button v-if="Number.isSafeInteger(Number(item.entity_id)) && Number(item.entity_id) > 0" variant="link" class="h-auto p-0 font-mono" @click="openObject(Number(item.entity_id))">{{ text(item.entity_id) }}</Button><span v-else>{{ text(item.entity_id) }}</span> · {{ text(item.relation) }}</p></section>
            <section v-if="context.changes.length"><h2 class="font-semibold">Изменения</h2><div v-for="item in context.changes" :key="item.id"><MarkdownContent :source="text(item.description)" @open-object="openObject" /><p class="text-xs text-muted-foreground">{{ text(item.source_locator) }}<template v-if="item.revision"> · {{ text(item.revision) }}</template></p></div></section>
            <section v-if="context.verifications.length"><h2 class="font-semibold">Проверки</h2><div v-for="item in context.verifications" :key="item.id"><p class="text-xs text-muted-foreground">{{ text(item.method) }} · {{ text(item.outcome) }}<template v-if="item.database_profile"> · {{ text(item.database_profile) }}</template><template v-if="item.release"> · {{ text(item.release) }}</template></p><MarkdownContent :source="text(item.result)" @open-object="openObject" /></div></section>
            <section v-if="context.decisions.length"><h2 class="font-semibold">Решения</h2><div v-for="item in context.decisions" :key="item.id"><MarkdownContent :source="text(item.decision)" @open-object="openObject" /><MarkdownContent v-if="item.rationale" :source="text(item.rationale)" @open-object="openObject" /><p v-if="item.alternatives" class="text-xs text-muted-foreground">Варианты: {{ text(item.alternatives) }}</p></div></section>
            <section v-if="context.knowledgeCandidates.length"><h2 class="font-semibold">Кандидаты в знания</h2><p v-for="item in context.knowledgeCandidates" :key="item.id" class="text-muted-foreground">{{ text(item.title) }} · {{ statusLabel(text(item.status)) }}</p></section>
          </TabsContent>
          <TabsContent value="svn" class="min-h-0 flex-1 overflow-y-auto"><TaskSvnCommits :task-number="context.task.task_number" :commits="context.svnCommits" :scanned-at="context.svnScan?.scanned_at" :loading="svnLoading" :error="svnError" @refresh="refreshSvn" @open="commit => openSvnCommit(commit as SvnCommit)" /></TabsContent>
          </Tabs>
          </DialogContent>
        </Dialog>
      </TabsContent>
      <TabsContent value="knowledge" class="flex min-h-0 flex-1 gap-3 data-[state=inactive]:hidden">
        <Card size="sm" class="min-h-0 flex-1 gap-0 py-0"><CardHeader class="sr-only"><CardTitle>Кандидаты в знания</CardTitle><CardDescription>Предложения из выполненной работы.</CardDescription></CardHeader><CardContent class="min-h-0 flex-1 p-0">
          <Table container-class="h-full" class="min-w-[40rem]"><TableHeader class="sticky top-0 bg-card"><TableRow><TableHead class="w-28">Задача</TableHead><TableHead>Знание</TableHead><TableHead class="w-36">Состояние</TableHead><TableHead class="w-36">Обновлено</TableHead></TableRow></TableHeader><TableBody>
            <TableRow v-for="candidate in candidates" :key="candidate.id" tabindex="0" class="cursor-pointer" :data-row-selected="selectedCandidate?.id === candidate.id ? '' : undefined" @click="selectCandidate(candidate)" @keydown.enter.prevent="selectCandidate(candidate)"><TableCell class="font-mono text-xs">{{ candidate.task_number }}</TableCell><TableCell class="max-w-0"><div class="truncate font-medium">{{ candidate.title }}</div><div class="truncate text-xs text-muted-foreground">{{ candidate.summary }}</div></TableCell><TableCell><Badge variant="secondary">{{ statusLabel(candidate.status) }}</Badge></TableCell><TableCell class="whitespace-nowrap text-xs text-muted-foreground">{{ date(candidate.updated_at) }}</TableCell></TableRow>
          </TableBody></Table>
        </CardContent><CardFooter class="border-t px-3 py-1.5 text-xs text-muted-foreground">{{ loading ? 'Загрузка…' : `${candidates.length} кандидатов` }}</CardFooter></Card>
        <Card v-if="selectedCandidate" size="sm" class="min-h-0 w-[min(38%,30rem)] min-w-72 overflow-y-auto"><CardHeader><CardTitle class="text-sm">{{ selectedCandidate.title }}</CardTitle><CardDescription>Задача {{ selectedCandidate.task_number }}</CardDescription></CardHeader><CardContent class="flex flex-col gap-3 text-xs"><p class="whitespace-pre-wrap">{{ selectedCandidate.summary }}</p><section><h2 class="font-semibold">Почему сохранить</h2><p class="whitespace-pre-wrap text-muted-foreground">{{ selectedCandidate.reason }}</p></section><section v-if="selectedCandidate.knowledge_reference"><h2 class="font-semibold">Запись в базе знаний</h2><p class="break-all text-muted-foreground">{{ selectedCandidate.knowledge_reference }}</p></section></CardContent></Card>
      </TabsContent>
      <TabsContent value="articles" class="flex min-h-0 flex-1 gap-3 data-[state=inactive]:hidden">
        <Card v-if="!repository" size="sm" class="min-h-0 flex-1"><CardHeader><CardTitle>Репозиторий знаний не найден</CardTitle><CardDescription>Выберите каталог ve-internal-docs, содержащий docs/knowledge.</CardDescription></CardHeader><CardContent><Button variant="outline" @click="vscode.postMessage({ command: 'knowledgeHistoryChooseRepository' })">Выбрать каталог</Button></CardContent></Card>
        <Card v-else size="sm" class="min-h-0 flex-1 gap-0 py-0"><CardHeader class="sr-only"><CardTitle>Статьи базы знаний</CardTitle><CardDescription>Документы из Git-репозитория знаний.</CardDescription></CardHeader><CardContent class="min-h-0 flex-1 p-0">
          <Table container-class="h-full" class="min-w-[35rem]"><TableHeader class="sticky top-0 bg-card"><TableRow><TableHead>Название статьи</TableHead><TableHead class="w-64">Файл</TableHead></TableRow></TableHeader><TableBody>
            <TableRow v-for="article in articles" :key="article.id" tabindex="0" class="cursor-pointer" :data-row-selected="selectedArticle?.id === article.id ? '' : undefined" @click="selectArticle(article)" @dblclick="openArticle(article)" @keydown.enter.prevent="openArticle(article)"><TableCell class="max-w-0"><div class="truncate font-medium">{{ article.title }}</div><div class="truncate text-xs text-muted-foreground">{{ article.excerpt }}</div></TableCell><TableCell class="max-w-64 truncate font-mono text-xs text-muted-foreground" :title="article.id">{{ article.id }}</TableCell></TableRow>
          </TableBody></Table>
        </CardContent><CardFooter class="border-t px-3 py-1.5 text-xs text-muted-foreground">{{ loading ? 'Загрузка…' : `${articles.length} статей · ${repository}` }}</CardFooter></Card>
        <Card v-if="selectedArticle" size="sm" class="min-h-0 w-[min(38%,30rem)] min-w-72 overflow-y-auto"><CardHeader><CardTitle class="text-sm">{{ selectedArticle.title }}</CardTitle><CardDescription>{{ selectedArticle.id }}</CardDescription></CardHeader><CardContent class="flex flex-col gap-3 text-xs"><p class="whitespace-pre-wrap text-muted-foreground">{{ selectedArticle.excerpt }}</p><Button variant="outline" class="self-start" @click="openArticle(selectedArticle)">Открыть статью</Button></CardContent></Card>
      </TabsContent>
    </Tabs>
  </main>
</template>

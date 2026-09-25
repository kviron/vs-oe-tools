<script setup lang="ts">
import { AlertCircleIcon, GitCompareIcon, RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import type { PackageSyncHostMessage } from '../../../src/core/webviewProtocol';
import type { PackageSyncIssue, PackageSyncItem, SvnMergeFile, SvnMergeResult } from '../../../src/features/package-sync/models';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import SearchField from '@/components/SearchField.vue';
import { defaultSearchOptions, matchesAnySearch, type SearchOptions } from '@/lib/searchMatch';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { vscode } from '@/vscode';

const items = ref<PackageSyncItem[]>([]);
const issues = ref<PackageSyncIssue[]>([]);
const loading = ref(true);
const error = ref('');
const query = ref('');
const searchOptions = ref<SearchOptions>({ ...defaultSearchOptions });
const selected = ref<number>();
const activeTab = ref<'changes' | 'errors' | 'merge'>('changes');
const mergeBranch = ref('trunk');
const mergeRevision = ref<number>();
const mergeRunning = ref(false);
const mergeError = ref('');
const mergeResult = ref<SvnMergeResult>();

const visible = computed(() => {
  return items.value.filter(item => matchesAnySearch([item.objectId, item.objectName, item.objectPath, item.packagePath, item.changeState], query.value, searchOptions.value));
});

const visibleIssues = computed(() => {
  return issues.value.filter(issue => matchesAnySearch(issueSearchFields(issue), query.value, searchOptions.value));
});

const mergeConflictCount = computed(() => mergeResult.value?.files.filter(file => file.conflicted).length ?? 0);

function issueSearchFields(issue: PackageSyncIssue): Array<string | number> {
  const common = [issue.objectId, issue.objectName, issue.classId ?? '', issue.className, issue.message, issue.changedBy];
  return issue.type === 'package-boundary'
    ? [...common, issue.referenceId, issue.referenceName, issue.sourcePackage, issue.targetPackage, issue.sourceFile, issue.recommendedFile]
    : [...common, issue.packagePath, issue.objectPath, issue.filePath, '#package$.pkf', 'извлечь'];
}

function issueDetails(issue: PackageSyncIssue): string {
  return issue.type === 'package-boundary'
    ? `${issue.attributeName} · ${issue.attributeId}; ссылка ${issue.referenceName} · ${issue.referenceId}`
    : `${issue.className}; объект найден в содержимом #package$.pkf`;
}

function issueCurrentLocation(issue: PackageSyncIssue): string {
  return issue.type === 'package-boundary'
    ? [issue.sourcePackage, issue.sourceFile].filter(Boolean).join('\\')
    : issue.filePath;
}

function issueExpectedLocation(issue: PackageSyncIssue): string {
  return issue.type === 'package-boundary'
    ? [issue.targetPackage, issue.recommendedFile].filter(Boolean).join('\\')
    : 'Извлечь объект из #package$.pkf';
}

function refresh(): void {
  error.value = '';
  vscode.postMessage({ command: 'refreshPackageSync' });
}

function openDiff(item: PackageSyncItem): void {
  selected.value = item.objectId;
  vscode.postMessage({ command: 'openPackageSyncDiff', objectId: item.objectId });
}

function runMerge(): void {
  if (!mergeBranch.value.trim() || !Number.isSafeInteger(mergeRevision.value) || (mergeRevision.value ?? 0) <= 0) return;
  const revision = mergeRevision.value!;
  mergeRunning.value = true;
  mergeError.value = '';
  vscode.postMessage({ command: 'mergeSvnRevision', branch: mergeBranch.value.trim(), revision });
}

function openConflict(file: SvnMergeFile): void {
  if (file.conflicted && !file.treeConflict) vscode.postMessage({ command: 'openSvnConflict', path: file.path });
}

function mergeStatus(file: SvnMergeFile): string {
  if (file.treeConflict) return 'Конфликт дерева';
  if (file.conflicted) return 'Конфликт';
  switch (file.status) {
    case 'added': return 'Добавлен';
    case 'deleted': return 'Удалён';
    case 'modified': return 'Изменён';
    case 'replaced': return 'Заменён';
    default: return 'Затронут';
  }
}

function displayPath(item: PackageSyncItem): string {
  return item.localPath || [item.packagePath, item.objectPath].filter(Boolean).join('\\');
}

function displayDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

window.addEventListener('message', (event: MessageEvent<PackageSyncHostMessage>) => {
  const message = event.data;
  if (message.command === 'packageSyncLoading') {
    loading.value = true;
    error.value = '';
  } else if (message.command === 'packageSyncLoaded') {
    items.value = message.items;
    issues.value = message.issues;
    loading.value = false;
  } else if (message.command === 'packageSyncFailed') {
    loading.value = false;
    error.value = message.message;
  } else if (message.command === 'svnMergeStarted') {
    mergeRunning.value = true;
    mergeError.value = '';
  } else if (message.command === 'svnMergeCancelled') {
    mergeRunning.value = false;
  } else if (message.command === 'svnMergeCompleted') {
    mergeRunning.value = false;
    mergeResult.value = message.result;
  } else if (message.command === 'svnMergeFailed') {
    mergeRunning.value = false;
    mergeError.value = message.message;
  }
});

vscode.postMessage({ command: 'packageSyncReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 min-w-0 flex-col gap-4 p-3 sm:p-5">
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><HugeiconsIcon :icon="GitCompareIcon" class="size-5 text-primary" /></div>
        <div class="min-w-0"><h1 class="truncate text-lg font-semibold">Синхронизация пакетов</h1><p class="truncate text-xs text-muted-foreground">Изменения рабочей копии, диагностика пакетов и перенос SVN-ревизий</p></div>
      </div>
      <div class="flex flex-wrap items-center gap-2"><Badge variant="outline">{{ items.length }} изменений</Badge><Badge :variant="issues.length ? 'destructive' : 'secondary'">{{ issues.length }} проблем</Badge></div>
    </header>

    <Tabs v-model="activeTab" class="min-h-0 min-w-0 flex-1 gap-3">
      <TabsList class="h-auto min-h-8 max-w-full shrink-0 flex-wrap">
        <TabsTrigger value="changes">Изменения <Badge variant="secondary">{{ items.length }}</Badge></TabsTrigger>
        <TabsTrigger value="errors">Проблемы <Badge :variant="issues.length ? 'destructive' : 'secondary'">{{ issues.length }}</Badge></TabsTrigger>
        <TabsTrigger value="merge">Merge SVN <Badge v-if="mergeResult" variant="secondary">{{ mergeResult.files.length }}</Badge></TabsTrigger>
      </TabsList>

      <Alert v-if="error" variant="destructive" class="shrink-0"><HugeiconsIcon :icon="AlertCircleIcon" /><AlertTitle>Не удалось загрузить синхронизацию пакетов</AlertTitle><AlertDescription class="flex flex-wrap items-center justify-between gap-3"><span class="break-words">{{ error }}</span><Button variant="outline" size="sm" @click="refresh">Повторить</Button></AlertDescription></Alert>

      <TabsContent value="changes" class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-0.5">
        <Card size="sm" class="shrink-0">
          <CardHeader class="flex flex-wrap items-center justify-between gap-3"><div class="flex min-w-0 flex-col gap-1"><CardTitle>Изменённые файлы <Badge variant="secondary">{{ loading ? '…' : visible.length }}</Badge></CardTitle><CardDescription>Двойной щелчок по строке открывает сравнение локального PKF с версией из БД</CardDescription></div></CardHeader>
          <CardContent class="flex flex-wrap items-end gap-3"><Field class="min-w-56 flex-1 gap-1.5"><FieldLabel for="package-sync-search">Поиск</FieldLabel><SearchField id="package-sync-search" v-model="query" v-model:options="searchOptions" placeholder="Имя, путь или ID…" /></Field><Button variant="outline" size="sm" :disabled="loading" @click="refresh"><Spinner v-if="loading" data-icon="inline-start" /><HugeiconsIcon v-else :icon="RefreshIcon" data-icon="inline-start" />{{ loading ? 'Обновление…' : 'Обновить' }}</Button></CardContent>
        </Card>

        <Table v-if="loading || visible.length" container-class="min-h-24 min-w-0 flex-1 overflow-auto rounded-lg border bg-card" class="min-w-[1100px]">
          <TableHeader class="sticky top-0 z-10 bg-card"><TableRow><TableHead class="h-9 min-w-28 px-3">Статус</TableHead><TableHead class="h-9 min-w-56 px-3">Имя</TableHead><TableHead class="h-9 min-w-24 px-3">Тип</TableHead><TableHead class="h-9 min-w-24 px-3">Ревизия</TableHead><TableHead class="h-9 min-w-32 px-3">MD5</TableHead><TableHead class="h-9 min-w-36 px-3">Дата</TableHead><TableHead class="h-9 min-w-40 px-3">Пользователь</TableHead><TableHead class="h-9 min-w-80 px-3">Путь</TableHead></TableRow></TableHeader>
          <TableBody>
            <template v-if="loading"><TableRow v-for="row in 8" :key="row"><TableCell v-for="column in 8" :key="column" class="px-3 py-1"><Skeleton class="h-4 w-full" /></TableCell></TableRow></template>
            <TableRow v-for="item in loading ? [] : visible" :key="item.objectId" class="h-8 cursor-default" :data-row-selected="selected === item.objectId ? '' : undefined" :aria-selected="selected === item.objectId ? 'true' : undefined" :title="`ID ${item.objectId}. Двойной щелчок — Local Diff`" @click="selected = item.objectId" @dblclick="openDiff(item)">
              <TableCell class="whitespace-nowrap px-3 py-1"><Badge variant="secondary">{{ item.changeState || '—' }}</Badge></TableCell><TableCell class="max-w-80 truncate px-3 py-1 font-medium" :title="item.objectName">{{ item.objectName || `#${item.objectId}` }}</TableCell><TableCell class="px-3 py-1">{{ item.objectClassId }}</TableCell><TableCell class="px-3 py-1">{{ item.contentRevision ?? '' }}</TableCell><TableCell class="max-w-32 truncate px-3 py-1 font-mono" :title="item.contentMd5">{{ item.contentMd5 }}</TableCell><TableCell class="whitespace-nowrap px-3 py-1">{{ displayDate(item.changedAt) }}</TableCell><TableCell class="max-w-48 truncate px-3 py-1" :title="item.changedBy">{{ item.changedBy }}</TableCell><TableCell class="max-w-96 truncate px-3 py-1" :title="displayPath(item)">{{ displayPath(item) }}</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter v-if="!loading" class="sticky bottom-0 z-10 bg-card"><TableRow><TableCell :colspan="8" class="h-5 px-1 py-0 text-right text-[0.625rem] font-normal text-muted-foreground">Строк: {{ visible.length }}<template v-if="visible.length !== items.length"> из {{ items.length }}</template></TableCell></TableRow></TableFooter>
        </Table>
        <Empty v-else class="min-h-0 py-8"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon :icon="GitCompareIcon" /></EmptyMedia><EmptyTitle>{{ items.length ? 'Ничего не найдено' : 'Рабочая копия синхронизирована' }}</EmptyTitle><EmptyDescription>{{ items.length ? 'Измените или очистите строку поиска.' : 'Изменённых объектов относительно базы данных нет.' }}</EmptyDescription></EmptyHeader></Empty>
      </TabsContent>

      <TabsContent value="errors" class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-0.5">
        <Card size="sm" class="shrink-0">
          <CardHeader class="flex flex-wrap items-center justify-between gap-3"><div class="flex min-w-0 flex-col gap-1"><CardTitle>Проблемы пакетов <Badge :variant="issues.length ? 'destructive' : 'secondary'">{{ loading ? '…' : visibleIssues.length }}</Badge></CardTitle><CardDescription>Проверка #package$ и зависимостей между пакетами для изменённых ссылок</CardDescription></div></CardHeader>
          <CardContent class="flex flex-wrap items-end gap-3"><Field class="min-w-56 flex-1 gap-1.5"><FieldLabel for="package-issue-search">Поиск</FieldLabel><SearchField id="package-issue-search" v-model="query" v-model:options="searchOptions" placeholder="Ошибка, объект, пакет или ID…" /></Field><Button variant="outline" size="sm" :disabled="loading" @click="refresh"><Spinner v-if="loading" data-icon="inline-start" /><HugeiconsIcon v-else :icon="RefreshIcon" data-icon="inline-start" />{{ loading ? 'Обновление…' : 'Обновить' }}</Button></CardContent>
        </Card>

        <Table v-if="loading || visibleIssues.length" container-class="min-h-24 min-w-0 flex-1 overflow-auto rounded-lg border bg-card" class="min-w-[1420px]">
          <TableHeader class="sticky top-0 z-10 bg-card"><TableRow><TableHead class="h-9 min-w-80 px-3">Ошибка</TableHead><TableHead class="h-9 min-w-64 px-3">Объект</TableHead><TableHead class="h-9 min-w-24 px-3">ID</TableHead><TableHead class="h-9 min-w-48 px-3">Класс</TableHead><TableHead class="h-9 min-w-80 px-3">Детали</TableHead><TableHead class="h-9 min-w-80 px-3">Сейчас</TableHead><TableHead class="h-9 min-w-80 px-3">Ожидается</TableHead><TableHead class="h-9 min-w-40 px-3">Владелец</TableHead><TableHead class="h-9 min-w-36 px-3">Тип</TableHead></TableRow></TableHeader>
          <TableBody>
            <template v-if="loading"><TableRow v-for="row in 8" :key="row"><TableCell v-for="column in 9" :key="column" class="px-3 py-1"><Skeleton class="h-4 w-full" /></TableCell></TableRow></template>
            <TableRow v-for="issue in loading ? [] : visibleIssues" :key="`${issue.type}-${issue.objectId}-${issue.type === 'package-boundary' ? issue.referenceId : ''}`" class="h-8 cursor-default bg-destructive/5 hover:bg-destructive/10"><TableCell class="max-w-96 px-3 py-1 font-medium text-destructive" :title="issue.message">{{ issue.message }}</TableCell><TableCell class="max-w-96 truncate px-3 py-1" :title="issue.objectName">{{ issue.objectName }}</TableCell><TableCell class="px-3 py-1 font-mono">{{ issue.objectId }}</TableCell><TableCell class="px-3 py-1">{{ issue.className }}<template v-if="issue.classId !== null"> · {{ issue.classId }}</template></TableCell><TableCell class="max-w-96 truncate px-3 py-1" :title="issueDetails(issue)">{{ issueDetails(issue) }}</TableCell><TableCell class="max-w-96 truncate px-3 py-1 text-destructive" :title="issueCurrentLocation(issue)">{{ issueCurrentLocation(issue) }}</TableCell><TableCell class="max-w-96 truncate px-3 py-1 font-medium" :title="issueExpectedLocation(issue)">{{ issueExpectedLocation(issue) }}</TableCell><TableCell class="px-3 py-1">{{ issue.changedBy }}</TableCell><TableCell class="whitespace-nowrap px-3 py-1"><Badge variant="destructive">{{ issue.type === 'package-boundary' ? 'Граница пакетов' : '#package$' }}</Badge></TableCell></TableRow>
          </TableBody>
          <TableFooter v-if="!loading" class="sticky bottom-0 z-10 bg-card"><TableRow><TableCell :colspan="9" class="h-5 px-1 py-0 text-right text-[0.625rem] font-normal text-muted-foreground">Строк: {{ visibleIssues.length }}<template v-if="visibleIssues.length !== issues.length"> из {{ issues.length }}</template></TableCell></TableRow></TableFooter>
        </Table>
        <Empty v-else class="min-h-0 py-8"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon :icon="GitCompareIcon" /></EmptyMedia><EmptyTitle>{{ issues.length ? 'Ничего не найдено' : 'Проблем не обнаружено' }}</EmptyTitle><EmptyDescription>{{ issues.length ? 'Измените или очистите строку поиска.' : 'Проверки #package$ и пакетных границ пройдены.' }}</EmptyDescription></EmptyHeader></Empty>
      </TabsContent>

      <TabsContent value="merge" class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-0.5">
        <Card size="sm" class="shrink-0"><CardHeader><div class="flex min-w-0 flex-col gap-1"><CardTitle>Перенос SVN-ревизии</CardTitle><CardDescription>Применяет одну ревизию к локальной папке packages без commit</CardDescription></div></CardHeader><CardContent><form @submit.prevent="runMerge"><FieldGroup class="grid items-end gap-3 md:grid-cols-[minmax(14rem,1fr)_10rem_auto]"><Field><FieldLabel for="merge-branch">Ветка или SVN URL</FieldLabel><Input id="merge-branch" v-model="mergeBranch" placeholder="trunk, r-3.7 или ^/branches/r-3.7" /></Field><Field><FieldLabel for="merge-revision">Ревизия</FieldLabel><Input id="merge-revision" v-model.number="mergeRevision" type="number" min="1" step="1" placeholder="145401" /></Field><Button type="submit" :disabled="mergeRunning || !mergeBranch.trim() || !mergeRevision"><Spinner v-if="mergeRunning" data-icon="inline-start" />{{ mergeRunning ? 'Выполняется…' : 'Выполнить merge' }}</Button><FieldDescription class="md:col-span-full">Короткое имя, например <span class="font-mono">r-3.7</span>, означает ветку в каталоге <span class="font-mono">branches</span>.</FieldDescription></FieldGroup></form></CardContent></Card>

        <Alert v-if="mergeError" variant="destructive" class="shrink-0"><HugeiconsIcon :icon="AlertCircleIcon" /><AlertTitle>Merge не выполнен</AlertTitle><AlertDescription>{{ mergeError }}</AlertDescription></Alert>
        <div v-else-if="mergeRunning" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Spinner />SVN применяет ревизию…</div>
        <Table v-else-if="mergeResult?.files.length" container-class="min-h-24 min-w-0 flex-1 overflow-auto rounded-lg border bg-card" class="min-w-[720px]">
          <TableHeader class="sticky top-0 z-10 bg-card"><TableRow><TableHead class="h-9 w-40 px-3">Статус</TableHead><TableHead class="h-9 min-w-96 px-3">Файл</TableHead><TableHead class="h-9 w-32 px-3">Действие</TableHead></TableRow></TableHeader>
          <TableBody><TableRow v-for="file in mergeResult.files" :key="file.path" :class="cn('h-8 cursor-default', file.conflicted && 'bg-destructive/5 hover:bg-destructive/10')" @dblclick="openConflict(file)"><TableCell class="px-3 py-1"><Badge :variant="file.conflicted ? 'destructive' : 'secondary'">{{ mergeStatus(file) }}</Badge></TableCell><TableCell class="px-3 py-1 font-mono" :title="file.path">{{ file.path }}</TableCell><TableCell class="px-3 py-1"><Button v-if="file.conflicted && !file.treeConflict" variant="outline" size="sm" class="h-7" @click="openConflict(file)">Разрешить</Button><span v-else-if="file.treeConflict" class="text-muted-foreground">Через SVN</span></TableCell></TableRow></TableBody>
          <TableFooter class="sticky bottom-0 z-10 bg-card"><TableRow><TableCell :colspan="3" class="h-5 px-1 py-0 text-right text-[0.625rem] font-normal text-muted-foreground">r{{ mergeResult.revision }} · файлов: {{ mergeResult.files.length }} · конфликтов: {{ mergeConflictCount }}</TableCell></TableRow></TableFooter>
        </Table>
        <Empty v-else class="min-h-0 py-8"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon :icon="GitCompareIcon" /></EmptyMedia><EmptyTitle>{{ mergeResult ? 'Файлы не изменены' : 'Укажите ветку и ревизию' }}</EmptyTitle><EmptyDescription>{{ mergeResult ? `Ревизия r${mergeResult.revision} не изменила рабочую копию.` : 'Результат merge появится в таблице ниже.' }}</EmptyDescription></EmptyHeader></Empty>
        <details v-if="mergeResult?.output" class="max-h-40 shrink-0 overflow-auto rounded-lg border bg-card px-3 py-2 text-xs"><summary class="cursor-pointer text-muted-foreground">Вывод SVN</summary><pre class="mt-2 whitespace-pre-wrap font-mono">{{ mergeResult.output }}</pre></details>
      </TabsContent>
    </Tabs>
  </main>
</template>

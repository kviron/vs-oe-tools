<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PackageSyncHostMessage } from '../../../src/core/webviewProtocol';
import type { PackageSyncIssue, PackageSyncItem, SvnMergeFile, SvnMergeResult } from '../../../src/features/package-sync/models';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { vscode } from '@/vscode';

const items = ref<PackageSyncItem[]>([]);
const issues = ref<PackageSyncIssue[]>([]);
const loading = ref(true);
const error = ref('');
const query = ref('');
const selected = ref<number>();
const activeTab = ref<'changes' | 'errors' | 'merge'>('changes');
const mergeBranch = ref('trunk');
const mergeRevision = ref<number>();
const mergeRunning = ref(false);
const mergeError = ref('');
const mergeResult = ref<SvnMergeResult>();

const visible = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('ru');
  if (!value) return items.value;
  return items.value.filter(item => [item.objectId, item.objectName, item.objectPath, item.packagePath, item.changeState]
    .some(field => String(field).toLocaleLowerCase('ru').includes(value)));
});

const visibleIssues = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('ru');
  if (!value) return issues.value;
  return issues.value.filter(issue => issueSearchFields(issue)
    .some(field => String(field).toLocaleLowerCase('ru').includes(value)));
});

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
  <div class="flex h-screen min-h-0 flex-col overflow-hidden">
    <div class="flex shrink-0 items-center gap-1 border-b bg-muted p-1">
      <button type="button" class="h-7 border bg-background px-2 hover:bg-accent disabled:opacity-50" :disabled="loading" @click="refresh">
        {{ loading ? 'Загрузка…' : 'Обновить' }}
      </button>
      <input v-model="query" type="search" class="h-7 min-w-0 flex-1 border bg-background px-2" placeholder="Фильтр по имени, пути или ID">
    </div>

    <div class="flex shrink-0 gap-1 border-b bg-background px-1 pt-1 text-xs">
      <button type="button" :class="cn('border border-b-0 px-3 py-1.5', activeTab === 'changes' ? 'bg-muted font-medium' : 'bg-background text-muted-foreground')" @click="activeTab = 'changes'">
        Изменения · {{ items.length }}
      </button>
      <button type="button" :class="cn('border border-b-0 px-3 py-1.5', activeTab === 'errors' ? 'bg-muted font-medium' : 'bg-background text-muted-foreground')" @click="activeTab = 'errors'">
        Ошибки · <span :class="cn(issues.length && 'font-semibold text-destructive')">{{ issues.length }}</span>
      </button>
      <button type="button" :class="cn('border border-b-0 px-3 py-1.5', activeTab === 'merge' ? 'bg-muted font-medium' : 'bg-background text-muted-foreground')" @click="activeTab = 'merge'">
        Merge SVN<span v-if="mergeResult"> · {{ mergeResult.files.length }}</span>
      </button>
    </div>

    <div v-if="error" class="m-2 border border-destructive/50 bg-destructive/10 p-2 text-destructive">
      <div class="font-medium">Не удалось загрузить синхронизацию пакетов</div>
      <div class="mt-1 break-words text-xs">{{ error }}</div>
      <button type="button" class="mt-2 border bg-background px-2 py-1 text-foreground hover:bg-accent" @click="refresh">Повторить</button>
    </div>
    <div v-else-if="activeTab === 'changes' && !loading && visible.length === 0" class="p-4 text-center text-muted-foreground">
      {{ items.length ? 'По фильтру ничего не найдено.' : 'Изменённых объектов нет.' }}
    </div>
    <div v-else-if="activeTab === 'errors' && !loading && visibleIssues.length === 0" class="p-4 text-center text-muted-foreground">
      {{ issues.length ? 'По фильтру ничего не найдено.' : 'Ошибок синхронизации и нарушений пакетных границ не найдено.' }}
    </div>
    <div v-else-if="activeTab === 'changes'" class="min-h-0 flex-1 overflow-auto">
      <table class="w-max min-w-full border-collapse text-xs">
        <thead class="sticky top-0 z-10 bg-background">
          <tr class="border-b text-left">
            <th class="px-2 py-1">Статус</th><th class="px-2 py-1">Имя</th><th class="px-2 py-1">Тип</th>
            <th class="px-2 py-1">Ревизия</th><th class="px-2 py-1">MD5</th><th class="px-2 py-1">Дата</th>
            <th class="px-2 py-1">Пользователь</th><th class="px-2 py-1">Путь</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in visible"
            :key="item.objectId"
            :class="cn('cursor-default border-b border-border/50 hover:bg-accent', selected === item.objectId && 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)] hover:bg-[var(--vscode-list-activeSelectionBackground)]')"
            :title="`ID ${item.objectId}. Двойной щелчок — Local Diff`"
            @click="selected = item.objectId"
            @dblclick="openDiff(item)"
          >
            <td class="whitespace-nowrap px-2 py-1 font-medium">{{ item.changeState || '—' }}</td>
            <td class="max-w-80 truncate px-2 py-1">{{ item.objectName || `#${item.objectId}` }}</td>
            <td class="px-2 py-1">{{ item.objectClassId }}</td>
            <td class="px-2 py-1">{{ item.contentRevision ?? '' }}</td>
            <td class="max-w-28 truncate px-2 py-1 font-mono">{{ item.contentMd5 }}</td>
            <td class="whitespace-nowrap px-2 py-1">{{ displayDate(item.changedAt) }}</td>
            <td class="px-2 py-1">{{ item.changedBy }}</td>
            <td class="max-w-96 truncate px-2 py-1" :title="displayPath(item)">{{ displayPath(item) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else-if="activeTab === 'errors'" class="min-h-0 flex-1 overflow-auto">
      <table class="w-max min-w-full border-collapse text-xs">
        <thead class="sticky top-0 z-10 bg-background">
          <tr class="border-b text-left">
            <th class="px-2 py-1">Ошибка</th><th class="px-2 py-1">Объект</th><th class="px-2 py-1">ID</th><th class="px-2 py-1">Класс</th>
            <th class="px-2 py-1">Детали</th><th class="px-2 py-1">Сейчас</th><th class="px-2 py-1">Ожидается</th>
            <th class="px-2 py-1">Владелец</th><th class="px-2 py-1">Тип</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="issue in visibleIssues" :key="`${issue.type}-${issue.objectId}-${issue.type === 'package-boundary' ? issue.referenceId : ''}`" class="border-b border-border/50 bg-destructive/5 hover:bg-destructive/10">
            <td class="max-w-96 px-2 py-1 font-medium text-destructive" :title="issue.message">{{ issue.message }}</td>
            <td class="max-w-96 truncate px-2 py-1" :title="issue.objectName">{{ issue.objectName }}</td>
            <td class="px-2 py-1 font-mono">{{ issue.objectId }}</td>
            <td class="px-2 py-1">{{ issue.className }}<template v-if="issue.classId !== null"> · {{ issue.classId }}</template></td>
            <td class="max-w-96 truncate px-2 py-1" :title="issueDetails(issue)">{{ issueDetails(issue) }}</td>
            <td class="max-w-96 truncate px-2 py-1 text-destructive" :title="issueCurrentLocation(issue)">{{ issueCurrentLocation(issue) }}</td>
            <td class="max-w-96 truncate px-2 py-1 font-medium" :title="issueExpectedLocation(issue)">{{ issueExpectedLocation(issue) }}</td>
            <td class="px-2 py-1">{{ issue.changedBy }}</td>
            <td class="whitespace-nowrap px-2 py-1"><Badge variant="destructive">{{ issue.type === 'package-boundary' ? 'Граница пакетов' : '#package$' }}</Badge></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <form class="grid shrink-0 grid-cols-[minmax(14rem,1fr)_10rem_auto] items-end gap-2 border-b p-3" @submit.prevent="runMerge">
        <label class="grid gap-1 text-xs"><span class="font-medium">Ветка или SVN URL</span><Input v-model="mergeBranch" placeholder="trunk, r-3.7 или ^/branches/r-3.7" /></label>
        <label class="grid gap-1 text-xs"><span class="font-medium">Ревизия</span><Input v-model.number="mergeRevision" type="number" min="1" step="1" placeholder="145401" /></label>
        <Button type="submit" :disabled="mergeRunning || !mergeBranch.trim() || !mergeRevision">{{ mergeRunning ? 'Выполняется…' : 'Выполнить merge' }}</Button>
        <p class="col-span-full text-xs text-muted-foreground">Будет выполнен merge одной ревизии в локальную папку packages. Commit расширение не выполняет.</p>
      </form>
      <div v-if="mergeError" class="m-2 border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">{{ mergeError }}</div>
      <div v-else-if="!mergeResult && !mergeRunning" class="p-6 text-center text-muted-foreground">Укажите исходную ветку и ревизию. Короткое имя, например <span class="font-mono">r-3.7</span>, означает ветку в каталоге <span class="font-mono">branches</span>.</div>
      <div v-else-if="mergeRunning" class="p-6 text-center text-muted-foreground">SVN применяет ревизию…</div>
      <template v-else-if="mergeResult">
        <div class="shrink-0 border-b px-3 py-2 text-xs"><span class="font-medium">r{{ mergeResult.revision }}</span> из <span class="font-mono">{{ mergeResult.source }}</span><span class="ml-3 text-muted-foreground">{{ mergeResult.files.length }} файлов, конфликтов: {{ mergeResult.files.filter(file => file.conflicted).length }}</span></div>
        <div class="min-h-0 flex-1 overflow-auto">
          <table class="w-full border-collapse text-xs">
            <thead class="sticky top-0 bg-background"><tr class="border-b text-left"><th class="w-36 px-2 py-1">Статус</th><th class="px-2 py-1">Файл</th><th class="w-28 px-2 py-1">Действие</th></tr></thead>
            <tbody><tr v-for="file in mergeResult.files" :key="file.path" :class="cn('border-b border-border/50', file.conflicted && 'bg-destructive/5')" @dblclick="openConflict(file)">
              <td class="px-2 py-1"><Badge :variant="file.conflicted ? 'destructive' : 'secondary'">{{ mergeStatus(file) }}</Badge></td>
              <td class="px-2 py-1 font-mono" :title="file.path">{{ file.path }}</td>
              <td class="px-2 py-1"><Button v-if="file.conflicted && !file.treeConflict" variant="outline" class="h-7" @click="openConflict(file)">Разрешить</Button><span v-else-if="file.treeConflict" class="text-muted-foreground">Через SVN</span></td>
            </tr></tbody>
          </table>
        </div>
        <details v-if="mergeResult.output" class="max-h-40 shrink-0 overflow-auto border-t px-3 py-2 text-xs"><summary class="cursor-pointer text-muted-foreground">Вывод SVN</summary><pre class="mt-2 whitespace-pre-wrap font-mono">{{ mergeResult.output }}</pre></details>
      </template>
    </div>
    <div class="shrink-0 border-t px-2 py-1 text-xs text-muted-foreground">
      <template v-if="loading">Получение данных…</template>
      <template v-else-if="activeTab === 'changes'">{{ visible.length }} из {{ items.length }} · двойной щелчок сравнивает с временной версией оригинального клиента</template>
      <template v-else-if="activeTab === 'errors'">{{ visibleIssues.length }} из {{ issues.length }} · проверяются #package$ и зависимости пакетов для изменённых ссылок</template>
      <template v-else>SVN merge изменяет только рабочую копию · перед commit проверьте список и разрешите конфликты</template>
    </div>
  </div>
</template>

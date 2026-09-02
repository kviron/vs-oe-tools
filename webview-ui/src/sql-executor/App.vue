<script setup lang="ts">
import type { SqlExecutorHostMessage, SqlHistoryEntry } from '../../../src/core/webviewProtocol';
import type { SerializedQueryResult } from '../../../src/infrastructure/database/databaseQueryExecutor';
import { Copy01Icon, Download04Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, nextTick, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import SortableTableHead from '@/components/SortableTableHead.vue';
import { vscode } from '@/vscode';
import { formatTableValue } from '@/lib/formatId';
import { nextSort, sortedRows, type SortDirection } from '@/lib/tableSort';

const sql = ref('SELECT ');
const history = ref<SqlHistoryEntry[]>([]);
const historyOpen = ref(false);
const executing = ref(false);
const result = ref<SerializedQueryResult>();
const error = ref('');
const durationMs = ref<number>();
const database = ref('');
const editor = ref<HTMLTextAreaElement>();
const highlightLayer = ref<HTMLElement>();
const resultSortKey = ref<string>();
const resultSortDirection = ref<SortDirection>('asc');

const highlightedSql = computed(() => highlightSql(sql.value));
const sortedHistory = computed(() => history.value.slice().reverse());
const sortedResultRows = computed(() => result.value ? sortedRows(result.value.rows, resultSortKey.value, resultSortDirection.value, (row, key) => row[key]) : []);

window.addEventListener('message', (event: MessageEvent<SqlExecutorHostMessage>) => {
  const message = event.data;
  if (message.command === 'sqlExecutorInitialized') {
    history.value = message.history;
  } else if (message.command === 'sqlExecutorHistoryChanged') {
    const index = history.value.findIndex(entry => entry.id === message.entry.id);
    if (index < 0) history.value.push(message.entry); else history.value[index] = message.entry;
  } else if (message.command === 'sqlExecutionSucceeded') {
    executing.value = false;
    result.value = message.result;
    durationMs.value = message.durationMs;
    database.value = message.database;
    resultSortKey.value = undefined;
  } else if (message.command === 'sqlExecutionFailed') {
    executing.value = false;
    result.value = undefined;
    error.value = message.message;
  }
});

function execute(): void {
  if (executing.value || !sql.value.trim()) return;
  executing.value = true;
  result.value = undefined;
  error.value = '';
  durationMs.value = undefined;
  vscode.postMessage({ command: 'executeSql', text: sql.value });
}

function selectHistory(entry: SqlHistoryEntry): void {
  sql.value = entry.text;
  historyOpen.value = false;
  void nextTick(() => editor.value?.focus());
}

function syncEditorScroll(): void {
  if (!editor.value || !highlightLayer.value) return;
  highlightLayer.value.scrollTop = editor.value.scrollTop;
  highlightLayer.value.scrollLeft = editor.value.scrollLeft;
}

function formatHistoryTime(value: string): string {
  return new Date(value).toLocaleTimeString('ru-RU', { hour12: false });
}

function sortResult(key: string): void {
  resultSortDirection.value = nextSort(resultSortKey.value, resultSortDirection.value, key);
  resultSortKey.value = key;
}

function copyResult(format: 'markdown' | 'json'): void {
  vscode.postMessage({ command: 'copySqlResult', format });
}

function exportResult(): void {
  vscode.postMessage({ command: 'exportSqlResult' });
}

function highlightSql(source: string): string {
  const tokens = /(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\b(?:select|insert|update|delete|from|where|join|inner|left|right|full|outer|on|as|and|or|not|null|is|in|exists|between|like|order|by|group|having|limit|offset|union|all|distinct|values|into|set|returning|create|alter|drop|truncate|table|view|index|with|case|when|then|else|end|asc|desc|nulls|first|last|true|false)\b|\b\d+(?:\.\d+)?\b)/gi;
  let html = '';
  let position = 0;
  for (const match of source.matchAll(tokens)) {
    const index = match.index ?? 0;
    html += escapeHtml(source.slice(position, index));
    const token = match[0];
    const cssClass = token.startsWith('--') || token.startsWith('/*')
      ? 'sql-comment'
      : token.startsWith("'")
        ? 'sql-string'
        : /^\d/.test(token)
          ? 'sql-number'
          : token.startsWith('"')
            ? 'sql-identifier'
            : 'sql-keyword';
    html += `<span class="${cssClass}">${escapeHtml(token)}</span>`;
    position = index + token.length;
  }
  return `${html}${escapeHtml(source.slice(position))}\n`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] ?? character);
}

vscode.postMessage({ command: 'sqlExecutorReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col gap-1 p-1">
    <section class="flex shrink-0 flex-col gap-1">
      <div class="flex items-center gap-1">
        <Button size="sm" :disabled="executing || !sql.trim()" @click="execute">
          {{ executing ? 'Выполняется…' : 'Выполнить запрос' }}
        </Button>
        <Collapsible v-model:open="historyOpen" class="relative">
          <CollapsibleTrigger as-child>
            <Button variant="outline" size="sm">История ({{ history.length }})</Button>
          </CollapsibleTrigger>
          <CollapsibleContent class="absolute left-0 top-full z-10 mt-1 max-h-64 w-[min(42rem,90vw)] overflow-auto border bg-background p-1 shadow-md">
            <div v-if="sortedHistory.length" class="flex flex-col gap-1">
              <Button
                v-for="entry in sortedHistory"
                :key="entry.id"
                variant="ghost"
                class="h-auto justify-start px-2 py-1 text-left"
                @click="selectHistory(entry)"
              >
                <span class="w-full truncate"><b>{{ entry.operation }}</b> · {{ formatHistoryTime(entry.startedAt) }} · {{ entry.source }} · {{ entry.text }}</span>
              </Button>
            </div>
            <p v-else class="p-2 text-xs text-muted-foreground">История запросов пока пуста.</p>
          </CollapsibleContent>
        </Collapsible>
        <span class="ml-auto text-xs text-muted-foreground">Ctrl+Enter · {{ database || 'текущая база проекта' }}</span>
      </div>

      <div class="sql-editor relative h-32 overflow-hidden border bg-background font-mono text-xs">
        <pre ref="highlightLayer" aria-hidden="true" class="pointer-events-none absolute inset-0 m-0 overflow-hidden p-2"><code v-html="highlightedSql" /></pre>
        <textarea
          ref="editor"
          v-model="sql"
          aria-label="SQL-запрос"
          class="absolute inset-0 size-full resize-none overflow-auto border-0 bg-transparent p-2 font-mono text-xs text-transparent outline-none"
          spellcheck="false"
          @scroll="syncEditorScroll"
          @keydown.ctrl.enter.prevent="execute"
        />
      </div>
    </section>

    <section class="min-h-0 flex-1 overflow-auto border">
      <Empty v-if="executing" class="h-full min-h-0 py-6">
        <EmptyHeader><EmptyTitle>Запрос выполняется…</EmptyTitle></EmptyHeader>
      </Empty>
      <Empty v-else-if="error" class="h-full min-h-0 py-6">
        <EmptyHeader><EmptyTitle>Ошибка выполнения</EmptyTitle><EmptyDescription class="whitespace-pre-wrap">{{ error }}</EmptyDescription></EmptyHeader>
      </Empty>
      <template v-else-if="result">
        <Table v-if="result.columns.length">
          <TableHeader class="sticky top-0 bg-background">
            <TableRow><SortableTableHead v-for="column in result.columns" :key="column" class="h-7 px-2" :active="resultSortKey === column" :direction="resultSortDirection" @sort="sortResult(column)">{{ column }}</SortableTableHead></TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(row, rowIndex) in sortedResultRows" :key="rowIndex">
              <TableCell v-for="column in result.columns" :key="column" class="max-w-96 px-2 py-1 font-mono" :title="formatTableValue(column, row[column])">
                <span class="block truncate">{{ formatTableValue(column, row[column]) }}</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Empty v-else class="h-full min-h-0 py-6">
          <EmptyHeader><EmptyTitle>Запрос выполнен</EmptyTitle><EmptyDescription>Обработано строк: {{ result.rowCount }}.</EmptyDescription></EmptyHeader>
        </Empty>
        <div class="sticky bottom-0 flex flex-wrap items-center gap-1 border-t bg-background p-1">
          <p class="mr-auto text-xs text-muted-foreground">
            {{ result.rowCount }} строк · {{ durationMs?.toFixed(2) }} мс<span v-if="result.resultTruncated"> · показаны первые 500 строк</span>
          </p>
          <Button variant="outline" size="sm" title="Скопировать читаемую Markdown-таблицу для чата" @click="copyResult('markdown')">
            <HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />
            Для чата
          </Button>
          <Button variant="outline" size="sm" title="Скопировать структурированный JSON" @click="copyResult('json')">
            <HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />
            JSON
          </Button>
          <Button variant="outline" size="sm" title="Выгрузить результат в файл" @click="exportResult">
            <HugeiconsIcon :icon="Download04Icon" data-icon="inline-start" />
            В файл…
          </Button>
        </div>
      </template>
      <Empty v-else class="h-full min-h-0 py-6">
        <EmptyHeader><EmptyTitle>Результат запроса</EmptyTitle><EmptyDescription>Введите SQL и нажмите «Выполнить запрос».</EmptyDescription></EmptyHeader>
      </Empty>
    </section>
  </main>
</template>

<style scoped>
.sql-editor pre,
.sql-editor textarea {
  line-height: 1.5;
  tab-size: 2;
  white-space: pre;
}

.sql-editor textarea {
  caret-color: var(--foreground);
}

.sql-editor textarea::selection {
  background: color-mix(in oklab, var(--primary) 35%, transparent);
}

.sql-editor :deep(.sql-keyword) { color: var(--vscode-symbolIcon-keywordForeground, var(--primary)); font-weight: 600; }
.sql-editor :deep(.sql-string) { color: var(--vscode-symbolIcon-stringForeground, var(--foreground)); }
.sql-editor :deep(.sql-number) { color: var(--vscode-symbolIcon-numberForeground, var(--foreground)); }
.sql-editor :deep(.sql-comment) { color: var(--muted-foreground); font-style: italic; }
.sql-editor :deep(.sql-identifier) { color: var(--vscode-symbolIcon-fieldForeground, var(--foreground)); }
</style>

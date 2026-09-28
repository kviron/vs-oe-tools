<script setup lang="ts">
import { RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface TaskSvnCommitRow {
  id: number | string; repository_root: string; revision: number; author: string;
  committed_at: string; message: string; paths_json: string;
}
const props = defineProps<{ taskNumber: string; commits: TaskSvnCommitRow[]; scannedAt?: string | null; loading: boolean; error: string }>();
const emit = defineEmits<{ refresh: []; open: [commit: TaskSvnCommitRow] }>();
const selectedId = ref<number | string>();
const selected = computed(() => props.commits.find(commit => commit.id === selectedId.value));
function date(value: string): string { return value ? new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z')).toLocaleString('ru-RU') : ''; }
function paths(value: string): string[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []; }
  catch { return []; }
}
function excerpt(commit: TaskSvnCommitRow): string {
  const line = commit.message.trimStart().split(/\r?\n/, 1)[0] ?? '';
  return line.length > 220 ? `${line.slice(0, 217)}…` : line;
}
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3 text-sm">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">Задача {{ taskNumber }} · двойной клик открывает изменения · {{ scannedAt ? `проверено ${date(scannedAt)}` : 'ещё не проверено' }}</p>
      <Button variant="outline" size="sm" :disabled="loading" @click="emit('refresh')"><HugeiconsIcon :icon="RefreshIcon" class="size-4" />{{ loading ? 'Поиск…' : 'Обновить' }}</Button>
    </div>
    <p v-if="error" class="break-words text-destructive">{{ error }}</p>
    <Table v-if="commits.length" container-class="max-h-[32rem] overflow-auto" class="w-full table-fixed"><TableHeader class="sticky top-0 bg-card"><TableRow><TableHead class="w-24">Ревизия</TableHead><TableHead class="w-36">Автор</TableHead><TableHead class="w-44">Дата</TableHead><TableHead>Комментарий</TableHead></TableRow></TableHeader><TableBody>
      <TableRow v-for="commit in commits" :key="commit.id" tabindex="0" class="cursor-pointer" :data-row-selected="selectedId === commit.id ? '' : undefined" @click="selectedId = commit.id" @dblclick="emit('open', commit)" @keydown.enter.prevent="emit('open', commit)"><TableCell class="font-mono">r{{ commit.revision }}</TableCell><TableCell class="truncate" :title="commit.author">{{ commit.author }}</TableCell><TableCell class="whitespace-nowrap text-xs">{{ date(commit.committed_at) }}</TableCell><TableCell class="max-w-0 truncate" :title="excerpt(commit)">{{ excerpt(commit) }}</TableCell></TableRow>
    </TableBody></Table>
    <p v-else-if="!loading && !error" class="text-muted-foreground">Коммитов, начинающихся с номера задачи, не найдено.</p>
    <div v-if="selected" class="max-h-[35vh] overflow-y-auto rounded-md border bg-card p-3">
      <div class="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><strong class="font-mono text-foreground">r{{ selected.revision }}</strong><span>{{ selected.author }}</span><span>{{ date(selected.committed_at) }}</span><span class="break-all">{{ selected.repository_root }}</span></div>
      <pre class="whitespace-pre-wrap break-words font-sans">{{ selected.message }}</pre>
      <details v-if="paths(selected.paths_json).length" class="mt-3 text-xs text-muted-foreground"><summary class="cursor-pointer">Изменённые пути ({{ paths(selected.paths_json).length }})</summary><p v-for="item in paths(selected.paths_json)" :key="item" class="break-all py-0.5 font-mono">{{ item }}</p></details>
    </div>
  </div>
</template>

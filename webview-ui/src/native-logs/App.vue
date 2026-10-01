<script setup lang="ts">
import { File01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { NativeLogsHostMessage, NativeLogListEntry } from '../../../src/core/webviewProtocol';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import SortableTableHead from '@/components/SortableTableHead.vue';
import { nextSort, sortedRows, type SortDirection } from '@/lib/tableSort';
import SearchField from '@/components/SearchField.vue';
import { defaultSearchOptions, type SearchOptions } from '@/lib/searchMatch';
import { vscode } from '@/vscode';

const directory = ref('');
const files = ref<NativeLogListEntry[]>([]);
const selectedFile = ref<string>();
const loading = ref(false);
const error = ref('');
const filter = ref('');
type SortKey = 'name' | 'modifiedAt' | 'size';
const sortKey = ref<SortKey>();
const sortDirection = ref<SortDirection>('desc');
const displayedFiles = computed(() => sortedRows(files.value, sortKey.value, sortDirection.value, (file, key) =>
	key === 'modifiedAt' ? Date.parse(file.modifiedAt) : file[key as SortKey]));
function changeSort(key: SortKey): void {
	sortDirection.value = nextSort(sortKey.value, sortDirection.value, key);
	sortKey.value = key;
}
const searchOptions = ref<SearchOptions>({ ...defaultSearchOptions });

let searchTimer: ReturnType<typeof setTimeout> | undefined;
function refresh(): void {
	if (searchTimer) { clearTimeout(searchTimer); }
	vscode.postMessage({ command: 'refreshNativeLogs', query: filter.value, options: { ...searchOptions.value } });
}
watch([filter, searchOptions], () => {
	if (searchTimer) { clearTimeout(searchTimer); }
	searchTimer = setTimeout(refresh, 250);
}, { deep: true });
onBeforeUnmount(() => { if (searchTimer) { clearTimeout(searchTimer); } });
function formatDate(value: string): string { return new Date(value).toLocaleString('ru-RU'); }

window.addEventListener('message', (event: MessageEvent<NativeLogsHostMessage>) => {
	const message = event.data;
	if (message.command === 'nativeLogsLoading') {
		loading.value = true;
		error.value = '';
	} else if (message.command === 'nativeLogsLoaded') {
		loading.value = false;
		directory.value = message.directory;
		files.value = message.files;
		selectedFile.value = message.selectedFile;
	} else {
		loading.value = false;
		error.value = message.message;
	}
});

function openLog(file: NativeLogListEntry): void {
	selectedFile.value = file.name;
	vscode.postMessage({ command: 'openNativeLog', fileName: file.name });
}

function formatSize(size: number): string {
	return size < 1024 ? `${size} Б` : `${(size / 1024).toFixed(1)} КБ`;
}

vscode.postMessage({ command: 'nativeLogsReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <header class="flex shrink-0 items-center gap-2 border-b p-2">
      <div class="min-w-0 flex-1"><h1 class="text-sm font-medium">Логирование</h1><p class="truncate text-xs text-muted-foreground" :title="directory">{{ directory || 'bin\\logs' }}</p></div>
      <Button variant="outline" size="sm" :disabled="loading" @click="refresh"><HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />{{ loading ? 'Обновление…' : 'Обновить' }}</Button>
    </header>

    <div v-if="directory" class="flex min-h-0 flex-1 flex-col gap-1 p-2">
      <SearchField v-model="filter" v-model:options="searchOptions" placeholder="Поиск по имени и содержимому" aria-label="Поиск по имени и содержимому логов" />
      <div class="min-h-0 flex-1 overflow-hidden rounded-md border">
        <Table container-class="h-full" class="min-w-[36rem]">
          <TableHeader class="sticky top-0 z-10 bg-background"><TableRow>
            <SortableTableHead class="h-8 px-3" :active="sortKey === 'name'" :direction="sortDirection" @sort="changeSort('name')">Файл</SortableTableHead>
            <SortableTableHead class="h-8 w-44 px-3" :active="sortKey === 'modifiedAt'" :direction="sortDirection" @sort="changeSort('modifiedAt')">Дата обновления</SortableTableHead>
            <SortableTableHead class="h-8 w-24 px-3" :active="sortKey === 'size'" :direction="sortDirection" @sort="changeSort('size')">Размер</SortableTableHead>
          </TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="file in displayedFiles" :key="file.name" :aria-current="selectedFile === file.name ? 'true' : undefined" tabindex="0" class="h-8 cursor-default" @dblclick="openLog(file)" @keydown.enter.prevent="openLog(file)">
              <TableCell class="max-w-[36rem] px-3 py-1 text-xs"><div class="flex items-center gap-2"><HugeiconsIcon :icon="File01Icon" class="size-4 shrink-0" aria-hidden="true" data-copy-ignore data-filter-ignore /><span class="truncate" :title="file.name">{{ file.name }}</span></div></TableCell>
              <TableCell class="whitespace-nowrap px-3 py-1 text-xs tabular-nums" :title="file.modifiedAt">{{ formatDate(file.modifiedAt) }}</TableCell>
              <TableCell class="whitespace-nowrap px-3 py-1 text-right text-xs tabular-nums">{{ formatSize(file.size) }}</TableCell>
            </TableRow>
            <TableRow v-if="!loading && !error && !displayedFiles.length"><TableCell colspan="3" class="h-24 text-center text-muted-foreground">Совпадений не найдено.</TableCell></TableRow>
          </TableBody>
        </Table>
      </div>
    </div>

    <Empty v-if="error" class="min-h-0 flex-1 py-4"><EmptyHeader><EmptyTitle>Не удалось прочитать логи</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader></Empty>
    <Empty v-else-if="!loading && files.length === 0 && !filter.trim()" class="min-h-0 flex-1 py-4"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon :icon="File01Icon" /></EmptyMedia><EmptyTitle>Логи не найдены</EmptyTitle><EmptyDescription>Ожидаются текстовые файлы в bin\logs или bin.win64\logs.</EmptyDescription></EmptyHeader></Empty>
  </main>
</template>

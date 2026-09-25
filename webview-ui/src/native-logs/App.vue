<script setup lang="ts">
import { File01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import type { NativeLogsHostMessage, NativeLogListEntry } from '../../../src/core/webviewProtocol';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import SearchField from '@/components/SearchField.vue';
import { defaultSearchOptions, matchesSearch, type SearchOptions } from '@/lib/searchMatch';
import { vscode } from '@/vscode';

const directory = ref('');
const files = ref<NativeLogListEntry[]>([]);
const selectedFile = ref<string>();
const loading = ref(false);
const error = ref('');
const filter = ref('');
const searchOptions = ref<SearchOptions>({ ...defaultSearchOptions });

const displayedFiles = computed(() => {
	return files.value.filter(file => matchesSearch(file.name, filter.value, searchOptions.value));
});

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
      <Button variant="outline" size="sm" :disabled="loading" @click="vscode.postMessage({ command: 'refreshNativeLogs' })"><HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />{{ loading ? 'Обновление…' : 'Обновить' }}</Button>
    </header>

    <div v-if="files.length" class="flex min-h-0 flex-1 flex-col gap-1 p-2">
      <SearchField v-model="filter" v-model:options="searchOptions" placeholder="Фильтр файлов" aria-label="Фильтр файлов логов" />
      <div class="min-h-0 flex-1 overflow-auto rounded-md border">
        <Button v-for="file in displayedFiles" :key="file.name" type="button" variant="ghost" class="h-auto w-full justify-start rounded-none border-b px-2 py-1.5 text-left last:border-b-0" :class="selectedFile === file.name ? 'bg-accent text-accent-foreground' : undefined" @click="openLog(file)">
          <HugeiconsIcon :icon="File01Icon" class="shrink-0" />
          <span class="min-w-0 flex-1 truncate text-xs" :title="file.name">{{ file.name }}</span>
          <span class="shrink-0 text-xs text-muted-foreground">{{ formatSize(file.size) }}</span>
        </Button>
      </div>
    </div>

    <Empty v-if="error" class="min-h-0 flex-1 py-4"><EmptyHeader><EmptyTitle>Не удалось прочитать логи</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader></Empty>
    <Empty v-else-if="!loading && files.length === 0" class="min-h-0 flex-1 py-4"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon :icon="File01Icon" /></EmptyMedia><EmptyTitle>Логи не найдены</EmptyTitle><EmptyDescription>Ожидаются текстовые файлы в bin\logs или bin.win64\logs.</EmptyDescription></EmptyHeader></Empty>
  </main>
</template>

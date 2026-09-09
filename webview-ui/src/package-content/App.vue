<script setup lang="ts">
import { RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { nextTick, ref } from 'vue';
import type { PackageContentHostMessage } from '../../../src/core/webviewProtocol';
import type { PackageFileContent } from '../../../src/features/packages/models';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { vscode } from '@/vscode';
import PackageContentRow from './PackageContentRow.vue';

const result = ref<PackageFileContent>();
const selectedObjectId = ref<number>();
const loading = ref(true);
const error = ref('');
function refresh(): void { vscode.postMessage({ command: 'refreshPackageContent' }); }
function reveal(id: number): void {
  selectedObjectId.value = id;
  void nextTick(() => document.querySelector<HTMLElement>(`[data-object-id="${id}"]`)?.scrollIntoView({ behavior: 'instant', block: 'center' }));
}
window.addEventListener('message', (event: MessageEvent<PackageContentHostMessage>) => {
  const message = event.data;
  if (message.command === 'packageContentLoading') { loading.value = true; error.value = ''; }
  else if (message.command === 'packageContentLoaded') { result.value = message.result; loading.value = false; if (message.selectedObjectId !== undefined) reveal(message.selectedObjectId); }
  else if (message.command === 'revealPackageContentObject') { reveal(message.objectId); }
  else { loading.value = false; error.value = message.message; }
});
vscode.postMessage({ command: 'packageContentReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col bg-background text-foreground">
    <header class="flex h-8 shrink-0 items-center gap-2 border-b px-2">
      <span v-if="result" class="min-w-0 flex-1 truncate text-xs">{{ result.packageName }}\{{ result.groupPath }}\{{ result.fileName }}</span>
      <Button variant="ghost" size="sm" :disabled="loading" title="Обновить" @click="refresh"><HugeiconsIcon :icon="RefreshIcon" data-icon="inline-start" />Обновить</Button>
    </header>
    <div v-if="loading" class="flex flex-col gap-1 p-1"><Skeleton v-for="index in 12" :key="index" class="h-7 w-full" /></div>
    <Empty v-else-if="error" class="min-h-0 flex-1"><EmptyHeader><EmptyTitle>Не удалось открыть содержимое</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader></Empty>
    <Empty v-else-if="!result?.objects.length" class="min-h-0 flex-1"><EmptyHeader><EmptyTitle>Файл пуст</EmptyTitle><EmptyDescription>В базе нет объектов, связанных с этим SysFile.</EmptyDescription></EmptyHeader></Empty>
    <Table v-else container-class="min-h-0 flex-1 overflow-auto">
      <TableHeader class="sticky top-0 bg-background"><TableRow>
        <TableHead class="h-7 min-w-72 px-2">Имя</TableHead><TableHead class="h-7 min-w-44 px-2">Класс</TableHead><TableHead class="h-7 min-w-28 px-2">Ид</TableHead><TableHead class="h-7 min-w-28 px-2">Родитель</TableHead><TableHead class="h-7 min-w-28 px-2">Ид класса</TableHead>
      </TableRow></TableHeader>
      <TableBody><PackageContentRow v-for="node in result?.objects" :key="node.id" :node="node" :selected-object-id="selectedObjectId" /></TableBody>
    </Table>
    <footer v-if="result && !loading" class="shrink-0 border-t px-2 py-0.5 text-right text-[0.625rem] text-muted-foreground">Двойной щелчок открывает специализированную карточку объекта</footer>
  </main>
</template>

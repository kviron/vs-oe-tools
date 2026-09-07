<script setup lang="ts">
import { RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import type { ProductionTasksHostMessage } from '../../../src/core/webviewProtocol';
import type { ProductionTaskSummary } from '../../../src/features/production-tasks/models';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { vscode } from '@/vscode';

const tasks = ref<ProductionTaskSummary[]>([]);
const loading = ref(true);
const error = ref('');
const loadedAt = ref('');
const countLabel = computed(() => loading.value ? 'Загрузка…' : `${tasks.value.length}`);
function refresh(): void { vscode.postMessage({ command: 'refreshProductionTasks' }); }
function importSessionKey(): void { vscode.postMessage({ command: 'importProductionSessionKey' }); }
function setPassword(): void { vscode.postMessage({ command: 'setProductionTasksPassword' }); }
function openLog(): void { vscode.postMessage({ command: 'openProductionTasksLog' }); }
function openTask(id: number): void { vscode.postMessage({ command: 'openProductionTask', id }); }
window.addEventListener('message', (event: MessageEvent<ProductionTasksHostMessage>) => {
  const message = event.data;
  if (message.command === 'productionTasksLoading') { loading.value = true; error.value = ''; return; }
  if (message.command === 'productionTasksFailed') { loading.value = false; error.value = message.message; return; }
  tasks.value = message.tasks; loadedAt.value = message.loadedAt; loading.value = false; error.value = '';
});
vscode.postMessage({ command: 'productionTasksReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col bg-background text-foreground">
    <header class="flex shrink-0 items-center gap-2 border-b px-2 py-1">
      <span class="truncate text-xs text-muted-foreground">Продакшен · {{ countLabel }}</span>
      <Button class="ml-auto size-7" variant="ghost" size="icon" title="Обновить задачи" :disabled="loading" @click="refresh">
        <HugeiconsIcon :icon="RefreshIcon" />
      </Button>
    </header>
    <div v-if="loading" class="flex flex-col gap-1 p-1"><Skeleton v-for="index in 8" :key="index" class="h-16 w-full" /></div>
    <Empty v-else-if="error" class="min-h-0 flex-1 px-3">
      <EmptyHeader><EmptyTitle>Не удалось загрузить задачи</EmptyTitle><EmptyDescription class="break-words">{{ error }}</EmptyDescription></EmptyHeader>
      <div class="flex flex-wrap justify-center gap-2"><Button size="sm" variant="outline" @click="refresh">Повторить</Button><Button size="sm" variant="outline" @click="openLog">Открыть лог</Button><Button v-if="error.includes('Неверное имя или пароль') || error.includes('пароль для production')" size="sm" @click="setPassword">Указать пароль production</Button><Button v-if="error.includes('productionClientSessionKey') || error.includes('productionPersonId')" size="sm" @click="importSessionKey">Импортировать настройки</Button></div>
    </Empty>
    <Empty v-else-if="!tasks.length" class="min-h-0 flex-1"><EmptyHeader><EmptyTitle>Задач нет</EmptyTitle><EmptyDescription>Для текущего исполнителя нет активных задач.</EmptyDescription></EmptyHeader></Empty>
    <div v-else class="min-h-0 flex-1 overflow-y-auto p-1">
      <button v-for="task in tasks" :key="task.id" class="mb-1 flex w-full flex-col gap-1 rounded-sm border px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" @click="openTask(task.id)">
        <span class="flex w-full items-center gap-2"><strong class="truncate text-xs">{{ task.number || `ID ${task.id}` }}</strong><Badge class="ml-auto shrink-0" variant="secondary">{{ task.state || 'Без статуса' }}</Badge></span>
        <span class="line-clamp-2 text-xs leading-4">{{ task.description || 'Без описания' }}</span>
        <span v-if="task.deadline || task.project" class="truncate text-[0.625rem] text-muted-foreground">{{ [task.deadline && `до ${task.deadline}`, task.project].filter(Boolean).join(' · ') }}</span>
      </button>
    </div>
    <footer v-if="loadedAt && !loading" class="shrink-0 border-t px-2 py-0.5 text-[0.625rem] text-muted-foreground">Обновлено {{ new Date(loadedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }}</footer>
  </main>
</template>

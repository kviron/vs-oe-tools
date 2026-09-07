<script setup lang="ts">
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { ref } from 'vue';
import type { ProductionTaskDetailsHostMessage } from '../../../src/core/webviewProtocol';
import type { ProductionTaskSummary } from '../../../src/features/production-tasks/models';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { vscode } from '@/vscode';
const task = ref<ProductionTaskSummary>();
const fields = [
  ['Создана', 'createdAt'], ['Срок', 'deadline'], ['Вид работ', 'workType'], ['Проект', 'project'],
  ['Заказчик', 'customer'], ['Исполнитель', 'executor'], ['Инициатор', 'initiator'],
] as const;
function openInClient(): void { if (task.value) vscode.postMessage({ command: 'openProductionTaskInClient', id: task.value.id }); }
window.addEventListener('message', (event: MessageEvent<ProductionTaskDetailsHostMessage>) => { task.value = event.data.task; });
vscode.postMessage({ command: 'productionTaskDetailsReady' });
</script>

<template>
  <main class="min-h-screen bg-background p-3 text-foreground">
    <div v-if="!task" class="flex flex-col gap-2"><Skeleton class="h-9 w-72" /><Skeleton class="h-44 w-full" /></div>
    <div v-else class="mx-auto flex max-w-5xl flex-col gap-3">
      <header class="flex flex-wrap items-center gap-2">
        <div><h1 class="text-lg font-semibold">Задача {{ task.number || task.id }}</h1><p class="text-xs text-muted-foreground">ID {{ task.id }}</p></div>
        <Badge class="ml-2" variant="secondary">{{ task.state || 'Без статуса' }}</Badge>
        <Button class="ml-auto" size="sm" @click="openInClient"><HugeiconsIcon :icon="ArrowUpRight01Icon" data-icon="inline-start" />Открыть в Восточном Экспрессе</Button>
      </header>
      <Separator />
      <Card><CardHeader class="pb-2"><CardTitle class="text-sm">Описание</CardTitle></CardHeader><CardContent class="whitespace-pre-wrap text-sm leading-5">{{ task.description || 'Описание не заполнено.' }}</CardContent></Card>
      <div class="grid gap-3 md:grid-cols-2">
        <Card><CardHeader class="pb-2"><CardTitle class="text-sm">Параметры</CardTitle></CardHeader><CardContent><dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-xs"><template v-for="field in fields" :key="field[1]"><dt class="text-muted-foreground">{{ field[0] }}</dt><dd class="break-words">{{ task[field[1]] || '—' }}</dd></template></dl></CardContent></Card>
        <Card><CardHeader class="pb-2"><CardTitle class="text-sm">Комментарий</CardTitle></CardHeader><CardContent class="whitespace-pre-wrap text-sm leading-5">{{ task.comment || 'Комментарий не заполнен.' }}</CardContent></Card>
      </div>
    </div>
  </main>
</template>

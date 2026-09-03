<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PackageSyncHostMessage } from '../../../src/core/webviewProtocol';
import type { PackageSyncItem } from '../../../src/features/package-sync/models';
import { vscode } from '@/vscode';

const items = ref<PackageSyncItem[]>([]);
const loading = ref(true);
const error = ref('');
const query = ref('');
const selected = ref<number>();

const visible = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('ru');
  if (!value) return items.value;
  return items.value.filter(item => [item.objectId, item.objectName, item.objectPath, item.packagePath, item.changeState]
    .some(field => String(field).toLocaleLowerCase('ru').includes(value)));
});

function refresh(): void {
  error.value = '';
  vscode.postMessage({ command: 'refreshPackageSync' });
}

function openDiff(item: PackageSyncItem): void {
  selected.value = item.objectId;
  vscode.postMessage({ command: 'openPackageSyncDiff', objectId: item.objectId });
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
    loading.value = false;
  } else if (message.command === 'packageSyncFailed') {
    loading.value = false;
    error.value = message.message;
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

    <div v-if="error" class="m-2 border border-destructive/50 bg-destructive/10 p-2 text-destructive">
      <div class="font-medium">Не удалось загрузить синхронизацию пакетов</div>
      <div class="mt-1 break-words text-xs">{{ error }}</div>
      <button type="button" class="mt-2 border bg-background px-2 py-1 text-foreground hover:bg-accent" @click="refresh">Повторить</button>
    </div>
    <div v-else-if="!loading && visible.length === 0" class="p-4 text-center text-muted-foreground">
      {{ items.length ? 'По фильтру ничего не найдено.' : 'Изменённых объектов нет.' }}
    </div>
    <div v-else class="min-h-0 flex-1 overflow-auto">
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
            class="cursor-default border-b border-border/50 hover:bg-accent"
            :class="selected === item.objectId ? 'bg-primary/15 text-primary' : ''"
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
    <div class="shrink-0 border-t px-2 py-1 text-xs text-muted-foreground">
      {{ loading ? 'Получение данных…' : `${visible.length} из ${items.length}` }} · двойной щелчок сравнивает с временной версией оригинального клиента
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { SvnConflictHostMessage } from '../../../src/core/webviewProtocol';
import MergeCodeEditor from '@/components/MergeCodeEditor.vue';
import { Button } from '@/components/ui/button';
import { vscode } from '@/vscode';

const local = ref('');
const result = ref('');
const incoming = ref('');
const filePath = ref('');
const loading = ref(true);
const saving = ref(false);
const resolved = ref(false);
const error = ref('');

function save(resolve = false): void {
  saving.value = true;
  error.value = '';
  vscode.postMessage({ command: 'saveSvnConflict', content: result.value, resolve });
}

window.addEventListener('message', (event: MessageEvent<SvnConflictHostMessage>) => {
  const message = event.data;
  if (message.command === 'svnConflictLoaded') {
    local.value = message.conflict.local;
    result.value = message.conflict.result;
    incoming.value = message.conflict.incoming;
    filePath.value = message.conflict.filePath;
    loading.value = false;
  } else if (message.command === 'svnConflictSaving') saving.value = true;
  else if (message.command === 'svnConflictSaved') { saving.value = false; resolved.value = message.resolved; }
  else if (message.command === 'svnConflictFailed') { saving.value = false; error.value = message.message; }
});

vscode.postMessage({ command: 'svnConflictReady' });
</script>

<template>
  <div class="flex h-screen min-h-0 flex-col overflow-hidden">
    <div class="flex h-9 shrink-0 items-center gap-2 border-b bg-muted px-2 text-xs">
      <span class="min-w-0 flex-1 truncate font-mono" :title="filePath">{{ filePath || 'Загрузка конфликта…' }}</span>
      <span v-if="resolved" class="text-green-600">Конфликт разрешён</span>
      <Button variant="outline" :disabled="loading || saving" @click="save(false)">Сохранить</Button>
      <Button :disabled="loading || saving || resolved" @click="save(true)">Сохранить и отметить решённым</Button>
    </div>
    <div v-if="error" class="shrink-0 border-b border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive">{{ error }}</div>
    <div class="grid min-h-0 flex-1 grid-cols-3 divide-x">
      <section class="grid min-w-0 grid-rows-[2rem_minmax(0,1fr)]"><h2 class="border-b bg-muted/50 px-2 py-1 text-xs font-medium">Ваша версия</h2><MergeCodeEditor v-model="local" read-only aria-label="Ваша версия" /></section>
      <section class="grid min-w-0 grid-rows-[2rem_minmax(0,1fr)]"><h2 class="border-b bg-muted/50 px-2 py-1 text-xs font-medium">Результат</h2><MergeCodeEditor v-model="result" aria-label="Результат разрешения" @save="save(false)" /></section>
      <section class="grid min-w-0 grid-rows-[2rem_minmax(0,1fr)]"><h2 class="border-b bg-muted/50 px-2 py-1 text-xs font-medium">Версия из ветки</h2><MergeCodeEditor v-model="incoming" read-only aria-label="Версия из ветки" /></section>
    </div>
  </div>
</template>

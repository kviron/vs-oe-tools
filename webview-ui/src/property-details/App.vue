<script setup lang="ts">
import { ref } from 'vue';
import type { PropertyDetailsHostMessage } from '../../../src/core/webviewProtocol';
import type { PropertyDetails } from '../../../src/features/classes/models';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { vscode } from '@/vscode';

const details = ref<PropertyDetails>();
window.addEventListener('message', (event: MessageEvent<PropertyDetailsHostMessage>) => {
  if (event.data.command === 'propertyDetailsLoaded') details.value = event.data.details;
});
vscode.postMessage({ command: 'propertyDetailsReady' });

function closePanel(): void {
  window.close();
}
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col bg-background p-3 text-foreground">
    <template v-if="details">
      <header class="mb-3 flex items-center gap-2">
        <h1 class="truncate text-sm font-semibold">Свойство — {{ details.name }}</h1>
        <Badge variant="secondary">только чтение</Badge>
        <span class="ml-auto text-xs text-muted-foreground">ID {{ details.id }}</span>
      </header>
      <FieldGroup class="max-w-2xl gap-2">
        <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-40 shrink-0">Имя</FieldLabel><Input :model-value="details.name" readonly class="h-7" /></Field>
        <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-40 shrink-0">Псевдоним</FieldLabel><Input :model-value="details.aliases" readonly class="h-7" /></Field>
        <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-40 shrink-0">Область видимости</FieldLabel><Input :model-value="details.visibility" readonly class="h-7" /></Field>
        <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-40 shrink-0">Член класса для чтения</FieldLabel><Input :model-value="details.readMemberName" :title="details.readMemberId ? `ID ${details.readMemberId}` : ''" readonly class="h-7" /></Field>
        <Field orientation="horizontal" class="gap-2"><FieldLabel class="w-40 shrink-0">Член класса для записи</FieldLabel><Input :model-value="details.writeMemberName" :title="details.writeMemberId ? `ID ${details.writeMemberId}` : ''" readonly class="h-7" /></Field>
      </FieldGroup>
      <footer class="mt-auto flex justify-end gap-2 border-t pt-2">
        <Button size="sm" disabled>Сохранить</Button>
        <Button size="sm" variant="outline" disabled>Отменить</Button>
        <Button size="sm" variant="outline" @click="closePanel">Закрыть</Button>
      </footer>
    </template>
    <FieldGroup v-else class="gap-2"><Skeleton class="h-7 w-72" /><Skeleton v-for="row in 5" :key="row" class="h-7 w-full" /></FieldGroup>
  </main>
</template>

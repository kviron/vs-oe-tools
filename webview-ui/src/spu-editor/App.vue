<script setup lang="ts">
import { FloppyDiskIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref, watch } from 'vue';
import type { SpuEditorHostMessage } from '../../../src/core/webviewProtocol';
import type { CreatedSpu, SpuEditorOptions } from '../../../src/features/spu/models';
import type { SqlCompletionSchema } from '../../../src/features/sql-executor/sqlCompletionSchema';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import SqlCodeEditor from '@/components/SqlCodeEditor.vue';
import { vscode } from '@/vscode';

const options = ref<SpuEditorOptions>();
const completion = ref<SqlCompletionSchema>();
const name = ref('');
const packageId = ref('');
const typeId = ref('10200541');
const executionOrder = ref('');
const versionControl = ref(false);
const beginVersion = ref(0);
const isAfterUpdate = ref(true);
const executeAlways = ref(false);
const sqlScript = ref('');
const comment = ref('');
const saving = ref(false);
const error = ref('');
const saved = ref<CreatedSpu>();
const editingId = ref<number>();
const creationComplete = ref(false);
const initializing = ref(false);
const selectedPackage = computed(() => options.value?.packages.find(item => item.id === Number(packageId.value)));
const canSave = computed(() => !saving.value && !creationComplete.value && name.value.trim() && packageId.value && typeId.value && executionOrder.value);

watch(packageId, () => {
	if (initializing.value) return;
  if (versionControl.value) beginVersion.value = selectedPackage.value?.version ?? 0;
});
watch(versionControl, enabled => {
	if (initializing.value) return;
  if (enabled) beginVersion.value = selectedPackage.value?.version ?? 0;
  else beginVersion.value = 0;
});
window.addEventListener('message', (event: MessageEvent<SpuEditorHostMessage>) => {
  const message = event.data;
  if (message.command === 'spuEditorInitialized') {
	initializing.value = true;
    options.value = message.options;
	const existing = message.options.existing;
	editingId.value = existing?.id;
	name.value = existing?.draft.name ?? '';
    packageId.value = String(existing?.draft.packageId ?? message.options.preferredPackageId ?? '');
    typeId.value = String(existing?.draft.typeId ?? message.options.types.find(item => item.id === 10200541)?.id ?? message.options.types[0]?.id ?? '');
    executionOrder.value = existing?.draft.executionOrder ?? message.options.executionOrder;
	versionControl.value = existing?.draft.versionControl ?? false;
	beginVersion.value = existing?.draft.beginVersion ?? 0;
	isAfterUpdate.value = existing?.draft.isAfterUpdate ?? true;
	executeAlways.value = existing?.draft.executeAlways ?? false;
	sqlScript.value = existing?.draft.sqlScript ?? '';
	comment.value = existing?.draft.comment ?? '';
	initializing.value = false;
  } else if (message.command === 'sqlCompletionSchemaLoaded') {
	completion.value = message.completion;
  } else if (message.command === 'spuSaving') {
    saving.value = true;
    error.value = '';
  } else if (message.command === 'spuSaved') {
    saving.value = false;
	saved.value = message.saved;
	if (editingId.value === undefined) creationComplete.value = true;
  } else if (message.command === 'spuSaveFailed') {
    saving.value = false;
    error.value = message.message;
  }
});

function save(): void {
  if (!canSave.value) return;
  error.value = '';
  vscode.postMessage({
    command: 'saveSpu',
    draft: {
      name: name.value,
      packageId: Number(packageId.value),
      typeId: Number(typeId.value),
      executionOrder: executionOrder.value,
      versionControl: versionControl.value,
      beginVersion: Number(beginVersion.value),
      isAfterUpdate: isAfterUpdate.value,
      executeAlways: executeAlways.value,
      sqlScript: sqlScript.value,
      comment: comment.value,
    },
  });
}

vscode.postMessage({ command: 'spuEditorReady' });
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col gap-2 p-2">
    <header class="flex shrink-0 items-center gap-2 border-b pb-2">
      <div class="min-w-0 flex-1">
		<h1 class="truncate text-sm font-medium">{{ editingId ? `Редактирование SPU ${editingId}` : creationComplete && saved ? `SPU ${saved.id} создан` : 'Новый SPU' }}</h1>
        <p class="text-xs text-muted-foreground">SQL хранится в Windows-1251 · Ctrl+S для сохранения</p>
      </div>
      <Button size="sm" :disabled="!canSave" @click="save">
        <HugeiconsIcon :icon="FloppyDiskIcon" data-icon="inline-start" />
		{{ saving ? 'Сохранение…' : editingId ? 'Сохранить SPU' : 'Создать SPU' }}
      </Button>
    </header>

    <p v-if="error" class="shrink-0 text-xs text-destructive">{{ error }}</p>
	<template v-if="options">
	<p v-if="saved" class="shrink-0 text-xs text-muted-foreground">SPU {{ saved.id }} сохранён · пакетный файл {{ saved.fileId }}</p>

    <FieldGroup class="grid shrink-0 grid-cols-6 gap-2">
      <Field class="col-span-4" :data-invalid="!name.trim()">
        <FieldLabel for="spu-name">Наименование</FieldLabel>
		<Input id="spu-name" v-model="name" :disabled="creationComplete" aria-required="true" />
      </Field>
      <Field class="col-span-2" :data-invalid="!packageId">
        <FieldLabel for="spu-package">Имя пакета</FieldLabel>
		<NativeSelect id="spu-package" v-model="packageId" class="w-full" :disabled="creationComplete">
          <NativeSelectOption value="" disabled>Выберите пакет…</NativeSelectOption>
          <NativeSelectOption v-for="item in options?.packages" :key="item.id" :value="String(item.id)">{{ item.name }}</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field class="col-span-2">
        <FieldLabel for="spu-type">Тип</FieldLabel>
		<NativeSelect id="spu-type" v-model="typeId" class="w-full" :disabled="creationComplete">
          <NativeSelectOption v-for="item in options?.types" :key="item.id" :value="String(item.id)">{{ item.name }}</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field class="col-span-2">
        <FieldLabel for="spu-order">Порядок выполнения</FieldLabel>
		<Input id="spu-order" v-model="executionOrder" type="datetime-local" step="1" :disabled="creationComplete" />
      </Field>
      <Field class="col-span-2" :data-disabled="!versionControl">
        <FieldLabel for="spu-version">Начальная версия</FieldLabel>
		<Input id="spu-version" v-model="beginVersion" type="number" min="0" step="1" :disabled="!versionControl || creationComplete" />
      </Field>
      <Field orientation="horizontal" class="col-span-2 w-auto py-1">
		<Checkbox id="spu-version-control" v-model="versionControl" :disabled="creationComplete" />
        <FieldLabel for="spu-version-control">Контроль версий</FieldLabel>
      </Field>
      <Field orientation="horizontal" class="col-span-2 w-auto py-1">
		<Checkbox id="spu-after-update" v-model="isAfterUpdate" :disabled="creationComplete" />
        <FieldLabel for="spu-after-update">Применить после основного обновления</FieldLabel>
      </Field>
      <Field orientation="horizontal" class="col-span-2 w-auto py-1">
		<Checkbox id="spu-always" v-model="executeAlways" :disabled="creationComplete" />
        <FieldLabel for="spu-always">Выполнять всегда</FieldLabel>
      </Field>
    </FieldGroup>

    <Field class="min-h-40 flex-1 gap-1">
      <FieldLabel for="spu-sql">SQL-скрипт</FieldLabel>
	  <SqlCodeEditor v-model="sqlScript" class="min-h-0 flex-1 rounded-md border" :completion="completion" :read-only="creationComplete" save-shortcut @save="save" />
    </Field>

    <Field class="shrink-0 gap-1">
      <FieldLabel for="spu-comment">Комментарий</FieldLabel>
	  <Textarea id="spu-comment" v-model="comment" class="h-20 min-h-20 resize-none" :disabled="creationComplete" />
    </Field>
	</template>
  </main>
</template>

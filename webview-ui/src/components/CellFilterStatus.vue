<script setup lang="ts">
import { computed } from 'vue';
import { Cancel01Icon, FilterHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type CellFilter = { mode: 'include' | 'exclude'; columns: Array<{ index: number; values: string[] }> };
const props = defineProps<{ filter?: CellFilter; columns?: readonly string[] }>();
const emit = defineEmits<{ reset: [] }>();
const conditions = computed(() => props.filter?.columns.map(({ index, values }) => ({
  label: props.columns?.[index] || `Столбец ${index + 1}`,
  value: values.join(', '),
})) ?? []);
</script>

<template>
  <div v-if="filter" class="flex min-w-0 flex-wrap items-center gap-2">
    <template v-if="filter">
      <Badge variant="outline" class="gap-1"><HugeiconsIcon :icon="FilterHorizontalIcon" />{{ filter.mode === 'include' ? 'Равно' : 'Исключить' }}</Badge>
      <Badge v-for="condition in conditions" :key="condition.label" variant="secondary" class="max-w-64 truncate" :title="`${condition.label}: ${condition.value}`">{{ condition.label }}: {{ condition.value }}</Badge>
      <Button variant="ghost" size="sm" class="h-7" title="Сбросить фильтр по ячейкам" @click="emit('reset')"><HugeiconsIcon :icon="Cancel01Icon" data-icon="inline-start" />Сбросить</Button>
    </template>
  </div>
</template>

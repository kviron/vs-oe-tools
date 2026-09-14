<script setup lang="ts">
import { computed } from 'vue';
import ProductionTaskBadge from '@/components/ProductionTaskBadge.vue';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const props = defineProps<{
  id: string;
  label: string;
  allLabel: string;
  modelValue: string;
  options: readonly { value: string; label: string }[];
  appearance?: 'status' | 'priority';
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
// Reka reserves the empty string for clearing the selection. Keep the existing
// filter contract (empty = all) behind a non-empty, collision-free UI value.
const selectedValue = computed(() => props.modelValue ? `value:${props.modelValue}` : 'all');
const selectedLabel = computed(() => props.modelValue
  ? props.options.find(option => option.value === props.modelValue)?.label ?? props.modelValue
  : props.allLabel);
function select(value: unknown): void {
  if (typeof value === 'string') emit('update:modelValue', value === 'all' ? '' : value.slice('value:'.length));
}
</script>

<template>
  <Field class="w-auto">
    <FieldLabel :for="id" class="sr-only">{{ label }}</FieldLabel>
    <Select :model-value="selectedValue" @update:model-value="select">
      <SelectTrigger :id="id" :aria-label="label" class="min-w-24 max-w-56">
        <SelectValue><ProductionTaskBadge v-if="appearance && modelValue" :kind="appearance" :value="selectedLabel" /><template v-else>{{ selectedLabel }}</template></SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start" class="max-w-sm">
        <SelectGroup>
          <SelectItem value="all">{{ allLabel }}</SelectItem>
          <SelectItem v-for="option in options" :key="option.value" :value="`value:${option.value}`"><ProductionTaskBadge v-if="appearance" :kind="appearance" :value="option.label" /><template v-else>{{ option.label }}</template></SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
</template>

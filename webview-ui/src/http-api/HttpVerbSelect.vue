<script setup lang="ts">
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

defineProps<{ modelValue: string; verbs: readonly string[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <Select :model-value="modelValue" @update:model-value="value => emit('update:modelValue', String(value))">
    <SelectTrigger aria-label="HTTP-метод" class="w-24"><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup><SelectItem v-for="verb in verbs" :key="verb" :value="verb">{{ verb }}</SelectItem></SelectGroup></SelectContent>
  </Select>
</template>

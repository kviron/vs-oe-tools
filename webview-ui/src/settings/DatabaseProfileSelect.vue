<script setup lang="ts">
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
defineProps<{ id: string; modelValue: string; profiles: readonly { id: string; name: string }[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>
<template>
  <Select :model-value="modelValue" @update:model-value="value => emit('update:modelValue', String(value))">
    <SelectTrigger :id="id" class="w-full"><SelectValue placeholder="Выберите профиль" /></SelectTrigger>
    <SelectContent><SelectGroup><SelectItem v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }} · {{ profile.id }}</SelectItem></SelectGroup></SelectContent>
  </Select>
</template>

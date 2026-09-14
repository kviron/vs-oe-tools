<script setup lang="ts">
import { AiBrain01Icon, Database01Icon, Home01Icon, PlugSocketIcon, PlayIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useSidebar } from '@/components/ui/sidebar/utils';

defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const { setOpenMobile } = useSidebar();
const items = [
  { value: 'general', label: 'Рабочее окружение', icon: Home01Icon },
  { value: 'databases', label: 'Базы данных', icon: Database01Icon },
  { value: 'commands', label: 'Команды проекта', icon: PlayIcon },
  { value: 'ai', label: 'AI и MCP', icon: AiBrain01Icon },
  { value: 'tools', label: 'Каталог инструментов', icon: PlugSocketIcon },
];
function select(value: string): void { emit('update:modelValue', value); setOpenMobile(false); }
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem v-for="item in items" :key="item.value">
      <SidebarMenuButton :is-active="modelValue === item.value" :aria-current="modelValue === item.value ? 'page' : undefined" @click="select(item.value)"><HugeiconsIcon :icon="item.icon" /><span>{{ item.label }}</span></SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</template>

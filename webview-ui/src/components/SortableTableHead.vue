<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { TableHead } from '@/components/ui/table';

defineProps<{ active?: boolean; direction?: 'asc' | 'desc'; class?: HTMLAttributes['class'] }>();
defineEmits<{ sort: [] }>();
</script>

<template>
  <TableHead :class="$props.class">
    <button type="button" class="flex size-full items-center gap-1 text-left hover:text-foreground" @click="$emit('sort')">
      <slot />
      <span v-if="active" class="text-[10px]" aria-hidden="true">{{ direction === 'asc' ? '↑' : '↓' }}</span>
    </button>
  </TableHead>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <td
    data-slot="table-cell"
    :class="cn('select-none overflow-hidden text-ellipsis whitespace-nowrap p-2 align-middle data-[selected-cell=true]:!bg-[var(--table-cell-selection)] [&:has([role=checkbox])]:pr-0', props.class)"
  >
    <slot />
  </td>
</template>

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
    :class="cn('select-none overflow-hidden text-ellipsis whitespace-nowrap p-2 align-middle data-[selected-cell=true]:bg-[var(--vscode-list-activeSelectionBackground)] data-[selected-cell=true]:text-[var(--vscode-list-activeSelectionForeground)] data-[active-cell=true]:ring-1 data-[active-cell=true]:ring-inset data-[active-cell=true]:ring-[var(--vscode-focusBorder)] [&:has([role=checkbox])]:pr-0', props.class)"
  >
    <slot />
  </td>
</template>

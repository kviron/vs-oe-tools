<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <tr
    data-slot="table-row"
    :class="cn('hover:bg-muted/50 border-b transition-colors has-aria-expanded:bg-muted/50 data-[row-selected]:bg-[var(--vscode-list-activeSelectionBackground)] data-[row-selected]:text-[var(--vscode-list-activeSelectionForeground)] data-[row-selected]:hover:bg-[var(--vscode-list-activeSelectionBackground)] data-[state=selected]:bg-[var(--vscode-list-activeSelectionBackground)] data-[state=selected]:text-[var(--vscode-list-activeSelectionForeground)] data-[state=selected]:hover:bg-[var(--vscode-list-activeSelectionBackground)]', props.class)"
  >
    <slot />
  </tr>
</template>

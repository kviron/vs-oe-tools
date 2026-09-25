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
    :class="cn('hover:bg-muted/50 border-b transition-colors has-aria-expanded:bg-muted/50 data-[row-selected]:bg-[var(--table-row-selection)] data-[row-selected]:hover:bg-[var(--table-row-selection)] data-[state=selected]:bg-[var(--table-row-selection)] data-[state=selected]:hover:bg-[var(--table-row-selection)]', props.class)"
  >
    <slot />
  </tr>
</template>

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
    :class="cn('select-none p-2 align-middle whitespace-nowrap data-[selected-cell=true]:bg-accent data-[active-cell=true]:ring-1 data-[active-cell=true]:ring-inset data-[active-cell=true]:ring-ring [&:has([role=checkbox])]:pr-0', props.class)"
  >
    <slot />
  </td>
</template>

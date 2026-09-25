<script setup lang="ts">
import { inject, ref, type HTMLAttributes, type Ref } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
const selectedCount = inject<Ref<number>>('tableSelectedCount', ref(0))
</script>

<template>
  <tfoot
    data-slot="table-footer"
    :style="{ '--table-selection-label': selectedCount ? JSON.stringify(`Выделено: ${selectedCount}`) : 'none' }"
    :class="cn('bg-muted/50 border-t font-medium [&>tr]:last:border-b-0', props.class)"
  >
    <slot />
  </tfoot>
</template>

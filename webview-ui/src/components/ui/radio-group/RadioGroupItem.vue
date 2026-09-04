<script setup lang="ts">
import type { RadioGroupItemProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { RadioGroupIndicator, RadioGroupItem, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<RadioGroupItemProps & { class?: HTMLAttributes['class'] }>()
const forwarded = useForwardProps(reactiveOmit(props, 'class'))
</script>

<template>
  <RadioGroupItem
    data-slot="radio-group-item"
    v-bind="forwarded"
    :class="cn('border-input data-checked:border-primary data-checked:bg-primary flex size-4 shrink-0 items-center justify-center rounded-full border outline-none disabled:cursor-not-allowed disabled:opacity-100', props.class)"
  >
    <RadioGroupIndicator data-slot="radio-group-indicator" class="bg-primary-foreground size-2 rounded-full" />
  </RadioGroupItem>
</template>

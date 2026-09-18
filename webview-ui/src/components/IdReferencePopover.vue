<script setup lang="ts">
import { Copy01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

const props = withDefaults(defineProps<{
  id: number;
  label: string;
  open: boolean;
  title?: string;
  contentClass?: string;
  activateOnClick?: boolean;
}>(), {
  title: undefined,
  contentClass: 'w-80',
  activateOnClick: false,
});

const emit = defineEmits<{
  show: [];
  hide: [];
  activate: [];
  copy: [id: number];
}>();

function selectionContains(element: HTMLElement): boolean {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.containsNode(element, true));
}

function activateFromPointer(event: MouseEvent): void {
  if (props.activateOnClick && !selectionContains(event.currentTarget as HTMLElement)) emit('activate');
}

function activateFromKeyboard(): void {
  if (props.activateOnClick) emit('activate');
}
</script>

<template>
  <Popover :open="open">
    <PopoverAnchor as-child>
      <span
        class="inline cursor-text select-text text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
        tabindex="0"
        :title="title"
        @pointerenter="emit('show')"
        @pointerleave="emit('hide')"
        @focus="emit('show')"
        @blur="emit('hide')"
        @click.stop="activateFromPointer"
        @keydown.enter.prevent="activateFromKeyboard"
      >{{ label }}</span>
    </PopoverAnchor>
    <PopoverContent
      :class="contentClass"
      align="start"
      @pointerenter="emit('show')"
      @pointerleave="emit('hide')"
      @focusin="emit('show')"
      @focusout="emit('hide')"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="select-text font-mono text-muted-foreground">ID {{ id }}</span>
        <Button size="xs" variant="outline" title="Копировать ID" :aria-label="`Копировать ID ${id}`" @click="emit('copy', id)">
          <HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />
          Копировать
        </Button>
      </div>
      <slot />
    </PopoverContent>
  </Popover>
</template>

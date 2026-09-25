<script setup lang="ts">
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

const props = withDefaults(defineProps<{
  id: number;
  label: string;
  open: boolean;
  title?: string;
  contentClass?: string;
}>(), {
  title: undefined,
  contentClass: 'w-80',
});

const emit = defineEmits<{
  show: [];
  hide: [];
  activate: [];
}>();

function selectionContains(element: HTMLElement): boolean {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.containsNode(element, true));
}

function activateFromPointer(event: MouseEvent): void {
  if (!selectionContains(event.currentTarget as HTMLElement)) emit('activate');
}

function activateFromKeyboard(): void {
  emit('activate');
}
</script>

<template>
  <Popover :open="open">
    <PopoverAnchor as-child>
      <span
        class="inline cursor-text select-text text-link underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
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
      <div class="select-text font-mono text-muted-foreground">ID {{ id }}</div>
      <slot />
    </PopoverContent>
  </Popover>
</template>

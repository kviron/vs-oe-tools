<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { onBeforeUnmount, ref } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const head = ref<HTMLTableCellElement>()
let stopResize: (() => void) | undefined

function startResize(event: PointerEvent): void {
  event.preventDefault()
  event.stopPropagation()
  const currentHead = head.value
  const table = currentHead?.closest('table')
  const headerRow = currentHead?.parentElement
  if (!currentHead || !table || !headerRow) return

  const columnIndex = Array.from(headerRow.children).indexOf(currentHead)
  const headerCells = Array.from(headerRow.children).filter((cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement)
  const widths = headerCells.map(cell => cell.getBoundingClientRect().width)
  const startTableWidth = widths.reduce((sum, width) => sum + width, 0)
  const startX = event.clientX
  const startWidth = widths[columnIndex] ?? currentHead.getBoundingClientRect().width

  table.style.tableLayout = 'fixed'
  table.style.width = `${startTableWidth}px`
  table.style.minWidth = '0'
  headerCells.forEach((cell, index) => applyColumnWidth(table, index, widths[index] ?? 2))

  const move = (moveEvent: PointerEvent): void => {
    const width = Math.max(2, startWidth + moveEvent.clientX - startX)
    applyColumnWidth(table, columnIndex, width)
    table.style.width = `${startTableWidth - startWidth + width}px`
  }
  const stop = (): void => {
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerup', stop)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    stopResize = undefined
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('pointermove', move)
  document.addEventListener('pointerup', stop)
  stopResize = stop
}

function applyColumnWidth(table: HTMLTableElement, columnIndex: number, width: number): void {
  for (const row of Array.from(table.rows)) {
    const cell = row.cells[columnIndex]
    if (!cell) continue
    cell.style.width = `${width}px`
    cell.style.minWidth = `${width}px`
    cell.style.maxWidth = `${width}px`
    cell.style.overflow = 'hidden'
  }
}

onBeforeUnmount(() => stopResize?.())
</script>

<template>
  <th
    ref="head"
    data-slot="table-head"
    :class="cn('text-foreground relative h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0', props.class)"
  >
    <slot />
    <span
      role="separator"
      aria-orientation="vertical"
      class="absolute inset-y-0 right-0 w-1 cursor-col-resize touch-none hover:bg-primary"
      @pointerdown="startResize"
    />
  </th>
</template>

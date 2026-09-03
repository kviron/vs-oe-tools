<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { onBeforeUnmount, ref } from 'vue'
import { cn } from '@/lib/utils'
import { vscode } from '@/vscode'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const container = ref<HTMLElement>()
const selectedCells = new Set<HTMLTableCellElement>()
let activeCell: HTMLTableCellElement | undefined
let anchorCell: HTMLTableCellElement | undefined
let dragging = false
let additiveDrag = false

function tableRows(): HTMLTableRowElement[] {
  return Array.from(container.value?.querySelectorAll<HTMLTableRowElement>('tbody tr') ?? [])
}

function clearSelection(): void {
  for (const cell of selectedCells) {
    cell.removeAttribute('data-selected-cell')
  }
  selectedCells.clear()
  updateSelectedRows()
}

function selectCellElement(cell: HTMLTableCellElement): void {
  selectedCells.add(cell)
  cell.dataset.selectedCell = 'true'
}

function setActiveCell(cell: HTMLTableCellElement): void {
  activeCell?.removeAttribute('data-active-cell')
  activeCell = cell
  activeCell.dataset.activeCell = 'true'
}

function updateSelectedRows(): void {
  for (const row of tableRows()) {
    const selected = Array.from(row.cells).some(cell => selectedCells.has(cell))
    row.toggleAttribute('data-row-selected', selected)
    if (selected) row.setAttribute('aria-selected', 'true')
    else row.removeAttribute('aria-selected')
  }
}

function eventCell(event: Event): HTMLTableCellElement | undefined {
  const target = event.target
  if (!(target instanceof Element)) return undefined
  const cell = target.closest<HTMLTableCellElement>('td')
  const row = cell?.closest<HTMLTableRowElement>('tbody tr')
  return cell && row && container.value?.contains(row) ? cell : undefined
}

function selectRectangle(from: HTMLTableCellElement, to: HTMLTableCellElement, additive: boolean): void {
  const rows = tableRows()
  const fromRow = rows.indexOf(from.parentElement as HTMLTableRowElement)
  const toRow = rows.indexOf(to.parentElement as HTMLTableRowElement)
  if (fromRow < 0 || toRow < 0) return
  if (!additive) clearSelection()
  const firstRow = Math.min(fromRow, toRow)
  const lastRow = Math.max(fromRow, toRow)
  const firstColumn = Math.min(from.cellIndex, to.cellIndex)
  const lastColumn = Math.max(from.cellIndex, to.cellIndex)
  for (const row of rows.slice(firstRow, lastRow + 1)) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const cell = row.cells[column]
      if (cell) selectCellElement(cell)
    }
  }
  updateSelectedRows()
}

function startSelection(event: PointerEvent): void {
  if (event.button !== 0) return
  const cell = eventCell(event)
  if (!cell) return
  event.preventDefault()
  container.value?.focus({ preventScroll: true })
  setActiveCell(cell)

  if (event.shiftKey && anchorCell) {
    selectRectangle(anchorCell, cell, event.ctrlKey || event.metaKey)
  } else if (event.ctrlKey || event.metaKey) {
    if (selectedCells.has(cell)) {
      selectedCells.delete(cell)
      cell.removeAttribute('data-selected-cell')
      updateSelectedRows()
    } else {
      selectCellElement(cell)
      updateSelectedRows()
    }
    anchorCell = cell
  } else {
    clearSelection()
    selectCellElement(cell)
    updateSelectedRows()
    anchorCell = cell
  }
  dragging = true
  additiveDrag = event.ctrlKey || event.metaKey
  debugSelection('pointerdown', cell)
}

function extendSelection(event: PointerEvent): void {
  if (!dragging || !anchorCell || event.buttons !== 1) return
  const cell = eventCell(event)
  if (!cell || cell === activeCell) return
  setActiveCell(cell)
  selectRectangle(anchorCell, cell, additiveDrag)
  debugSelection('drag', cell)
}

function stopSelection(): void {
  dragging = false
}

function copySelectedCells(event: ClipboardEvent): void {
  const text = selectedText()
  if (text === undefined) {
    debug('Событие copy: нет выбранных ячеек.')
    return
  }
  if (!event.clipboardData) {
    debug(`Событие copy: clipboardData недоступен; ${textSummary(text)}.`)
    return
  }
  event.clipboardData.setData('text/plain', text)
  event.preventDefault()
  debug(`Событие copy: значение записано; ${textSummary(text)}.`)
}

function selectedText(): string | undefined {
  if (selectedCells.size === 0) return undefined
  const rows = tableRows()
    .map(row => Array.from(row.cells).filter(cell => selectedCells.has(cell)))
    .filter(cells => cells.length > 0)
  if (!rows.length) return undefined
  const rawRows = rows.map(cells => cells.map(cellText))
  return selectedCells.size === 1
    ? rawRows[0]?.[0] ?? ''
    : rawRows.map(values => values.map(csvValue).join(';')).join('\r\n')
}

async function copyWithShortcut(event: KeyboardEvent): Promise<void> {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 'c') return
  const text = selectedText()
  if (text === undefined) {
    debug('Ctrl+C: нет выбранных ячеек.')
    return
  }
  event.preventDefault()
  event.stopPropagation()
  debug(`Ctrl+C перехвачен; ${textSummary(text)}.`)
  try {
    await navigator.clipboard.writeText(text)
    debug('Clipboard API: запись выполнена успешно.')
  } catch (error) {
    debug(`Clipboard API: ошибка ${error instanceof Error ? error.message : String(error)}; запускается резервное копирование.`)
    const copied = copyThroughTemporaryInput(text)
    debug(`Резервное копирование: ${copied ? 'успешно' : 'document.execCommand вернул false'}.`)
  }
}

function copyThroughTemporaryInput(text: string): boolean {
  const input = document.createElement('textarea')
  input.value = text
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  const copied = document.execCommand('copy')
  input.remove()
  container.value?.focus({ preventScroll: true })
  return copied
}

function debugSelection(action: string, cell: HTMLTableCellElement): void {
  const row = tableRows().indexOf(cell.parentElement as HTMLTableRowElement)
  debug(`${action}: строка=${row + 1}, столбец=${cell.cellIndex + 1}, выбрано ячеек=${selectedCells.size}.`)
}

function textSummary(text: string): string {
  const preview = text.replace(/\r/g, '\\r').replace(/\n/g, '\\n').slice(0, 300)
  return `символов=${text.length}, текст="${preview}${text.length > 300 ? '…' : ''}"`
}

function debug(message: string): void {
  vscode.postMessage({ command: 'tableSelectionDebug', message })
}

function cellText(cell: HTMLTableCellElement): string {
  const copy = cell.cloneNode(true) as HTMLTableCellElement
  copy.querySelectorAll('[aria-hidden="true"], [data-copy-ignore]').forEach(element => element.remove())
  return copy.textContent?.trim() ?? ''
}

function csvValue(value: string): string {
  return /[;"\r\n\s]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

onBeforeUnmount(() => {
  clearSelection()
  activeCell?.removeAttribute('data-active-cell')
})
</script>

<template>
  <div
    ref="container"
    data-slot="table-container"
    class="relative w-full overflow-x-auto outline-none"
    tabindex="0"
    @pointerdown="startSelection"
    @pointerover="extendSelection"
    @pointerup="stopSelection"
    @pointercancel="stopSelection"
    @pointerleave="stopSelection"
    @keydown="copyWithShortcut"
    @copy="copySelectedCells"
  >
    <table data-slot="table" :class="cn('w-full caption-bottom text-xs', props.class)">
      <slot />
    </table>
  </div>
</template>

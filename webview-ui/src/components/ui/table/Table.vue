<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { cn } from '@/lib/utils'
import { vscode } from '@/vscode'

const props = defineProps<{
  class?: HTMLAttributes['class']
  containerClass?: HTMLAttributes['class']
}>()
const emit = defineEmits<{ scroll: [event: Event] }>()
const container = ref<HTMLElement>()
const selectedCells = new Set<HTMLTableCellElement>()
const selectedRows = new Set<HTMLTableRowElement>()
let activeCell: HTMLTableCellElement | undefined
let anchorCell: HTMLTableCellElement | undefined
let dragging = false
let additiveDrag = false
let dragFrame: number | undefined
let pendingDragCell: HTMLTableCellElement | undefined

function tableRows(): HTMLTableRowElement[] {
  return Array.from(container.value?.querySelectorAll<HTMLTableRowElement>('tbody tr:not([data-virtual-spacer])') ?? [])
}

function clearSelection(updateRows = true): void {
  for (const cell of selectedCells) {
    cell.removeAttribute('data-selected-cell')
  }
  selectedCells.clear()
  if (updateRows) updateSelectedRows()
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
  const nextSelectedRows = new Set<HTMLTableRowElement>()
  for (const cell of selectedCells) {
    const row = cell.parentElement
    if (row instanceof HTMLTableRowElement) nextSelectedRows.add(row)
  }
  for (const row of selectedRows) {
    if (nextSelectedRows.has(row)) continue
    row.removeAttribute('data-row-selected')
    row.removeAttribute('aria-selected')
  }
  for (const row of nextSelectedRows) {
    if (selectedRows.has(row)) continue
    row.setAttribute('data-row-selected', '')
    row.setAttribute('aria-selected', 'true')
  }
  selectedRows.clear()
  for (const row of nextSelectedRows) selectedRows.add(row)
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
  if (!additive) clearSelection(false)
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
    clearSelection(false)
    selectCellElement(cell)
    updateSelectedRows()
    anchorCell = cell
  }
  dragging = true
  additiveDrag = event.ctrlKey || event.metaKey
}

function extendSelection(event: PointerEvent): void {
  if (!dragging || !anchorCell || event.buttons !== 1) return
  const cell = eventCell(event)
  if (!cell || cell === activeCell || cell === pendingDragCell) return
  pendingDragCell = cell
  if (dragFrame !== undefined) return
  dragFrame = requestAnimationFrame(applyPendingDrag)
}

function applyPendingDrag(): void {
  dragFrame = undefined
  const cell = pendingDragCell
  pendingDragCell = undefined
  if (!dragging || !anchorCell || !cell || cell === activeCell) return
  setActiveCell(cell)
  selectRectangle(anchorCell, cell, additiveDrag)
}

function stopSelection(): void {
  if (dragFrame !== undefined) cancelAnimationFrame(dragFrame)
  dragFrame = undefined
  const cell = pendingDragCell
  pendingDragCell = undefined
  if (dragging && anchorCell && cell && cell !== activeCell) {
    setActiveCell(cell)
    selectRectangle(anchorCell, cell, additiveDrag)
  }
  dragging = false
}

function copySelectedCells(event: ClipboardEvent): void {
  const text = selectedText()
  if (text === undefined) {
    debug('Событие copy: нет выбранных ячеек.')
    return
  }
  vscode.postMessage({ command: 'copyTableCells', text })
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

function copyWithShortcut(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || (event.code !== 'KeyC' && event.key.toLocaleLowerCase() !== 'c')) return
  const text = selectedText()
  if (text === undefined) {
    debug('Ctrl+C: нет выбранных ячеек.')
    return
  }
  event.preventDefault()
  event.stopPropagation()
  debug(`Ctrl+C перехвачен; ${textSummary(text)}.`)
  vscode.postMessage({ command: 'copyTableCells', text })
  debug('Текст отправлен в extension host для записи в буфер обмена.')
}

function navigateWithKeyboard(event: KeyboardEvent): void {
  const direction = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
  if (!direction || !activeCell) return
  const rows = tableRows()
  const currentRow = rows.indexOf(activeCell.parentElement as HTMLTableRowElement)
  if (currentRow < 0) return

  let targetRow = currentRow
  let targetColumn = activeCell.cellIndex
  if (event.key === 'ArrowUp') targetRow = event.ctrlKey || event.metaKey ? 0 : currentRow - 1
  if (event.key === 'ArrowDown') targetRow = event.ctrlKey || event.metaKey ? rows.length - 1 : currentRow + 1
  if (event.key === 'ArrowLeft') targetColumn = event.ctrlKey || event.metaKey ? 0 : targetColumn - 1
  if (event.key === 'ArrowRight') {
    targetColumn = event.ctrlKey || event.metaKey
      ? (rows[currentRow]?.cells.length ?? 1) - 1
      : targetColumn + 1
  }
  targetRow = Math.max(0, Math.min(rows.length - 1, targetRow))
  const row = rows[targetRow]
  if (!row) return
  targetColumn = Math.max(0, Math.min(row.cells.length - 1, targetColumn))
  const target = row.cells[targetColumn]
  if (!target) return

  event.preventDefault()
  event.stopPropagation()
  if (event.shiftKey) {
    anchorCell ??= activeCell
    selectRectangle(anchorCell, target, false)
  } else {
    clearSelection(false)
    selectCellElement(target)
    updateSelectedRows()
    anchorCell = target
  }
  setActiveCell(target)
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function handleKeydown(event: KeyboardEvent): void {
  copyWithShortcut(event)
  navigateWithKeyboard(event)
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (!isActiveTable()) return
  handleKeydown(event)
}

function handleDocumentCopy(event: ClipboardEvent): void {
  if (!isActiveTable()) return
  debug(`copy capture: target=${elementDescription(event.target)}, activeElement=${elementDescription(document.activeElement)}, clipboardData=${Boolean(event.clipboardData)}, выбрано ячеек=${selectedCells.size}.`)
  copySelectedCells(event)
}

function isActiveTable(): boolean {
  return selectedCells.size > 0 && Boolean(container.value?.isConnected && container.value.getClientRects().length)
}

function debugKeyboardEvent(kind: 'keydown' | 'keyup', event: KeyboardEvent): void {
  debug(`${kind}: key=${JSON.stringify(event.key)}, code=${event.code}, ctrl=${event.ctrlKey}, meta=${event.metaKey}, shift=${event.shiftKey}, alt=${event.altKey}, repeat=${event.repeat}, target=${elementDescription(event.target)}, activeElement=${elementDescription(document.activeElement)}, выбрано ячеек=${selectedCells.size}.`)
}

function elementDescription(value: EventTarget | null): string {
  if (!(value instanceof Element)) return String(value)
  const id = value.id ? `#${value.id}` : ''
  const slot = value.getAttribute('data-slot') ? `[data-slot=${value.getAttribute('data-slot')}]` : ''
  return `${value.tagName.toLocaleLowerCase()}${id}${slot}`
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

onMounted(() => {
  document.addEventListener('keydown', handleDocumentKeydown, true)
  document.addEventListener('copy', handleDocumentCopy, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDocumentKeydown, true)
  document.removeEventListener('copy', handleDocumentCopy, true)
  if (dragFrame !== undefined) cancelAnimationFrame(dragFrame)
  clearSelection(false)
  activeCell?.removeAttribute('data-active-cell')
})
</script>

<template>
  <div
    ref="container"
    data-slot="table-container"
    :class="cn('relative w-full overflow-x-auto outline-none', props.containerClass)"
    tabindex="0"
    @pointerdown="startSelection"
    @pointerover="extendSelection"
    @pointerup="stopSelection"
    @pointercancel="stopSelection"
    @pointerleave="stopSelection"
    @scroll="emit('scroll', $event)"
  >
    <table data-slot="table" :class="cn('w-full caption-bottom text-xs', props.class)">
      <slot />
    </table>
  </div>
</template>

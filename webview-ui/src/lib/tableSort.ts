export type SortDirection = 'asc' | 'desc';

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

export function nextSort(currentKey: string | undefined, currentDirection: SortDirection, key: string): SortDirection {
  return currentKey === key && currentDirection === 'asc' ? 'desc' : 'asc';
}

export function sortedRows<T>(rows: T[], key: string | undefined, direction: SortDirection, read: (row: T, key: string) => unknown): T[] {
  if (!key) return rows.slice();
  const multiplier = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: read(row, key) }))
    .sort((left, right) => compareValues(left.value, right.value) * multiplier || left.index - right.index)
    .map(({ row }) => row);
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined || left === '') return 1;
  if (right === null || right === undefined || right === '') return -1;
  const leftNumber = typeof left === 'number' ? left : Number(left);
  const rightNumber = typeof right === 'number' ? right : Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return collator.compare(String(left), String(right));
}

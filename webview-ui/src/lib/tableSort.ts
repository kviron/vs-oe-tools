export type SortDirection = 'asc' | 'desc';

export function nextSort(currentKey: string | undefined, currentDirection: SortDirection, key: string): SortDirection {
  return currentKey === key && currentDirection === 'asc' ? 'desc' : 'asc';
}

export function sortedRows<T>(rows: T[], key: string | undefined, direction: SortDirection, read: (row: T, key: string) => unknown): T[] {
  if (!key) return rows.slice();
  const multiplier = direction === 'asc' ? 1 : -1;
  return rows.slice().sort((left, right) => compareValues(read(left, key), read(right, key)) * multiplier);
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined || left === '') return 1;
  if (right === null || right === undefined || right === '') return -1;
  const leftNumber = typeof left === 'number' ? left : Number(left);
  const rightNumber = typeof right === 'number' ? right : Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left).localeCompare(String(right), 'ru', { numeric: true, sensitivity: 'base' });
}

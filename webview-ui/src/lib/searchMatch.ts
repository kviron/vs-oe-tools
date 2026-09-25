export type SearchMode = 'contains' | 'starts' | 'ends' | 'exact' | 'word';
export interface SearchOptions { mode: SearchMode; caseSensitive: boolean }
export const defaultSearchOptions: SearchOptions = { mode: 'contains', caseSensitive: false };

export function matchesSearch(value: unknown, query: string, options: SearchOptions): boolean {
  const needle = query.trim();
  if (!needle) return true;
  const source = String(value ?? '');
  const haystack = options.caseSensitive ? source : source.toLocaleLowerCase('ru');
  const target = options.caseSensitive ? needle : needle.toLocaleLowerCase('ru');
  switch (options.mode) {
    case 'starts': return haystack.startsWith(target);
    case 'ends': return haystack.endsWith(target);
    case 'exact': return haystack === target;
    case 'word': {
      const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'u').test(haystack);
    }
    default: return haystack.includes(target);
  }
}

export function matchesAnySearch(values: readonly unknown[], query: string, options: SearchOptions): boolean {
  return !query.trim() || values.some(value => matchesSearch(value, query, options));
}

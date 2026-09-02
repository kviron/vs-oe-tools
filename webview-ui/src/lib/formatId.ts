export function formatId(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (!/^-?\d+$/.test(text)) return text;

  const sign = text.startsWith('-') ? '-' : '';
  const digits = sign ? text.slice(1) : text;
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatTableValue(column: string, value: unknown): string {
  if (value === null) return 'NULL';
  return /id$/i.test(column.trim()) ? formatId(value) : String(value);
}

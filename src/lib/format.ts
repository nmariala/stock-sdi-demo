const numberFormatter = new Intl.NumberFormat('id-ID');

export function formatQuantity(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return numberFormatter.format(n);
}
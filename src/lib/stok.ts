import { getBarangList, getStock } from '@/lib/api';
import type { Barang, StockRow } from '@/types';

// Batas halaman maksimum yang diizinkan server (api/utils/validation.js).
const MAX_PAGE_SIZE = 500;

export async function fetchStockRows(): Promise<StockRow[]> {
  const res = await getStock({});
  return (Array.isArray(res.data) ? res.data : []).filter(
    (r): r is StockRow => r != null
  );
}

export async function fetchBarangList(): Promise<Barang[]> {
  const res = await getBarangList({ sort: 'nama', order: 'asc', pageSize: MAX_PAGE_SIZE });
  return Array.isArray(res.data) ? res.data : [];
}
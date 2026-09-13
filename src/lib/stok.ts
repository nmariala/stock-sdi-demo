import { supabase } from '@/lib/supabase';
import type { Barang, StockLevel, StockRow } from '@/types';
import { GUDANG, KRITERIA } from '@/lib/konstanta';

const emptyLevels = (): Record<string, Record<string, number>> => {
  const obj: Record<string, Record<string, number>> = {};
  GUDANG.forEach((g) => {
    obj[g] = {};
    KRITERIA.forEach((k) => {
      obj[g][k] = 0;
    });
  });
  return obj;
};

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function fetchStockRows(): Promise<StockRow[]> {
  const [resBarang, resLevels] = await Promise.all([
    supabase.from('barang').select('*').order('nama'),
    supabase.from('stock_levels').select('*'),
  ]);

  if (resBarang.error) throw resBarang.error;
  const barang: Barang[] = Array.isArray(resBarang.data) ? resBarang.data : [];
  const levelsOk = !resLevels.error && Array.isArray(resLevels.data);
  const levels: StockLevel[] = levelsOk ? resLevels.data : [];

  return barang
    .filter((b): b is Barang => b != null)
    .map((b) => {
      const levelsByGudang = emptyLevels();
      let total = 0;
      if (levelsOk) {
        levels
          .filter((l) => l && l.item_id === b.id)
          .forEach((l) => {
            const n = num(l.jumlah);
            if (levelsByGudang[l.warehouse]?.[l.kriteria] !== undefined) {
              levelsByGudang[l.warehouse][l.kriteria] += n;
              total += n;
            }
          });
      } else {
        levelsByGudang.Puri.Good = num(b.stok);
        total = levelsByGudang.Puri.Good;
      }
      return {
        ...b,
        nama: b.nama != null ? String(b.nama) : '(tanpa nama)',
        levels: levelsByGudang,
        total,
      };
    });
}

export async function fetchBarangList(): Promise<Barang[]> {
  const { data, error } = await supabase.from('barang').select('*').order('nama');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

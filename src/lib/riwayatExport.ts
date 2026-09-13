export const TRANS_SELECT =
  'id, barang_id, user_id, jenis, jumlah, created_at, warehouse, kriteria, keterangan';

export const EXPORT_BATCH = 1000;
export const EXPORT_MAX_ROWS = 20000;
export const EXPORT_TOO_MANY_MESSAGE =
  'Data terlalu banyak untuk diekspor sekaligus. Silakan gunakan filter tanggal.';

export interface RiwayatFilters {
  gudang: string;
  kriteria: string;
  jenis: string;
  barangId: number | string;
  fromDate: Date | null;
  toDate: Date | null;
}

type Filterable = {
  eq: (column: string, value: unknown) => unknown;
  gte: (column: string, value: unknown) => unknown;
  lt: (column: string, value: unknown) => unknown;
};

export function applyRiwayatFilters<B>(q: B, f: RiwayatFilters): B {
  const base = q as Filterable;
  let out = q;
  if (f.gudang !== 'all') out = base.eq('warehouse', f.gudang) as B;
  if (f.kriteria !== 'all') out = base.eq('kriteria', f.kriteria) as B;
  if (f.jenis !== 'all') out = base.eq('jenis', f.jenis) as B;
  if (f.barangId !== 'all' && f.barangId != null) out = base.eq('barang_id', Number(f.barangId)) as B;
  if (f.fromDate) out = base.gte('created_at', dayStartISO(f.fromDate)) as B;
  if (f.toDate) out = base.lt('created_at', nextDayStartISO(f.toDate)) as B;
  return out;
}

export interface RiwayatItemInput {
  id: number;
  barang_id: number;
  user_id: string | null;
  jenis: 'masuk' | 'keluar' | string;
  jumlah: number;
  created_at: string;
  warehouse: string | null;
  kriteria: string | null;
  keterangan: string | null;
}

export interface RiwayatItemOutput extends RiwayatItemInput {
  nama: string;
  userName: string | null;
  sebelum: number;
  sesudah: number;
}

interface ExportDeps {
  barangById: Record<number, { nama: string }>;
  profileById: Record<string, { nama: string }>;
  getBase: (bid: number, created_at: string, id: number) => Promise<number>;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dateFromYMD(s: string): Date | null {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function dayStartISO(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
}

export function nextDayStartISO(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).toISOString();
}

export const slugify = (s: string) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'barang';

export function buildExportFileName(opts: {
  fromDate: Date | null;
  toDate: Date | null;
  barangNama?: string;
}): string {
  const { fromDate, toDate, barangNama } = opts;
  let prefix = 'riwayat-transaksi';
  if (fromDate) prefix += '-' + toDateStr(fromDate);
  if (toDate) prefix += '-sampai-' + toDateStr(toDate);
  if (barangNama) prefix += '-' + slugify(barangNama);
  return `${prefix}.xlsx`;
}

export async function attachStockBalances<T extends RiwayatItemInput>(
  tArr: T[],
  deps: ExportDeps
): Promise<Array<T & RiwayatItemOutput>> {
  if (!Array.isArray(tArr) || tArr.length === 0) return [];
  const byBarang: Record<number, T[]> = {};
  tArr.forEach((tr) => {
    const bid = tr.barang_id;
    (byBarang[bid] = byBarang[bid] || []).push(tr);
  });

  const result: Record<number, T & RiwayatItemOutput> = {};
  await Promise.all(
    Object.keys(byBarang).map(async (bidKey) => {
      const bid = Number(bidKey);
      const list = byBarang[bid].slice().sort((a, b) => {
        if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
        return Number(a.id) - Number(b.id);
      });
      const earliest = list[0];
      let running = await deps.getBase(Number(bid), earliest.created_at, Number(earliest.id));
      list.forEach((tr) => {
        const qty = Number(tr.jumlah) || 0;
        const delta = tr.jenis === 'masuk' ? qty : -qty;
        const sebelum = running;
        const sesudah = running + delta;
        const b = deps.barangById ? deps.barangById[tr.barang_id] : null;
        const p = tr.user_id && deps.profileById ? deps.profileById[tr.user_id] : null;
        result[tr.id] = {
          ...tr,
          nama: b ? b.nama : '(barang tidak ditemukan)',
          userName: p ? p.nama : null,
          sebelum,
          sesudah,
        };
        running = sesudah;
      });
    })
  );

  return tArr.map((tr) => result[tr.id]).filter(Boolean);
}
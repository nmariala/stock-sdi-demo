'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/auth';
import { GUDANG, KRITERIA } from '@/lib/konstanta';
import { formatQuantity } from '@/lib/format';
import {
  TRANS_SELECT,
  EXPORT_BATCH,
  EXPORT_MAX_ROWS,
  EXPORT_TOO_MANY_MESSAGE,
  formatDateTime,
  toDateStr,
  dateFromYMD,
  buildExportFileName,
  attachStockBalances,
  applyRiwayatFilters,
} from '@/lib/riwayatExport';
import type { RiwayatItemInput } from '@/lib/riwayatExport';
import type { Barang } from '@/types';

interface RiwayatRow {
  id: number;
  barang_id: number;
  jenis: 'masuk' | 'keluar';
  jumlah: number;
  warehouse: string;
  kriteria: string;
  keterangan: string | null;
  created_at: string;
  user_id: string | null;
  diupdate_oleh: string;
  nama: string;
}

const PAGE_SIZE = 50;

type JenisFilter = 'all' | 'masuk' | 'keluar';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function RiwayatPage() {
  const [rows, setRows] = useState<RiwayatRow[]>([]);
  const [barangList, setBarangList] = useState<Barang[]>([]);
  const [profileById, setProfileById] = useState<Record<string, string>>({});
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gudangFilter, setGudangFilter] = useState('all');
  const [kriteriaFilter, setKriteriaFilter] = useState('all');
  const [jenisFilter, setJenisFilter] = useState<JenisFilter>('all');
  const [barangFilter, setBarangFilter] = useState('all');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const barangById = useMemo(() => {
    const m: Record<number, string> = {};
    barangList.forEach((b) => { m[b.id] = b.nama; });
    return m;
  }, [barangList]);

  const barangObjById = useMemo(() => {
    const m: Record<number, { nama: string }> = {};
    barangList.forEach((b) => { m[b.id] = { nama: b.nama }; });
    return m;
  }, [barangList]);

  const profileObjById = useMemo(() => {
    const m: Record<string, { nama: string }> = {};
    Object.entries(profileById).forEach(([id, nama]) => { m[id] = { nama }; });
    return m;
  }, [profileById]);

  const loadBarang = useCallback(async () => {
    const { data, error } = await supabase.from('barang').select('id, nama').order('nama');
    if (!error && Array.isArray(data)) {
      setBarangList(data.map((b) => ({ id: Number(b.id), nama: String(b.nama), stok: 0 })));
    }
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('id, nama');
      if (!error && Array.isArray(data)) {
        const map: Record<string, string> = {};
        data.forEach((p) => {
          if (p && typeof p.id === 'string' && p.nama != null) map[p.id] = String(p.nama);
        });
        setProfileById(map);
      }
    } finally {
      setProfilesLoaded(true);
    }
  }, []);

  const buildBaseQuery = useCallback(() => {
    const q = supabase
      .from('transaksi')
      .select(TRANS_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    return applyRiwayatFilters(q, {
      gudang: gudangFilter,
      kriteria: kriteriaFilter,
      jenis: jenisFilter,
      barangId: barangFilter,
      fromDate,
      toDate,
    });
  }, [gudangFilter, kriteriaFilter, jenisFilter, barangFilter, fromDate, toDate]);

  const buildCountQuery = useCallback(() => {
    const q = supabase.from('transaksi').select('id', { count: 'exact', head: true });
    return applyRiwayatFilters(q, {
      gudang: gudangFilter,
      kriteria: kriteriaFilter,
      jenis: jenisFilter,
      barangId: barangFilter,
      fromDate,
      toDate,
    });
  }, [gudangFilter, kriteriaFilter, jenisFilter, barangFilter, fromDate, toDate]);

  const buildQuery = useCallback(
    (p: number) => {
      return buildBaseQuery().range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE - 1);
    },
    [buildBaseQuery]
  );

  const loadFirstPage = useCallback(async ({ showError = true } = {}) => {
    setLoading(true);
    try {
      const { data, error } = await buildQuery(0);
      if (error) throw error;
      const list: RiwayatRow[] = (Array.isArray(data) ? data : []).filter(Boolean).map((r) => ({
        ...r,
        user_id: r.user_id != null ? String(r.user_id) : null,
        diupdate_oleh: r.user_id != null ? (profileById[r.user_id] ?? '-') : '-',
        nama: barangById[r.barang_id] ?? '(barang tidak ditemukan)',
      }));
      setRows(list);
      setPage(0);
      setHasMore(list.length === PAGE_SIZE);
      setError('');
    } catch {
      if (showError) setError('Gagal memuat riwayat transaksi');
    } finally {
      setLoading(false);
    }
  }, [buildQuery, barangById, profileById]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { data, error } = await buildQuery(page + 1);
      if (error) throw error;
      const list: RiwayatRow[] = (Array.isArray(data) ? data : []).filter(Boolean).map((r) => ({
        ...r,
        user_id: r.user_id != null ? String(r.user_id) : null,
        diupdate_oleh: r.user_id != null ? (profileById[r.user_id] ?? '-') : '-',
        nama: barangById[r.barang_id] ?? '(barang tidak ditemukan)',
      }));
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const merged = [...prev];
        list.forEach((r) => {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            merged.push(r);
          }
        });
        return merged;
      });
      setPage(page + 1);
      setHasMore(list.length === PAGE_SIZE);
    } catch {
      setError('Gagal memuat lebih banyak data');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, buildQuery, barangById, profileById]);

  useEffect(() => {
    loadBarang();
    loadProfiles();
  }, [loadBarang, loadProfiles]);

  useEffect(() => {
    if (barangList.length > 0 && profilesLoaded) {
      loadFirstPage();
    }
  }, [barangList, profilesLoaded, loadFirstPage]);

  useEffect(() => {
    const channel = supabase
      .channel('riwayat-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transaksi' }, () => {
        loadFirstPage({ showError: false });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadFirstPage]);

  const getBase = useCallback(async (bid: number, created_at: string, id: number) => {
    const { data, error } = await supabase.rpc('riwayat_balance_before', {
      p_barang_id: bid,
      p_created_at: created_at,
      p_id: id,
    });
    if (error) {
      throw new Error('Fungsi riwayat_balance_before belum dibuat di Supabase. Jalankan SQL di file migrasi_riwayat_skala.sql.');
    }
    return Number(data) || 0;
  }, []);

  const doExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setExportMsg('');
    try {
      const XLSX = await import('xlsx');

      const { count } = await buildCountQuery();
      if (typeof count === 'number' && count > EXPORT_MAX_ROWS) {
        throw new Error(EXPORT_TOO_MANY_MESSAGE);
      }

      const all: RiwayatItemInput[] = [];
      let from = 0;
      for (;;) {
        const { data, error } = await buildBaseQuery().range(from, from + EXPORT_BATCH - 1);
        if (error) throw error;
        const chunk = Array.isArray(data) ? data : [];
        all.push(...(chunk as RiwayatItemInput[]));
        if (chunk.length < EXPORT_BATCH) break;
        if (all.length > EXPORT_MAX_ROWS) throw new Error(EXPORT_TOO_MANY_MESSAGE);
        from += EXPORT_BATCH;
      }

      const items = await attachStockBalances(all, {
        getBase,
        barangById: barangObjById,
        profileById: profileObjById,
      });

      if (!items.length) {
        setExportMsg('Tidak ada transaksi yang sesuai dengan filter.');
        return;
      }

      const header = ['Tanggal', 'User', 'Barang', 'Jenis', 'Jumlah', 'Stok Sebelum', 'Stok Sesudah', 'Warehouse', 'Kriteria', 'Keterangan'];
      const aoa = [
        header,
        ...items.map((r) => [
          formatDateTime(r.created_at),
          r.userName || 'Data lama',
          r.nama,
          r.jenis === 'masuk' ? 'Masuk' : 'Keluar',
          Number(r.jumlah) || 0,
          r.sebelum,
          r.sesudah,
          r.warehouse || '',
          r.kriteria || '',
          r.keterangan || '',
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, 'Riwayat');
      const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx', compression: true });

      const barangSelected = barangFilter !== 'all' ? barangObjById[Number(barangFilter)] : null;
      const fileName = buildExportFileName({
        fromDate,
        toDate,
        barangNama: barangSelected ? barangSelected.nama : undefined,
      });

      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === EXPORT_TOO_MANY_MESSAGE) {
        setExportMsg(`Export dibatalkan. ${msg}`);
      } else {
        setExportMsg(`Export Excel gagal. Silakan coba lagi.${msg ? ` ${msg}` : ''}`);
      }
    } finally {
      setExporting(false);
    }
  }, [exporting, buildCountQuery, buildBaseQuery, getBase, barangObjById, profileObjById, fromDate, toDate, barangFilter]);

  const hasActiveFilter =
    gudangFilter !== 'all' ||
    kriteriaFilter !== 'all' ||
    jenisFilter !== 'all' ||
    barangFilter !== 'all' ||
    fromDate != null ||
    toDate != null;

  const resetFilters = () => {
    setGudangFilter('all');
    setKriteriaFilter('all');
    setJenisFilter('all');
    setBarangFilter('all');
    setFromDate(null);
    setToDate(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Riwayat Transaksi</h1>
        <p className="mt-0.5 text-sm text-slate-500">Terbaru di atas</p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {/* Filters */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Gudang</label>
            <select
              value={gudangFilter}
              onChange={(e) => setGudangFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100"
            >
              <option value="all">Semua Gudang</option>
              {GUDANG.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Kriteria</label>
            <select
              value={kriteriaFilter}
              onChange={(e) => setKriteriaFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100"
            >
              <option value="all">Semua Kriteria</option>
              {KRITERIA.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Jenis</label>
            <select
              value={jenisFilter}
              onChange={(e) => setJenisFilter(e.target.value as JenisFilter)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100"
            >
              <option value="all">Semua Jenis</option>
              <option value="masuk">Masuk</option>
              <option value="keluar">Keluar</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Barang</label>
            <select
              value={barangFilter}
              onChange={(e) => setBarangFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100"
            >
              <option value="all">Semua Barang</option>
              {barangList.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Dari Tanggal</label>
            <input
              type="date"
              value={fromDate ? toDateStr(fromDate) : ''}
              onChange={(e) => setFromDate(e.target.value ? dateFromYMD(e.target.value) : null)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Sampai Tanggal</label>
            <input
              type="date"
              value={toDate ? toDateStr(toDate) : ''}
              onChange={(e) => setToDate(e.target.value ? dateFromYMD(e.target.value) : null)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {hasActiveFilter && (
            <button
              onClick={resetFilters}
              className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
            >
              Reset Filter
            </button>
          )}
          <button
            onClick={doExport}
            disabled={exporting}
            className="rounded-lg border border-green-700 bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {exporting ? 'Mengekspor...' : 'Export Excel'}
          </button>
          {exportMsg && <span className="text-xs text-slate-500">{exportMsg}</span>}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-[15px] font-bold text-slate-700">
                  <th className="px-4 py-3">No.</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Barang</th>
                  <th className="px-4 py-3">Jenis</th>
                  <th className="px-4 py-3 text-right">Jumlah</th>
                  <th className="px-4 py-3">Gudang</th>
                  <th className="px-4 py-3">Kriteria</th>
                  <th className="px-4 py-3">Keterangan</th>
                  <th className="px-4 py-3">Diupdate Oleh</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      Belum ada riwayat transaksi
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => {
                    const masuk = r.jenis === 'masuk';
                    return (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(r.created_at)}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{r.nama}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${masuk ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {masuk ? 'Masuk' : 'Keluar'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${masuk ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {masuk ? '+' : '-'}{formatQuantity(r.jumlah)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{r.warehouse}</td>
                        <td className="px-4 py-3 text-slate-700">{r.kriteria}</td>
                        <td className="px-4 py-3 text-slate-500">{r.keterangan || '-'}</td>
                        <td className="px-4 py-3 text-slate-600">{r.diupdate_oleh}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-3">
              {hasMore ? (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingMore ? 'Memuat...' : 'Muat lebih banyak'}
                </button>
              ) : (
                <p className="text-center text-xs text-slate-400">— Selesai —</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
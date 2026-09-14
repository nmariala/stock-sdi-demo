'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { fetchStockRows } from '@/lib/stok';
import { GUDANG, KRITERIA } from '@/lib/konstanta';
import { formatQuantity } from '@/lib/format';
import type { StockRow } from '@/types';

type GudangFilter = 'all' | (typeof GUDANG)[number];
type KriteriaFilter = 'all' | (typeof KRITERIA)[number];

function formatTime(date: Date): string {
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function StokPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [gudangFilter, setGudangFilter] = useState<GudangFilter>('all');
  const [kriteriaFilter, setKriteriaFilter] = useState<KriteriaFilter>('all');

  const load = useCallback(async () => {
    try {
      const data = await fetchStockRows();
      setRows(data);
      setLastSynced(new Date());
      setError('');
    } catch {
      setError('Gagal memuat data stok');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Supabase realtime tidak dipakai lagi. Polling ringan (60 dtk) menjaga
    // data stok tetap segar tanpa websocket (hemat resource).
    const poll = window.setInterval(load, 60_000);
    return () => window.clearInterval(poll);
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const nameMatch = search ? r.nama.toLowerCase().includes(search.toLowerCase()) : true;
      if (!nameMatch) return false;

      if (gudangFilter !== 'all' && kriteriaFilter !== 'all') {
        return (r.levels[gudangFilter]?.[kriteriaFilter] ?? 0) > 0 || search !== '';
      }
      return true;
    });
  }, [rows, search, gudangFilter, kriteriaFilter]);

  const hasActiveFilter = gudangFilter !== 'all' || kriteriaFilter !== 'all' || search !== '';

  const clearFilters = () => {
    setSearch('');
    setGudangFilter('all');
    setKriteriaFilter('all');
  };

  const chip = (active: boolean, onClick: () => void, label: string, tone?: 'green' | 'red') => {
    const activeTone =
      tone === 'green'
        ? 'bg-emerald-600 text-white border-emerald-600'
        : tone === 'red'
          ? 'bg-rose-600 text-white border-rose-600'
          : 'bg-slate-900 text-white border-slate-900';
    return (
      <button
        key={`${label}-${active}`}
        onClick={onClick}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          active ? activeTone : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        {label}
      </button>
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stok SDI Sidoarjo.</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Stok barang terkini berdasarkan gudang dan kondisi.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastSynced && (
            <span className="text-xs text-slate-400">Data diupdate pada : {formatTime(lastSynced)}</span>
          )}
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-xs">
          <svg
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari barang..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100"
          />
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-x-7 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Gudang</span>
            <div className="flex flex-wrap gap-1.5">
              {chip(gudangFilter === 'all', () => setGudangFilter('all'), 'Semua')}
              {GUDANG.map((g) => chip(gudangFilter === g, () => setGudangFilter(g), g))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Kondisi</span>
            <div className="flex flex-wrap gap-1.5">
              {chip(kriteriaFilter === 'all', () => setKriteriaFilter('all'), 'Semua')}
              {KRITERIA.map((k) =>
                chip(kriteriaFilter === k, () => setKriteriaFilter(k), k, k === 'Good' ? 'green' : 'red')
              )}
            </div>
          </div>

          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
            >
              Reset filter
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm sm:max-h-[calc(100dvh-17rem)]">
        <table className="stock-table vborders">
          <thead>
            <tr className="text-[15px] text-slate-700">
              <th className="w-10 px-2 text-center font-bold text-slate-700 uppercase whitespace-nowrap">No.</th>
              <th className="px-4 text-left font-bold text-slate-700 uppercase">Nama Barang</th>
              <th className="px-3 text-right font-bold text-slate-800 uppercase">Total</th>
              {GUDANG.map((g) => (
                <th key={g} colSpan={2} className="px-3 text-center font-bold text-slate-800 uppercase">
                  {g}
                </th>
              ))}
            </tr>
            <tr className="text-xs text-slate-500">
              <th className="w-10 px-2 text-center" />
              <th className="px-4 text-left" />
              <th className="px-3 text-right" />
              {GUDANG.map((g) => (
                <React.Fragment key={g}>
                  <th className="px-3 text-right font-bold text-emerald-600">Good</th>
                  <th className="px-3 text-right font-bold text-rose-500">Bad</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={GUDANG.length * 2 + 3}
                  className="px-4 py-10 text-center text-sm text-slate-400"
                >
                  {hasActiveFilter ? 'Tidak ada barang yang cocok' : 'Tidak ada data stok'}
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={r.id} className="text-sm">
                  <td className="w-10 px-2 py-2.5 text-center text-slate-400 whitespace-nowrap">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">{r.nama}</td>
                  <td className="num px-3 py-2.5 text-right font-semibold text-slate-900">
                    {formatQuantity(r.total)}
                  </td>
                  {GUDANG.map((g) => (
                    <React.Fragment key={g}>
                      <td className="num px-3 py-2.5 text-right text-slate-700">{formatQuantity(r.levels[g]?.Good)}</td>
                      <td className="num px-3 py-2.5 text-right text-slate-700">{formatQuantity(r.levels[g]?.Bad)}</td>
                    </React.Fragment>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">{formatQuantity(filtered.length)} barang</p>
    </div>
  );
}
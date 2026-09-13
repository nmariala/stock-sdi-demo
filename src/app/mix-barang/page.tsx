'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PACKING_CAPACITY } from '@/lib/packingCapacity';

const MIX_ITEMS = (
  [
    ['SB100', 'SB100'],
    ['SB110', 'SB110'],
    ['XL', 'XL'],
    ['Pancake Box', 'Pancake Box'],
    ['Roll Besar', 'Roll Besar'],
    ['Roll Lite', 'Roll Lite'],
    ['Non Cream', 'Non Cream'],
    ['Foil', 'Foil'],
    ['Ice Cream', 'Ice Cream'],
    ['Daging Durian', 'Daging Durian'],
    ['Durpas GB', 'Durpas GB'],
    ['Durpas BB', 'Durpas BB'],
    ['Monpal', 'Monpal'],
    ['Mille Crepes Lite', 'Mille Crepes Lite'],
    ['Mille Crepes', 'Mille Crepes'],
    ['Monpal 300gr', 'Monpal 300gr'],
    ['Monpal Vacuum', 'Monpal Vacuum'],
    ['Es Puter', 'Es Puter'],
    ['Monpal GB', 'Monpal GB'],
    ['Susu Durian', 'Susu Durian'],
  ] as [string, string][]
).map(([key, label]) => {
  const cap = PACKING_CAPACITY[key] || { max: 0, buffer: 0 };
  return { key, label, max: Number(cap.max) || 0, buffer: Number(cap.buffer) || 0 };
});

const num = (s: string): number => {
  const n = parseFloat(String(s).replace(/,/, '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const pctOf = (q: number, buffer: number): number =>
  q > 0 && buffer > 0 ? (q / buffer) * 100 : 0;

const fmt1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return String(r);
};

export default function MixBarangPage() {
  const [qty, setQty] = useState<Record<string, string>>({});

  const setQ = (key: string, value: string) =>
    setQty((prev) => ({ ...prev, [key]: value }));

  const result = useMemo(() => {
    const perPct: Record<string, number> = {};
    let totalPct = 0;
    MIX_ITEMS.forEach((it) => {
      const q = num(qty[it.key] ?? '');
      const p = pctOf(q, it.buffer);
      perPct[it.key] = p;
      totalPct += p;
    });
    const foamNeeded = totalPct > 0 ? Math.ceil(totalPct / 105) : 0;
    const totalQty = MIX_ITEMS.reduce((s, it) => s + num(qty[it.key] ?? ''), 0);
    const totalJenis = MIX_ITEMS.filter((it) => num(qty[it.key] ?? '') > 0).length;

    let statusColor = 'border-emerald-200 bg-emerald-50 text-emerald-700';
    let statusDot = 'bg-emerald-500';
    let statusTitle = 'Siap / Standby';
    let statusSub = 'Membutuhkan 0 Unit Foam';
    if (totalPct > 0 && totalPct <= 105) {
      statusColor = 'border-emerald-200 bg-emerald-50 text-emerald-700';
      statusDot = 'bg-emerald-500';
      statusTitle = 'Sangat Aman';
      statusSub = `Membutuhkan 1 Unit Foam (Total ${fmt1(totalPct)}%)`;
    } else if (totalPct > 105) {
      statusColor = 'border-rose-200 bg-rose-50 text-rose-700';
      statusDot = 'bg-rose-500';
      statusTitle = `Over Space ${fmt1(totalPct - 100)}%`;
      statusSub = `Membutuhkan ${foamNeeded} Unit Foam (Total ${fmt1(totalPct)}%)`;
    }

    return { perPct, totalPct, foamNeeded, totalQty, totalJenis, statusColor, statusDot, statusTitle, statusSub };
  }, [qty]);

  const qtyClass =
    'w-20 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100';

  return (
    <div className="space-y-5">
      <Link
        href="/kalkulator-list-pengiriman"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Kalkulator List Pengiriman
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hitung Kapasitas Mix Barang</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Atur jumlah setiap barang untuk menghitung kapasitas mix. Dihitung lokal di browser.
        </p>
      </div>

      <div className="max-w-3xl space-y-4">
        <div className="sticky top-14 z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:top-0">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2">
            <h2 className="text-[11px] font-bold tracking-wide text-slate-600 uppercase">
              Hasil Perhitungan
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${result.statusColor}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${result.statusDot}`} />
              {result.statusTitle}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 px-4 py-2.5 sm:flex sm:items-center sm:gap-8">
            <div>
              <p className="text-[11px] font-medium text-slate-500">Total Kapasitas</p>
              <p className="text-xl font-extrabold text-slate-900 tabular-nums">{fmt1(result.totalPct)}%</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Total Jumlah</p>
              <p className="text-base font-bold text-slate-900 tabular-nums">{result.totalQty}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Jenis Barang</p>
              <p className="text-base font-bold text-slate-900 tabular-nums">{result.totalJenis}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Kebutuhan Foam</p>
              <p className="text-base font-bold text-slate-900 tabular-nums">{result.foamNeeded} Unit</p>
            </div>
            <p className={`hidden text-xs font-semibold sm:block sm:ml-auto ${result.statusColor}`}>
              {result.statusSub}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <h2 className="text-sm font-bold text-slate-900">Daftar Barang</h2>
            <button
              onClick={() => setQty({})}
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              Reset
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="stock-table">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="px-4 text-left font-semibold">Barang</th>
                  <th className="px-3 text-center font-semibold">Jumlah</th>
                  <th className="px-3 text-right font-semibold">Kapasitas</th>
                </tr>
              </thead>
              <tbody>
                {MIX_ITEMS.map((it) => {
                  const q = num(qty[it.key] ?? '');
                  const p = pctOf(q, it.buffer);
                  return (
                    <tr key={it.key} className="text-sm">
                      <td className="px-4 py-1.5 font-medium text-slate-800 whitespace-nowrap">
                        {it.label}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={qty[it.key] ?? ''}
                          onChange={(e) => setQ(it.key, e.target.value)}
                          placeholder="0"
                          className={qtyClass}
                        />
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right font-semibold tabular-nums ${
                          p > 100 ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        {fmt1(p)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
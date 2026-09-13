'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { parseShipping, computeCustomer, fmtQty } from '@/lib/packingCalculator';
import type { CustomerResult } from '@/lib/packingCalculator';

const pct2 = (v: number): string => {
  const x = Number(v) * 100;
  if (!Number.isFinite(x)) return '0';
  const r = Math.round(x * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
};

export default function KalkulatorListPengirimanPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ customers: CustomerResult[] } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const calculate = () => {
    setParseError(null);
    if (!text.trim()) {
      setParseError('Masukkan data pengiriman terlebih dahulu.');
      setResult(null);
      return;
    }
    const parsed = parseShipping(text);
    const customers = parsed.customers.map((c) =>
      computeCustomer({
        name: c.name,
        items: c.items,
        packingType: c.packingType,
        requestedPacking: c.requestedPacking,
        notes: c.notes,
      })
    );
    setResult({ customers });
  };

  const clearText = () => {
    setText('');
    setResult(null);
    setParseError(null);
  };

  const globalAgg = useMemo(() => {
    const agg: Record<string, number> = {};
    (result?.customers ?? []).forEach((c) =>
      c.items.forEach((it) => {
        agg[it.name] = (agg[it.name] || 0) + it.qty;
      })
    );
    return agg;
  }, [result]);

  const perType = useMemo(() => {
    const agg: Record<string, number> = {};
    (result?.customers ?? []).forEach((c) => {
      if (c.totalPacks <= 0) return;
      agg[c.packingType] = (agg[c.packingType] || 0) + c.totalPacks;
    });
    return agg;
  }, [result]);

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Kalkulator List Pengiriman</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Hitung kebutuhan packing dari list pengiriman. Dihitung lokal di browser, tidak terhubung ke
          data stok.
        </p>
      </div>

      <div className="max-w-3xl space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Data Pengiriman</label>
            <button
              onClick={clearText}
              className="text-xs font-medium text-rose-600 hover:text-rose-700"
            >
              Hapus Teks
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Copy list kiriman hari ini dari Grup WA\nLalu tempelkan di sini.'}
            rows={8}
            className={`${inputClass} min-h-44`}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={calculate}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Hitung Packing
          </button>
          <Link
            href="/mix-barang"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            Hitung Kapasitas Mix Barang
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        </div>

        {parseError && <p className="text-sm text-rose-600">{parseError}</p>}

        {result && result.customers.length === 0 && (
          <p className="text-sm text-rose-600">Format customer tidak dapat dikenali.</p>
        )}

        {result && result.customers.length > 0 && (
          <div className="space-y-5">
            {/* Total barang */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between bg-emerald-600 px-4 py-2.5">
                <span className="text-sm font-bold text-white">TOTAL BARANG</span>
                <span className="text-xs font-medium text-emerald-50">
                  {Object.keys(globalAgg).length} jenis
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {Object.keys(globalAgg).length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-500">Tidak ada barang terdeteksi.</p>
                ) : (
                  Object.keys(globalAgg)
                    .sort((a, b) => a.localeCompare(b))
                    .map((name) => (
                      <div key={name} className="flex items-center justify-between px-4 py-2 text-sm">
                        <span className="font-medium text-slate-800">{name}</span>
                        <span className="font-bold text-slate-900">{fmtQty(globalAgg[name])} pcs</span>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Kesimpulan packing */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between bg-amber-600 px-4 py-2.5">
                <span className="text-sm font-bold text-white">KESIMPULAN PACKING</span>
                <span className="text-xs font-medium text-amber-50">
                  {result.customers.length} customer
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {result.customers.map((c) => {
                  const typeLabel = c.packingDefault ? 'Packing Foam' : c.packingType;
                  const suffix = c.packingDefault ? ' (Default)' : '';
                  return (
                    <div
                      key={c.name}
                      className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
                    >
                      <span className="font-medium text-slate-800">[{c.name}]</span>
                      <span className="text-right font-bold text-slate-900">
                        {c.totalPacks} x {typeLabel}
                        {suffix}
                      </span>
                    </div>
                  );
                })}
                {Object.entries(perType).map(([type, total]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-sm"
                  >
                    <span className="font-bold text-slate-900">Total {type}</span>
                    <span className="rounded-full border border-emerald-600 bg-emerald-50 px-3 py-0.5 text-sm font-bold text-emerald-700">
                      {total}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Per customer */}
            {result.customers.map((c) => {
              const typeLabel = c.packingDefault ? 'Packing Foam' : c.packingType;
              return (
                <div
                  key={c.name}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <h3 className="text-sm font-bold text-slate-900">{c.name}</h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        c.packingDefault ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {c.packingDefault ? 'Default' : 'Dari list'}
                    </span>
                  </div>

                  {c.empty ? (
                    <p className="px-4 py-3 text-sm text-slate-500">
                      Tidak ada item terdeteksi untuk customer ini.
                    </p>
                  ) : (
                    <div className="px-4 py-3">
                      <p className="mb-1 text-xs font-bold text-slate-500">Items</p>
                      {c.items.map((it) => (
                        <div
                          key={`i-${c.name}-${it.name}`}
                          className="flex items-center justify-between py-1 text-sm"
                        >
                          <span className="text-slate-700">{it.name}</span>
                          <span className="font-semibold text-slate-900">{fmtQty(it.qty)} pcs</span>
                        </div>
                      ))}

                      <p className="mt-3 mb-1 text-xs font-bold text-slate-500">Packing Group</p>
                      {c.groups.length === 0 ? (
                        <p className="text-sm text-slate-500">Tidak ada group packing terhitung.</p>
                      ) : (
                        c.groups.map((g) => (
                          <div
                            key={`g-${c.name}-${g.id}`}
                            className="flex items-center justify-between py-1 text-sm"
                          >
                            <span className="text-slate-700">{g.label}</span>
                            <span className="font-semibold text-slate-900">{pct2(g.pct)}%</span>
                          </div>
                        ))
                      )}

                      <div className="mt-3 border-t border-slate-200 pt-3">
                        <div className="flex items-center justify-between py-1 text-sm">
                          <span className="text-slate-500">Total Kapasitas</span>
                          <span className="font-bold text-slate-900">{pct2(c.totalPct)}%</span>
                        </div>
                        <div className="flex items-center justify-between py-1 text-sm">
                          <span className="text-slate-500">Kebutuhan</span>
                          <span className="font-bold text-slate-900">
                            {c.totalPacks} {c.packingType}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-emerald-600 px-4 py-3">
                    <span className="text-sm font-semibold text-emerald-50">Keterangan Packing</span>
                    <span className="text-sm font-extrabold text-white">
                      {c.totalPacks} x {typeLabel}
                      {c.packingDefault ? ' (Default)' : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
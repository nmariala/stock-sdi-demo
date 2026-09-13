'use client';

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/auth';
import { GUDANG, KRITERIA } from '@/lib/konstanta';
import type { Barang } from '@/types';

function createClientTxId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function TransaksiForm({ jenis }: { jenis: 'masuk' | 'keluar' }) {
  const [barangList, setBarangList] = useState<Barang[]>([]);
  const [selectedBarang, setSelectedBarang] = useState<Barang | null>(null);
  const [gudang, setGudang] = useState<string>('Puri');
  const [kriteria, setKriteria] = useState<string>('Good');
  const [jumlah, setJumlah] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadBarang = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('barang').select('*').order('nama');
      if (error) throw error;
      setBarangList(Array.isArray(data) ? data : []);
    } catch {
      setBarangList([]);
    }
  }, []);

  useEffect(() => {
    loadBarang();
  }, [loadBarang]);

  const resetForm = () => {
    setJumlah('');
    setKeterangan('');
    setSelectedBarang(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarang) {
      setMessage({ type: 'error', text: 'Pilih barang terlebih dahulu' });
      return;
    }
    const qty = Number(jumlah);
    if (!jumlah || isNaN(qty) || qty <= 0) {
      setMessage({ type: 'error', text: 'Jumlah harus berupa angka positif' });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('transaksi').insert({
        barang_id: selectedBarang.id,
        jenis,
        jumlah: qty,
        warehouse: gudang,
        kriteria,
        keterangan: keterangan.trim() ? keterangan.trim() : null,
        client_tx_id: createClientTxId(),
      });
      if (error) {
        if (error.code === '23505') {
          setMessage({ type: 'success', text: 'Transaksi ini sudah tercatat sebelumnya' });
          resetForm();
        } else if (error.code === 'check_violation') {
          setMessage({ type: 'error', text: 'Stok tidak mencukupi untuk barang keluar' });
        } else {
          setMessage({ type: 'error', text: error.message });
        }
        return;
      }
      setMessage({
        type: 'success',
        text: `${jenis === 'masuk' ? 'Barang masuk' : 'Barang keluar'} berhasil dicatat`,
      });
      resetForm();
    } catch {
      setMessage({ type: 'error', text: 'Terjadi kesalahan saat menyimpan transaksi' });
    } finally {
      setSubmitting(false);
    }
  };

  const isMasuk = jenis === 'masuk';
  const theme = isMasuk ? 'emerald' : 'rose';

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {isMasuk ? 'Barang Masuk' : 'Barang Keluar'}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Catat {isMasuk ? 'barang yang masuk' : 'barang yang keluar'} dari gudang.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="max-w-xl space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {/* Transaction type banner */}
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold ${
            isMasuk
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            {isMasuk ? (
              /* Panah Kiri Bawah (↙) -> Barang Masuk */
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25"
              />
            ) : (
              /* Panah Kanan Atas (↗) -> Barang Keluar */
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
              />
            )}
          </svg>
          {isMasuk ? 'Barang Masuk' : 'Barang Keluar'}
        </div>

        {/* Barang */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Barang <span className="text-rose-500">*</span>
          </label>
          <select
            value={selectedBarang?.id ?? ''}
            onChange={(e) => {
              const id = Number(e.target.value);
              setSelectedBarang(barangList.find((b) => b.id === id) ?? null);
            }}
            className={inputClass}
          >
            <option value="">-- Pilih barang --</option>
            {barangList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nama}
              </option>
            ))}
          </select>
          {barangList.length === 0 && (
            <p className="mt-1 text-xs text-slate-400">Tidak ada barang tersedia</p>
          )}
        </div>

        {/* Gudang */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Gudang <span className="text-rose-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {GUDANG.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGudang(g)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  gudang === g
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Kriteria */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Kondisi <span className="text-rose-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {KRITERIA.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKriteria(k)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  kriteria === k
                    ? k === 'Good'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-rose-600 bg-rose-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {/* Jumlah */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Jumlah <span className="text-rose-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={jumlah}
            onChange={(e) => setJumlah(e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </div>

        {/* Keterangan */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Keterangan <span className="text-slate-400">(opsional)</span>
          </label>
          <input
            type="text"
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            placeholder="Contoh: hasil produksi"
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
            theme === 'emerald'
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-rose-600 hover:bg-rose-700'
          }`}
        >
          {submitting
            ? 'Menyimpan...'
            : isMasuk
              ? 'Simpan Barang Masuk'
              : 'Simpan Barang Keluar'}
        </button>
      </form>
    </div>
  );
}
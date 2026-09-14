'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getBarangList, createBarang, updateBarang, deleteBarang, getApiErrorMessage } from '@/lib/api';
import { formatQuantity } from '@/lib/format';
import type { Barang } from '@/types';

const normalizeNama = (s: string): string => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

interface FormMessage {
  title: string;
  body: string;
}

interface DeleteTarget {
  id: number;
  nama: string;
  step: 1 | 2;
}

export default function KelolaBarangPage() {
  const [barangList, setBarangList] = useState<Barang[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newNama, setNewNama] = useState('');
  const [newQty, setNewQty] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNama, setEditNama] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<FormMessage | null>(null);

  const busyRef = useRef(false);
  const deletingRef = useRef(false);

  const fetchBarang = useCallback(async () => {
    try {
      const res = await getBarangList({ sort: 'nama', order: 'asc', pageSize: 500 });
      if (Array.isArray(res.data)) setBarangList(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBarang();
  }, [fetchBarang]);

  const checkDuplicateLocal = (nama: string, excludeId?: number): boolean =>
    barangList.some((b) => b && b.nama != null && b.id !== excludeId && normalizeNama(b.nama) === nama);

  const submitAdd = async () => {
    if (busyRef.current) return;
    const nama = newNama.trim();
    if (!nama) {
      setMessage({ title: 'Lengkapi data', body: 'Nama barang wajib diisi' });
      return;
    }
    const norm = normalizeNama(nama);
    if (checkDuplicateLocal(norm)) {
      setMessage({ title: 'Barang sudah terdaftar', body: `"${nama}" sudah ada di daftar barang. Tidak boleh ada barang duplikat.` });
      return;
    }
    busyRef.current = true;
    setAddSubmitting(true);
    try {
      await createBarang({ nama, stok: Number(newQty) || 0 });
      setNewNama('');
      setNewQty('');
      setShowAdd(false);
      setMessage(null);
      fetchBarang();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_NAME') {
        setMessage({ title: 'Barang sudah terdaftar', body: `"${nama}" sudah ada di daftar barang. Tidak boleh ada barang duplikat.` });
      } else {
        setMessage({ title: 'Gagal', body: getApiErrorMessage(err, 'Gagal menyimpan barang baru.') });
      }
    } finally {
      busyRef.current = false;
      setAddSubmitting(false);
    }
  };

  const startEdit = (item: Barang) => {
    setEditingId(item.id);
    setEditNama(item.nama);
    setMessage(null);
  };

  const saveEdit = async (id: number) => {
    if (busyRef.current) return;
    const nama = editNama.trim();
    if (!nama) {
      setMessage({ title: 'Lengkapi data', body: 'Nama barang tidak boleh kosong' });
      return;
    }
    const norm = normalizeNama(nama);
    if (checkDuplicateLocal(norm, id)) {
      setMessage({ title: 'Nama sudah dipakai', body: `"${nama}" sudah digunakan oleh barang lain.` });
      return;
    }
    busyRef.current = true;
    try {
      await updateBarang(id, { nama });
      setEditingId(null);
      setMessage(null);
      fetchBarang();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_NAME') {
        setMessage({ title: 'Nama sudah dipakai', body: `"${nama}" sudah digunakan oleh barang lain.` });
      } else {
        setMessage({ title: 'Gagal update', body: getApiErrorMessage(err, 'Gagal memperbarui barang.') });
      }
    } finally {
      busyRef.current = false;
    }
  };

  const doDelete = async (item: DeleteTarget) => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    try {
      await deleteBarang(item.id);
      setMessage(null);
      fetchBarang();
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'FOREIGN_KEY_ERROR' || err.code === 'CONSTRAINT_ERROR')) {
        setMessage({
          title: 'Tidak bisa dihapus',
          body: 'Barang ini sudah punya riwayat transaksi masuk/keluar, jadi tidak bisa dihapus. (Hubungi Admin)',
        });
      } else {
        setMessage({
          title: 'Tidak bisa dihapus',
          body: getApiErrorMessage(err, 'Gagal menghapus barang.'),
        });
      }
    } finally {
      deletingRef.current = false;
      setDeleteTarget(null);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100';

  const btnPrimary =
    'rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50';
  const btnDanger =
    'rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50';
  const btnOutline =
    'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Kelola Barang</h1>
        <p className="mt-0.5 text-sm text-slate-500">Tambah, ubah, atau hapus daftar barang.</p>
      </div>

      {message && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-semibold text-rose-800">{message.title}</p>
          <p className="mt-0.5 text-sm text-rose-700">{message.body}</p>
        </div>
      )}

      {/* Add form toggle */}
      {showAdd ? (
        <div className="max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nama Barang</label>
            <input
              type="text"
              value={newNama}
              onChange={(e) => setNewNama(e.target.value)}
              placeholder="Contoh: SB110"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Qty Awal</label>
            <input
              type="number"
              min="0"
              step="any"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <button onClick={submitAdd} disabled={addSubmitting} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {addSubmitting ? 'Menyimpan...' : 'Simpan Barang Baru'}
            </button>
            <button onClick={() => { setShowAdd(false); setMessage(null); }} className={btnOutline}>
              Batal
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setShowAdd(true); setMessage(null); }}
          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
        >
          + Tambah Barang Baru
        </button>
      )}

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[15px] font-bold text-slate-700">
                <th className="px-4 py-3">No.</th>
                <th className="px-4 py-3">Nama Barang</th>
                <th className="px-4 py-3 text-right">Stok</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">Memuat...</td>
                </tr>
              ) : barangList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">Belum ada barang</td>
                </tr>
              ) : (
                barangList.map((item, i) =>
                  editingId === item.id ? (
                    <tr key={item.id} className="border-b border-slate-100 bg-slate-50/60">
                      <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                      <td colSpan={2} className="px-4 py-3">
                        <input
                          type="text"
                          value={editNama}
                          onChange={(e) => setEditNama(e.target.value)}
                          placeholder="Nama barang"
                          className={inputClass}
                          autoFocus
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => saveEdit(item.id)} className={btnPrimary}>Simpan</button>
                          <button onClick={() => { setEditingId(null); setMessage(null); }} className={btnOutline}>Batal</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{item.nama}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">{formatQuantity(item.stok)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => startEdit(item)} className={btnPrimary}>Edit</button>
                          <button onClick={() => setDeleteTarget({ id: item.id, nama: item.nama, step: 1 })} className={btnDanger}>Hapus</button>
                        </div>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-slate-900">
              {deleteTarget.step === 1 ? 'Hapus barang?' : 'Konfirmasi terakhir'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {deleteTarget.step === 1
                ? `${deleteTarget.nama} akan dihapus permanen`
                : `Apakah Anda benar-benar yakin ingin menghapus "${deleteTarget.nama}"? Data yang sudah dihapus tidak dapat dikembalikan.`}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className={btnOutline}>Batal</button>
              <button
                onClick={() =>
                  deleteTarget.step === 1
                    ? setDeleteTarget({ ...deleteTarget, step: 2 })
                    : doDelete(deleteTarget)
                }
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                {deleteTarget.step === 1 ? 'Hapus' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
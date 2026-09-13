import type { Barang, StockRow, Transaksi } from '@/types';

// ---------------------------------------------------------------------------
// API client untuk Stock SDI Demo API (Node.js + PostgreSQL Homelab).
// Base URL dibuat configurable via NEXT_PUBLIC_API_BASE_URL
// (default dev: http://localhost:3001).
//
// CATATAN transisi:
//   - Halaman & komponen SAAT INI masih memakai Supabase (lihat src/lib/stok.ts
//     dst). File ini disiapkan sebagai pengganti akses database frontend.
//   - Belum ada halaman yang memakai fungsi di file ini sampai cut-over resmi.
// ---------------------------------------------------------------------------

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3101').replace(/\/+$/, '');
export const API_BASE_URL = API_BASE;

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'DUPLICATE_NAME',
  'DUPLICATE_TRANSACTION',
  'INSUFFICIENT_STOCK',
  'FOREIGN_KEY_ERROR',
  'CONSTRAINT_ERROR',
  'RATE_LIMITED',
  'DATABASE_ERROR',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Transaksi lengkap dari API (join nama barang & user demografis).
export interface TransaksiApi extends Transaksi {
  barang_nama: string;
  user_nama: string | null;
}

export interface BalanceBefore {
  id: number;
  barang_id: number;
  created_at: string;
  balance_before: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(payload: ApiErrorPayload, status: number) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      // Sesi memakai cookie HttpOnly; browser wajib mengirimnya.
      credentials: 'include',
      ...init,
    });
  } catch {
    throw new ApiError(
      { code: 'DATABASE_ERROR', message: 'Tidak dapat terhubung ke server aplikasi' },
      0
    );
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const payload = (body as { error?: ApiErrorPayload } | null)?.error;
    throw new ApiError(
      payload ?? { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan yang tidak diketahui' },
      res.status
    );
  }

  return body as T;
}

const toQuery = (params: Record<string, string | number | undefined | null>): string => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

// ---------------------------------------------------------------------------
// Barang
// ---------------------------------------------------------------------------

export interface BarangQuery {
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: 'id' | 'nama';
  order?: 'asc' | 'desc';
}

export function getBarangList(params: BarangQuery = {}): Promise<Paginated<Barang>> {
  return request(`/api/barang${toQuery({ ...params })}`);
}

export function getBarangById(id: number): Promise<Barang> {
  return request<{ data: Barang }>(`/api/barang/${id}`).then((b) => b.data);
}

export function createBarang(input: { nama: string; stok?: number }): Promise<Barang> {
  return request<{ data: Barang }>('/api/barang', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.data);
}

export function updateBarang(id: number, input: { nama: string }): Promise<Barang> {
  return request<{ data: Barang }>(`/api/barang/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((r) => r.data);
}

export function deleteBarang(id: number): Promise<{ id: number }> {
  return request<{ data: { id: number } }>(`/api/barang/${id}`, { method: 'DELETE' }).then((r) => r.data);
}

// ---------------------------------------------------------------------------
// Stock (tingkat stok per barang + rincian per warehouse/kriteria)
// ---------------------------------------------------------------------------

export interface StockQuery {
  warehouse?: string;
  kriteria?: string;
  barang_id?: number;
  search?: string;
}

export function getStock(params: StockQuery = {}): Promise<{ data: StockRow[]; total: number }> {
  return request(`/api/stock${toQuery({ ...params })}`);
}

// ---------------------------------------------------------------------------
// Transaksi
// ---------------------------------------------------------------------------

export interface TransaksiQuery {
  barang_id?: number;
  warehouse?: string;
  kriteria?: string;
  jenis?: 'masuk' | 'keluar';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function getTransaksi(params: TransaksiQuery = {}): Promise<Paginated<TransaksiApi>> {
  return request(`/api/transaksi${toQuery({ ...params })}`);
}

export function getTransaksiById(id: number): Promise<TransaksiApi & { balance_before: number }> {
  return request<{ data: TransaksiApi & { balance_before: number } }>(`/api/transaksi/${id}`).then((r) => r.data);
}

export function getTransaksiBalanceBefore(id: number): Promise<BalanceBefore> {
  return request<{ data: BalanceBefore }>(`/api/transaksi/${id}/balance-before`).then((r) => r.data);
}

export interface CreateTransaksiInput {
  barang_id: number;
  jenis: 'masuk' | 'keluar';
  jumlah: number;
  warehouse: string;
  kriteria: string;
  keterangan?: string | null;
  client_tx_id?: string | null;
}

export function createTransaksi(input: CreateTransaksiInput): Promise<TransaksiApi> {
  return request<{ data: TransaksiApi }>('/api/transaksi', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.data);
}
export interface Barang {
  id: number;
  nama: string;
  stok: number;
}

export interface StockLevel {
  id: number;
  item_id: number;
  warehouse: string;
  kriteria: string;
  jumlah: number;
  updated_at: string;
}

export interface Transaksi {
  id: number;
  barang_id: number;
  user_id: string;
  jenis: 'masuk' | 'keluar';
  jumlah: number;
  warehouse: string;
  kriteria: string;
  keterangan: string | null;
  client_tx_id: string | null;
  created_at: string;
}

export interface TransaksiWithBarang extends Transaksi {
  nama: string;
}

export interface Profile {
  id: string;
  nama: string;
  role: string;
}

export interface StockRow extends Barang {
  levels: Record<string, Record<string, number>>;
  total: number;
}

import type { Medan } from '@/components/form-master'
import { JENIS_LOKASI } from '@/lib/stok/lokasi'

export function medanLokasi(awal: { code?: string; name?: string; kind?: string; allowNegativeStock?: boolean } = {}): Medan[] {
  return [
    { jenis: 'teks', nama: 'code', label: 'Kode', awal: awal.code, wajib: true, maxLength: 16, placeholder: 'BAR', bantuan: 'Huruf besar dan angka. Tidak bisa diganti sesudah ada gerak stok.' },
    { jenis: 'teks', nama: 'name', label: 'Nama lokasi', awal: awal.name, wajib: true, maxLength: 60 },
    { jenis: 'pilih', nama: 'kind', label: 'Jenis', awal: awal.kind ?? 'gudang', pilihan: Object.entries(JENIS_LOKASI).map(([nilai, label]) => ({ nilai, label })), wajib: true },
    {
      jenis: 'centang',
      nama: 'allowNegativeStock',
      label: 'Izinkan stok minus',
      awal: awal.allowNegativeStock ?? false,
      bantuan: 'Bila mati, gerak keluar yang membuat stok di bawah 0 ditolak, termasuk penjualan kasir.',
      lebar: true,
    },
  ]
}

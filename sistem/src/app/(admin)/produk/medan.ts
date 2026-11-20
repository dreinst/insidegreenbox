import type { Medan } from '@/components/form-master'
import { JENIS_PRODUK } from '@/lib/stok/produk'

type Pilihan = { id: number; name: string; symbol?: string }

export function medanProduk(satuan: Pilihan[], kategori: Pilihan[], awal: Record<string, string | boolean | undefined> = {}): Medan[] {
  const teks = (k: string) => (typeof awal[k] === 'string' ? (awal[k] as string) : undefined)
  return [
    { jenis: 'teks', nama: 'code', label: 'Kode', awal: teks('code'), wajib: true, maxLength: 20, placeholder: 'BHN-KOPI', bantuan: 'Huruf besar, angka, titik, atau tanda hubung.' },
    { jenis: 'teks', nama: 'name', label: 'Nama produk', awal: teks('name'), wajib: true, maxLength: 80 },
    { jenis: 'pilih', nama: 'kind', label: 'Jenis', awal: teks('kind') ?? 'bahan', pilihan: Object.entries(JENIS_PRODUK).map(([nilai, label]) => ({ nilai, label })), wajib: true },
    { jenis: 'pilih', nama: 'categoryId', label: 'Kategori', awal: teks('categoryId') ?? '', pilihan: [{ nilai: '', label: 'Tanpa kategori' }, ...kategori.map((c) => ({ nilai: String(c.id), label: c.name }))] },
    {
      jenis: 'pilih',
      nama: 'baseUnitId',
      label: 'Satuan dasar',
      awal: teks('baseUnitId') ?? '',
      pilihan: [{ nilai: '', label: 'Pilih satuan' }, ...satuan.map((u) => ({ nilai: String(u.id), label: `${u.name} (${u.symbol})` }))],
      wajib: true,
      bantuan: 'Stok, resep, dan harga rata-rata dihitung dalam satuan ini. Tidak bisa diganti sesudah ada gerak stok.',
    },
    { jenis: 'angka', nama: 'minStock', label: 'Stok minimum', awal: teks('minStock'), inputMode: 'decimal', placeholder: '0', bantuan: 'Dalam satuan dasar. Posisi stok menandai produk di bawah angka ini.' },
    { jenis: 'centang', nama: 'purchasable', label: 'Bisa dibeli dari pemasok', awal: awal.purchasable === undefined ? true : !!awal.purchasable },
  ]
}

export const pilihanJenis = Object.entries(JENIS_PRODUK).map(([nilai, label]) => ({ nilai, label }))

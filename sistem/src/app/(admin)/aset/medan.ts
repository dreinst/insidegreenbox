// Daftar medan formulir aset, dipakai halaman baru dan rincian draf.
import type { Medan } from '@/components/form-master'
import { namaRekening } from '@/lib/rekening'

type Pilihan = { kategori: { id: number; name: string; usefulMonths: number }[]; lokasi: { id: number; name: string }[]; rekening: { id: number; bankName: string; accountNo: string; holderName: string }[] }
type Awal = Partial<Record<'name' | 'categoryId' | 'locationId' | 'acquiredDate' | 'cost' | 'salvage' | 'usefulMonths' | 'sumber' | 'note', string>>

export const medanAset = (p: Pilihan, awal: Awal = {}): Medan[] => [
  { jenis: 'teks', nama: 'name', label: 'Nama aset', awal: awal.name, wajib: true, maxLength: 80, lebar: true },
  { jenis: 'pilih', nama: 'categoryId', label: 'Kategori', awal: awal.categoryId ?? '', pilihan: [{ nilai: '', label: 'Pilih kategori' }, ...p.kategori.map((c) => ({ nilai: String(c.id), label: `${c.name} (${c.usefulMonths} bulan)` }))], wajib: true },
  { jenis: 'pilih', nama: 'locationId', label: 'Lokasi', awal: awal.locationId ?? '', pilihan: [{ nilai: '', label: 'Tanpa lokasi' }, ...p.lokasi.map((l) => ({ nilai: String(l.id), label: l.name }))] },
  { jenis: 'tanggal', nama: 'acquiredDate', label: 'Tanggal perolehan', awal: awal.acquiredDate, wajib: true, bantuan: 'Penyusutan mulai bulan ini.' },
  { jenis: 'angka', nama: 'cost', label: 'Nilai perolehan (Rp)', awal: awal.cost, wajib: true, inputMode: 'numeric', placeholder: '12.000.000' },
  { jenis: 'angka', nama: 'salvage', label: 'Nilai sisa (Rp)', awal: awal.salvage, inputMode: 'numeric', placeholder: '0', bantuan: 'Perkiraan nilai di akhir umur manfaat. Kosong = 0.' },
  { jenis: 'angka', nama: 'usefulMonths', label: 'Umur manfaat (bulan)', awal: awal.usefulMonths, inputMode: 'numeric', bantuan: 'Kosong = umur bawaan kategori.' },
  {
    jenis: 'pilih',
    nama: 'sumber',
    label: 'Dibayar dari',
    awal: awal.sumber ?? 'kas',
    pilihan: [{ nilai: 'kas', label: 'Kas besar' }, ...p.rekening.map((r) => ({ nilai: String(r.id), label: namaRekening(r) }))],
    wajib: true,
    bantuan: 'Perolehan dijurnal dari kas atau rekening ini saat aset diaktifkan.',
  },
  { jenis: 'area', nama: 'note', label: 'Catatan', awal: awal.note, maxLength: 300, lebar: true },
]

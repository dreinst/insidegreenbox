import type { Medan } from '@/components/form-master'

type Pilihan = { nilai: string; label: string }[]
type Awal = { supplierId?: string; locationId?: string; date?: string; payMode?: string; sumber?: string; supplierInvoiceNo?: string; dueDate?: string; extraCost?: string; note?: string }

// Kepala pembelian langsung, dipakai layar baru dan layar rincian (draf).
export function medanLangsung(a: Awal, pemasok: Pilihan, lokasi: Pilihan, rekening: Pilihan, cara: Pilihan): Medan[] {
  return [
    { jenis: 'pilih', nama: 'supplierId', label: 'Pemasok', awal: a.supplierId ?? '', pilihan: [{ nilai: '', label: 'Pilih pemasok' }, ...pemasok], wajib: true },
    { jenis: 'pilih', nama: 'locationId', label: 'Lokasi', awal: a.locationId, pilihan: lokasi, wajib: true },
    { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: a.date, wajib: true },
    { jenis: 'pilih', nama: 'payMode', label: 'Cara bayar', awal: a.payMode ?? cara[0]?.nilai, pilihan: cara, wajib: true },
    { jenis: 'pilih', nama: 'sumber', label: 'Dibayar dari (tunai)', awal: a.sumber ?? 'kas', pilihan: [{ nilai: 'kas', label: 'Kas' }, ...rekening], bantuan: 'Diabaikan untuk pembelian kredit.' },
    { jenis: 'teks', nama: 'supplierInvoiceNo', label: 'Nomor nota pemasok', awal: a.supplierInvoiceNo, maxLength: 40 },
    { jenis: 'tanggal', nama: 'dueDate', label: 'Jatuh tempo (kredit)', awal: a.dueDate, bantuan: 'Kosong berarti tanggal + termin pemasok.' },
    { jenis: 'angka', nama: 'extraCost', label: 'Biaya tambahan (Rp)', awal: a.extraCost, placeholder: '0', bantuan: 'Ongkos dari pemasok ini, masuk ke nilai persediaan.' },
    { jenis: 'area', nama: 'note', label: 'Catatan', awal: a.note, maxLength: 300, lebar: true },
  ]
}

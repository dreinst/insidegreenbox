import type { Medan } from '@/components/form-master'

type Awal = { code?: string; name?: string; category?: string; contact?: string; phone?: string; address?: string; npwp?: string; paymentDays?: number; note?: string }

export function medanPelanggan(a: Awal = {}): Medan[] {
  return [
    { jenis: 'teks', nama: 'code', label: 'Kode', awal: a.code, wajib: true, maxLength: 20, placeholder: 'CUS-KANTOR' },
    { jenis: 'teks', nama: 'name', label: 'Nama pelanggan', awal: a.name, wajib: true, maxLength: 80 },
    { jenis: 'teks', nama: 'category', label: 'Kelompok', awal: a.category, maxLength: 40, placeholder: 'Kantor, kafe, reseller' },
    { jenis: 'teks', nama: 'contact', label: 'Nama kontak', awal: a.contact, maxLength: 80 },
    { jenis: 'teks', nama: 'phone', label: 'Telepon atau WA', awal: a.phone, maxLength: 30, inputMode: 'tel' },
    { jenis: 'angka', nama: 'paymentDays', label: 'Termin bayar (hari)', awal: a.paymentDays === undefined ? '0' : String(a.paymentDays), inputMode: 'numeric', bantuan: 'Jatuh tempo faktur = tanggal faktur + termin. 0 berarti jatuh tempo di hari faktur.' },
    { jenis: 'teks', nama: 'npwp', label: 'NPWP', awal: a.npwp, maxLength: 30 },
    { jenis: 'area', nama: 'address', label: 'Alamat kirim', awal: a.address, maxLength: 200, lebar: true },
    { jenis: 'area', nama: 'note', label: 'Catatan', awal: a.note, maxLength: 300, lebar: true },
  ]
}

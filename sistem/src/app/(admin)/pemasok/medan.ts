import type { Medan } from '@/components/form-master'

type Awal = { code?: string; name?: string; contact?: string; phone?: string; address?: string; npwp?: string; creditDays?: number; bankName?: string; bankAccountNo?: string; note?: string }

export function medanPemasok(a: Awal = {}): Medan[] {
  return [
    { jenis: 'teks', nama: 'code', label: 'Kode', awal: a.code, wajib: true, maxLength: 20, placeholder: 'SUP-KOPI' },
    { jenis: 'teks', nama: 'name', label: 'Nama pemasok', awal: a.name, wajib: true, maxLength: 80 },
    { jenis: 'teks', nama: 'contact', label: 'Nama kontak', awal: a.contact, maxLength: 80 },
    { jenis: 'teks', nama: 'phone', label: 'Telepon atau WA', awal: a.phone, maxLength: 30, inputMode: 'tel' },
    { jenis: 'angka', nama: 'creditDays', label: 'Termin bayar (hari)', awal: a.creditDays === undefined ? '0' : String(a.creditDays), inputMode: 'numeric', bantuan: 'Jatuh tempo faktur dan pembelian kredit = tanggal dokumen + termin. 0 berarti tunai.' },
    { jenis: 'teks', nama: 'npwp', label: 'NPWP', awal: a.npwp, maxLength: 30 },
    { jenis: 'teks', nama: 'bankName', label: 'Bank pemasok', awal: a.bankName, maxLength: 40 },
    { jenis: 'teks', nama: 'bankAccountNo', label: 'Nomor rekening pemasok', awal: a.bankAccountNo, maxLength: 30, inputMode: 'numeric' },
    { jenis: 'area', nama: 'address', label: 'Alamat', awal: a.address, maxLength: 200, lebar: true },
    { jenis: 'area', nama: 'note', label: 'Catatan', awal: a.note, maxLength: 300, lebar: true, bantuan: 'Misalnya barang yang dipasok dan jadwal kirim.' },
  ]
}

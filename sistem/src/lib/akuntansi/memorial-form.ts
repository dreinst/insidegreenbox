// Daftar medan formulir rincian jurnal memorial. Kepala dan baris sama-sama punya medan "memo", jadi keterangan baris
// diberi id sendiri. Tanpa itu label "Keterangan baris" menunjuk ke isian kepala yang id-nya sama dan ketikan kasir
// masuk ke keterangan kepala, bukan ke baris.
import type { Medan } from '@/components/form-master'

type Pilihan = { nilai: string; label: string }

export const ID_MEMO_BARIS = 'memo-baris'

export const medanKepalaMemorial = (awal: { date: string; memo: string }): Medan[] => [
  { jenis: 'tanggal', nama: 'date', label: 'Tanggal jurnal', awal: awal.date, wajib: true },
  { jenis: 'area', nama: 'memo', label: 'Keterangan', awal: awal.memo, maxLength: 300, lebar: true },
]

export function medanBarisMemorial(akun: { id: number; code: string; name: string }[], pelanggan: { id: number; name: string }[], pemasok: { id: number; name: string }[]): Medan[] {
  const pihak: Pilihan[] = [
    { nilai: '', label: 'Tanpa (akun selain Piutang dan Hutang Usaha)' },
    ...pelanggan.map((c) => ({ nilai: `c:${c.id}`, label: `Pelanggan: ${c.name}` })),
    ...pemasok.map((x) => ({ nilai: `s:${x.id}`, label: `Pemasok: ${x.name}` })),
  ]
  return [
    { jenis: 'pilih', nama: 'accountId', label: 'Akun', pilihan: [{ nilai: '', label: 'Pilih akun' }, ...akun.map((a) => ({ nilai: String(a.id), label: `${a.code} ${a.name}` }))], wajib: true, lebar: true },
    { jenis: 'angka', nama: 'debit', label: 'Debit (Rp)', placeholder: '0', bantuan: 'Isi debit atau kredit saja.' },
    { jenis: 'angka', nama: 'kredit', label: 'Kredit (Rp)', placeholder: '0' },
    { jenis: 'pilih', nama: 'pihak', label: 'Pelanggan atau pemasok', pilihan: pihak, bantuan: 'Wajib untuk baris Piutang Usaha (pelanggan) dan Hutang Usaha (pemasok).', lebar: true },
    { jenis: 'teks', nama: 'memo', id: ID_MEMO_BARIS, label: 'Keterangan baris', maxLength: 200, lebar: true },
  ]
}

import type { Medan } from '@/components/form-master'
import { JENIS_METODE } from '@/lib/metode-bayar'
import { tanggalIso } from '@/lib/waktu'

// dipakai: jumlah pembayaran yang memakai metode ini. Bila lebih dari 0, jenis dikunci (temuan audit A-6).
type Awal = { name?: string; kind?: string; openDrawer?: boolean; dipakai?: number }

const medanDasar = (awal: Awal): Medan[] => [
  { jenis: 'teks', nama: 'name', label: 'Nama metode', awal: awal.name, wajib: true, maxLength: 40 },
  awal.dipakai && awal.kind
    ? {
        jenis: 'pilih',
        nama: 'kind',
        label: 'Jenis',
        awal: awal.kind,
        pilihan: [{ nilai: awal.kind, label: JENIS_METODE[awal.kind as keyof typeof JENIS_METODE] ?? awal.kind }],
        wajib: true,
        bantuan: `Sudah dipakai di ${awal.dipakai} pembayaran, jadi jenisnya tidak bisa diganti. Bila salah, buat metode baru lalu nonaktifkan yang ini.`,
      }
    : { jenis: 'pilih', nama: 'kind', label: 'Jenis', awal: awal.kind ?? 'tunai', pilihan: Object.entries(JENIS_METODE).map(([nilai, label]) => ({ nilai, label })), wajib: true },
]
const medanLaci = (awal: Awal): Medan => ({ jenis: 'centang', nama: 'openDrawer', label: 'Buka laci kasir saat dipakai', awal: awal.openDrawer ?? false })

// Tarif MDR (tahap 6C): dipakai saat menambah metode dan saat Owner menambah tarif baru.
export function medanTarif(): Medan[] {
  return [
    { jenis: 'angka', nama: 'mdrPct', label: 'MDR (%)', awal: '0', inputMode: 'decimal', wajib: true, bantuan: 'Persen yang dipotong penyedia, misalnya 0,3. Tunai selalu 0.' },
    {
      jenis: 'angka',
      nama: 'freeLimit',
      label: 'Batas bebas MDR (Rp)',
      placeholder: 'Kosong',
      bantuan: 'Transaksi sampai nominal ini tidak kena MDR, di atasnya kena MDR dari seluruh nominal. Kosongkan bila semua transaksi kena MDR.',
    },
    { jenis: 'tanggal', nama: 'effectiveFrom', label: 'Berlaku mulai', awal: tanggalIso(new Date()), wajib: true, bantuan: 'Dipakai untuk penjualan sejak tanggal ini (WIB).' },
    { jenis: 'teks', nama: 'note', label: 'Keterangan (boleh kosong)', maxLength: 200, lebar: true, bantuan: 'Misalnya sumber aturan atau nomor surat penyedia.' },
  ]
}

export const medanMetodeBaru = (): Medan[] => [...medanDasar({}), ...medanTarif(), medanLaci({})]
export const medanUbahMetode = (awal: Awal): Medan[] => [...medanDasar(awal), medanLaci(awal)]

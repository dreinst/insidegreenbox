import type { Medan } from '@/components/form-master'
import { JENIS_METODE } from '@/lib/metode-bayar'

export function medanMetode(awal: { name?: string; kind?: string; mdrPct?: string; openDrawer?: boolean } = {}): Medan[] {
  return [
    { jenis: 'teks', nama: 'name', label: 'Nama metode', awal: awal.name, wajib: true, maxLength: 40 },
    { jenis: 'pilih', nama: 'kind', label: 'Jenis', awal: awal.kind ?? 'tunai', pilihan: Object.entries(JENIS_METODE).map(([nilai, label]) => ({ nilai, label })), wajib: true },
    { jenis: 'angka', nama: 'mdrPct', label: 'MDR (%)', awal: awal.mdrPct ?? '0', inputMode: 'decimal', wajib: true, bantuan: 'Biaya yang dipotong penyedia, misalnya 0,7. Tunai selalu 0.' },
    { jenis: 'centang', nama: 'openDrawer', label: 'Buka laci kasir saat dipakai', awal: awal.openDrawer ?? false },
  ]
}

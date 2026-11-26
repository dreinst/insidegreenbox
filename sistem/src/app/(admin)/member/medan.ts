import type { Medan } from '@/components/form-master'

// aturTingkat: pemegang Ubah menu.tingkat. Tanpa itu, isian kunjungan dan potongan tidak ditampilkan (temuan audit A-1).
// Alasan kunjungan wajib bila jumlah kunjungan diubah (keputusan pemilik 24 November 2026, KONTRAK 11 butir 157).
export function medanMember(awal: { name?: string; wa?: string; visits?: string; discountOn?: boolean; note?: string } = {}, aturTingkat = true): Medan[] {
  const baru = awal.visits === undefined
  return [
    { jenis: 'teks', nama: 'name', label: 'Nama member', awal: awal.name, wajib: true, maxLength: 80 },
    { jenis: 'teks', nama: 'wa', label: 'Nomor WhatsApp', awal: awal.wa, wajib: true, inputMode: 'tel', placeholder: '0812 3456 7890', bantuan: 'Boleh ditulis 08..., +62..., atau 62.... Disimpan dalam format 62.' },
    ...(aturTingkat
      ? ([
          { jenis: 'angka', nama: 'visits', label: 'Jumlah kunjungan', awal: awal.visits ?? '0', bantuan: 'Menentukan tingkat Greenbox Key. Kasir menambahnya otomatis.' },
          {
            jenis: 'teks',
            nama: 'alasanKunjungan',
            label: 'Alasan ubah kunjungan',
            maxLength: 200,
            placeholder: 'Misalnya: pindahan kartu stempel lama',
            bantuan: baru ? 'Wajib bila kunjungan awal lebih dari 0, minimal 5 huruf. Tercatat di jejak audit.' : 'Wajib bila jumlah kunjungan diubah, minimal 5 huruf. Tercatat di jejak audit.',
          },
        ] satisfies Medan[])
      : []),
    { jenis: 'area', nama: 'note', label: 'Catatan', awal: awal.note, maxLength: 300, lebar: true },
    ...(aturTingkat ? [{ jenis: 'centang', nama: 'discountOn', label: 'Potongan tingkat berlaku untuk member ini', awal: awal.discountOn ?? true } satisfies Medan] : []),
  ]
}

export const medanTingkat = (awal: { name?: string; minVisits?: string; discountPct?: string; perk?: string } = {}): Medan[] => [
  { jenis: 'teks', nama: 'name', label: 'Nama tingkat', awal: awal.name, wajib: true, maxLength: 40 },
  { jenis: 'angka', nama: 'minVisits', label: 'Syarat kunjungan', awal: awal.minVisits ?? '0', wajib: true, bantuan: 'Jumlah kunjungan minimal untuk naik ke tingkat ini.' },
  { jenis: 'teks', nama: 'discountPct', label: 'Potongan (%)', awal: awal.discountPct ?? '5', inputMode: 'decimal', wajib: true, bantuan: 'Contoh 5 atau 7,5.' },
  { jenis: 'area', nama: 'perk', label: 'Keterangan', awal: awal.perk, maxLength: 160, lebar: true },
]

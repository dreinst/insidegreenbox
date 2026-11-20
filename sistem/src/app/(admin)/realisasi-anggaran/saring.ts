// Saringan halaman dan CSV realisasi anggaran: tahun (bawaan tahun ini, WIB), bulan 1 sampai 12 (kosong = setahun), dan
// versi anggaran tertentu (kosong = yang berlaku).
import { hariIni } from '@/lib/stok/dokumen'

export type QueryRealisasi = { tahun?: string; bulan?: string; anggaran?: string }

export function saringRealisasi(q: QueryRealisasi) {
  const kini = Number(hariIni().toISOString().slice(0, 4))
  const tahun = q.tahun && /^\d{4}$/.test(q.tahun) && Number(q.tahun) >= 2000 && Number(q.tahun) <= 2100 ? Number(q.tahun) : kini
  const bulan = q.bulan && /^\d{1,2}$/.test(q.bulan) && Number(q.bulan) >= 1 && Number(q.bulan) <= 12 ? Number(q.bulan) : null
  const anggaranId = q.anggaran && /^\d{1,9}$/.test(q.anggaran) ? Number(q.anggaran) : null
  return { tahun, bulan, anggaranId }
}

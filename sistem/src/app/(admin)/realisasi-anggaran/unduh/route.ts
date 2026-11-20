// Unduh CSV realisasi lawan anggaran per akun per bulan, dengan saringan yang sama dengan halamannya. Izin Lihat
// anggaran.anggaran.
import type { NextRequest } from 'next/server'
import { csvRealisasi, realisasiAnggaran } from '@/lib/anggaran/realisasi'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { saringRealisasi } from '../saring'

export async function GET(req: NextRequest) {
  await wajibIzin('anggaran.anggaran', 'L')
  const s = saringRealisasi(Object.fromEntries(req.nextUrl.searchParams))
  const h = await realisasiAnggaran(db, s.tahun, { bulan: s.bulan, anggaranId: s.anggaranId })
  return new Response(csvRealisasi(h), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="realisasi-anggaran_${s.tahun}${s.bulan ? `-${String(s.bulan).padStart(2, '0')}` : ''}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

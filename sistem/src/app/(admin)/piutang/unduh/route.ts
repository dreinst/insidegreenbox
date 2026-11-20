// Unduh CSV dokumen piutang pelanggan dengan saringan pelanggan yang sama dengan halamannya. Izin Lihat kas.piutang.
import type { NextRequest } from 'next/server'
import { csvPiutang, piutangPelanggan } from '@/lib/b2b/piutang'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { tanggalIso } from '@/lib/waktu'

export async function GET(req: NextRequest) {
  await wajibIzin('kas.piutang', 'L')
  const pelanggan = req.nextUrl.searchParams.get('pelanggan')?.slice(0, 12) ?? undefined
  const h = await piutangPelanggan(db, { pelanggan })
  return new Response(csvPiutang(h.dokumen), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="piutang-pelanggan_${tanggalIso(new Date())}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

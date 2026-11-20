// Unduh CSV dokumen hutang pemasok dengan saringan pemasok yang sama dengan halamannya. Izin Lihat kas.hutang.
import type { NextRequest } from 'next/server'
import { csvHutang, hutangPemasok } from '@/lib/beli/hutang'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { tanggalIso } from '@/lib/waktu'

export async function GET(req: NextRequest) {
  await wajibIzin('kas.hutang', 'L')
  const pemasok = req.nextUrl.searchParams.get('pemasok')?.slice(0, 12) ?? undefined
  const h = await hutangPemasok(db, { pemasok })
  return new Response(csvHutang(h.dokumen), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="hutang-pemasok_${tanggalIso(new Date())}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

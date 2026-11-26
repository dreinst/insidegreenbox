// Melayani bukti setor satu setoran. Butuh izin Lihat Setoran POS; berkasnya di folder unggahan (KONTRAK 11).
import { readFile } from 'node:fs/promises'
import type { NextRequest } from 'next/server'
import { buktiSah, jalurBukti, TIPE_BUKTI } from '@/lib/bukti'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await wajibIzin('kasir.setoran', 'L')
  const id = Number((await ctx.params).id)
  if (!Number.isInteger(id) || id <= 0) return new Response(null, { status: 404 })
  const st = await db.posSettlement.findUnique({ where: { id }, select: { no: true, proofFile: true } })
  if (!st || !buktiSah(st.proofFile)) return new Response(null, { status: 404 })
  const ext = st.proofFile.split('.').pop()!
  try {
    const isi = await readFile(jalurBukti(st.proofFile)!)
    return new Response(new Uint8Array(isi), {
      headers: {
        'Content-Type': TIPE_BUKTI[ext],
        // PDF diunduh supaya tidak dibuka di bawah CSP halaman; foto ditampilkan langsung.
        'Content-Disposition': `${ext === 'pdf' ? 'attachment' : 'inline'}; filename="bukti-${st.no}.${ext}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}

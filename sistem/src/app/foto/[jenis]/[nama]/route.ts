// Melayani foto menu: /foto/img/<nama>.webp dari foto situs dan /foto/unggahan/<berkas> dari folder unggahan.
// Berkas di folder unggahan tidak di dalam public/, jadi harus lewat route ini (Next tidak melayani berkas baru di public/ saat jalan).
import { readFile } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { jalurFoto, tipeFoto } from '@/lib/foto'
import { penggunaSaatIni } from '@/lib/sesi'

export async function GET(_req: Request, ctx: { params: Promise<{ jenis: string; nama: string }> }) {
  if (!(await penggunaSaatIni())) return new NextResponse(null, { status: 401 })
  const { jenis, nama } = await ctx.params
  const jalur = jalurFoto(jenis, nama)
  if (!jalur) return new NextResponse(null, { status: 404 })
  try {
    const isi = await readFile(jalur)
    return new NextResponse(new Uint8Array(isi), { headers: { 'Content-Type': tipeFoto(nama), 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}

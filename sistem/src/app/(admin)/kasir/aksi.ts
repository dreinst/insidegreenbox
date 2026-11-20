'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { GalatAturan, type HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { cariMember, simpanPenjualan } from '@/lib/penjualan'
import { konteksPermintaan, penggunaSaatIni } from '@/lib/sesi'
import { normalisasiWa } from '@/lib/wa'

// Isi keranjang dikirim sebagai JSON di kolom "data"; harga, potongan, pajak, dan service dihitung ulang di server.
export async function simpanPenjualanAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.layar', 'T', async (p) => {
    let isi: unknown
    try {
      isi = JSON.parse(String(fd.get('data') ?? ''))
    } catch {
      throw new GalatAturan('Isi keranjang tidak terbaca. Muat ulang layar kasir.')
    }
    const j = await simpanPenjualan(db, await konteksPermintaan(p), p, isi)
    revalidatePath('/transaksi')
    redirect(`/kasir?selesai=${j.id}`)
  })
}

export type HasilCariMember = { ok: true; member: { id: number; name: string; tingkat: string; persen: number } } | { ok: false; pesan: string }

export async function cariMemberAksi(wa: string): Promise<HasilCariMember> {
  const p = await penggunaSaatIni()
  if (!p || !punyaIzin(p.izin, 'kasir.layar', 'T')) return { ok: false, pesan: 'Kamu tidak punya izin untuk tindakan ini.' }
  const teks = String(wa ?? '').slice(0, 30)
  if (!normalisasiWa(teks)) return { ok: false, pesan: 'Nomor WhatsApp tidak sah. Pakai nomor seluler, misalnya 0812 3456 7890.' }
  const m = await cariMember(db, teks)
  return m ? { ok: true, member: m } : { ok: false, pesan: 'Nomor ini belum terdaftar sebagai member aktif.' }
}

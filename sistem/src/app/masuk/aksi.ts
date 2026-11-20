'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { PESAN_MASUK, cobaMasuk } from '@/lib/masuk'
import { konteksPermintaan, pasangCookieSesi } from '@/lib/sesi'

const skema = z.object({
  username: z.string().trim().min(1, 'Isi nama pengguna.').max(64, 'Nama pengguna terlalu panjang.'),
  password: z.string().min(1, 'Isi sandi.').max(200, 'Sandi terlalu panjang.'),
  ke: z.string().optional(),
})

// Tujuan sesudah masuk hanya jalur di app ini, supaya tidak bisa dipakai mengalihkan ke situs lain.
const tujuanAman = (ke?: string) => (ke && ke.startsWith('/') && !ke.startsWith('//') && !ke.startsWith('/\\') ? ke : '/')

export async function masukAksi(sebelum: HasilAksi, fd: FormData): Promise<HasilAksi> {
  const n = (sebelum?.n ?? 0) + 1
  const data = skema.safeParse(Object.fromEntries(fd))
  const username = String(fd.get('username') ?? '')
  if (!data.success) {
    const galat: Record<string, string> = {}
    for (const i of data.error.issues) galat[String(i.path[0])] ??= i.message
    return { ok: false, pesan: Object.values(galat)[0], galat, isian: { username }, n }
  }
  const k = await konteksPermintaan(null, data.data.username)
  const hasil = await cobaMasuk(db, { username: data.data.username, password: data.data.password, ip: k.ip, userAgent: k.userAgent })
  if (!hasil.ok) return { ok: false, pesan: PESAN_MASUK[hasil.alasan], isian: { username }, n }
  await pasangCookieSesi(hasil.sesiId, hasil.kedaluwarsa)
  redirect(tujuanAman(data.data.ke))
}

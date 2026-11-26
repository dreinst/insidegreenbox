'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { matriksDariForm, simpanIzinPeran, tambahPeran, ubahPeran, ubahStatusPeran } from '@/lib/peran'
import { konteksPermintaan } from '@/lib/sesi'

export async function tambahPeranAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'atur.peran', 'T', async (p) => {
    const r = await tambahPeran(db, await konteksPermintaan(p), p, { code: fd.get('code'), name: fd.get('name'), salinDari: fd.get('salinDari') || undefined })
    revalidatePath('/peran')
    redirect(`/peran/${r.id}?pesan=dibuat`)
  })
}

export async function ubahPeranAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'atur.peran', 'U', async (p) => {
    await ubahPeran(db, await konteksPermintaan(p), p, id, { name: fd.get('name') })
    revalidatePath('/peran')
    redirect(`/peran/${id}?pesan=tersimpan`)
  })
}

export async function statusPeranAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'atur.peran', 'U', async (p) => {
    await ubahStatusPeran(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/peran')
    redirect(`/peran/${id}?pesan=${aktif ? 'aktif' : 'nonaktif-peran'}`)
  })
}

export async function izinPeranAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'atur.peran', 'U', async (p) => {
    const n = await simpanIzinPeran(db, await konteksPermintaan(p), p, id, matriksDariForm(fd))
    revalidatePath('/peran')
    redirect(`/peran/${id}?pesan=${n ? 'tersimpan' : 'tetap'}`)
  })
}

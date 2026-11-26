'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { konteksPermintaan } from '@/lib/sesi'
import { tambahLokasi, ubahLokasi, ubahStatusLokasi } from '@/lib/stok/lokasi'

const MENU = 'atur.lokasi'
const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function tambahLokasiAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    const l = await tambahLokasi(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/lokasi')
    redirect(`/lokasi/${l.id}?pesan=dibuat`)
  })
}

export async function ubahLokasiAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const berubah = await ubahLokasi(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/lokasi')
    redirect(`/lokasi/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusLokasiAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    await ubahStatusLokasi(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/lokasi')
    redirect(`/lokasi/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

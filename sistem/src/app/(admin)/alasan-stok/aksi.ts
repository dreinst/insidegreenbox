'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { konteksPermintaan } from '@/lib/sesi'
import { tambahAlasan, ubahAlasan, ubahStatusAlasan } from '@/lib/stok/alasan'

const MENU = 'stok.alasan'
const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function tambahAlasanAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    await tambahAlasan(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/alasan-stok')
    redirect('/alasan-stok?pesan=dibuat')
  })
}

export async function ubahAlasanAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const berubah = await ubahAlasan(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/alasan-stok')
    redirect(`/alasan-stok/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusAlasanAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    await ubahStatusAlasan(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/alasan-stok')
    redirect(`/alasan-stok/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { simpanPemetaan, tambahAkun, ubahAkun, ubahStatusAkun } from '@/lib/akuntansi/akun'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { konteksPermintaan } from '@/lib/sesi'

const MENU = 'akun.coa'
const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function tambahAkunAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    const a = await tambahAkun(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/akun')
    redirect(`/akun/${a.id}?pesan=dibuat`)
  })
}

export async function ubahAkunAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const { berubah } = await ubahAkun(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/akun')
    redirect(`/akun/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusAkunAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    await ubahStatusAkun(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/akun')
    redirect(`/akun/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

export async function simpanPemetaanAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const { berubah } = await simpanPemetaan(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/akun')
    redirect(`/akun/pemetaan?pesan=${berubah ? 'pemetaan' : 'tetap'}`)
  })
}

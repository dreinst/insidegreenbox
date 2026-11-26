'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { aturUlangSandi, tambahPengguna, ubahPengguna, ubahStatusPengguna } from '@/lib/pengguna'
import { konteksPermintaan } from '@/lib/sesi'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function tambahPenggunaAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'atur.pengguna', 'T', async (p) => {
    const u = await tambahPengguna(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/pengguna')
    redirect(`/pengguna/${u.id}?pesan=dibuat`)
  })
}

export async function ubahPenggunaAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'atur.pengguna', 'U', async (p) => {
    const { berubah } = await ubahPengguna(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/pengguna')
    redirect(`/pengguna/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function sandiPenggunaAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'atur.pengguna', 'U', async (p) => {
    await aturUlangSandi(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`/pengguna/${id}?pesan=sandi`)
  })
}

export async function statusPenggunaAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'atur.pengguna', 'U', async (p) => {
    await ubahStatusPengguna(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/pengguna')
    redirect(`/pengguna/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

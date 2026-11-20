'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { hapusBahan, simpanBahan, tambahResep, ubahResep, ubahStatusResep, type JenisResep } from '@/lib/produksi/resep'
import { konteksPermintaan } from '@/lib/sesi'

const MENU = 'stok.resep'
const JALUR = '/resep'
const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function tambahResepAksi(kind: JenisResep, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    const r = await tambahResep(db, await konteksPermintaan(p), p, { ...data(fd), kind })
    revalidatePath(JALUR)
    redirect(`${JALUR}/${r.id}?pesan=dibuat`)
  })
}

export async function ubahResepAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const berubah = await ubahResep(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath(JALUR)
    redirect(`${JALUR}/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function simpanBahanAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    await simpanBahan(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath(JALUR)
    redirect(`${JALUR}/${id}?pesan=bahan`)
  })
}

export async function hapusBahanAksi(id: number, baris: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    await hapusBahan(db, await konteksPermintaan(p), p, id, baris)
    revalidatePath(JALUR)
    redirect(`${JALUR}/${id}?pesan=bahan_hapus`)
  })
}

export async function statusResepAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    await ubahStatusResep(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath(JALUR)
    redirect(`${JALUR}/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

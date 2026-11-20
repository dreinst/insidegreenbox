'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { tambahMetode, ubahMetode, ubahStatusMetode } from '@/lib/metode-bayar'
import { konteksPermintaan } from '@/lib/sesi'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function tambahMetodeAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'akun.metode_bayar', 'T', async (p) => {
    const m = await tambahMetode(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/metode-bayar')
    redirect(`/metode-bayar/${m.id}?pesan=dibuat`)
  })
}

export async function ubahMetodeAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'akun.metode_bayar', 'U', async (p) => {
    const { berubah } = await ubahMetode(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/metode-bayar')
    redirect(`/metode-bayar/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusMetodeAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'akun.metode_bayar', 'U', async (p) => {
    await ubahStatusMetode(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/metode-bayar')
    redirect(`/metode-bayar/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

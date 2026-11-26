'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { tambahRekening, ubahRekening, ubahStatusRekening } from '@/lib/rekening'
import { konteksPermintaan } from '@/lib/sesi'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function tambahRekeningAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kas.rekening', 'T', async (p) => {
    const r = await tambahRekening(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/rekening')
    redirect(`/rekening/${r.id}?pesan=dibuat`)
  })
}

export async function ubahRekeningAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kas.rekening', 'U', async (p) => {
    const { berubah } = await ubahRekening(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/rekening')
    redirect(`/rekening/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusRekeningAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kas.rekening', 'U', async (p) => {
    await ubahStatusRekening(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/rekening')
    redirect(`/rekening/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

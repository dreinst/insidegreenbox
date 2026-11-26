'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { tambahPromo, ubahPromo, ubahStatusPromo } from '@/lib/promo'
import { konteksPermintaan } from '@/lib/sesi'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function tambahPromoAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.promo', 'T', async (p) => {
    const x = await tambahPromo(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/promo')
    redirect(`/promo/${x.id}?pesan=dibuat`)
  })
}

export async function ubahPromoAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.promo', 'U', async (p) => {
    const { berubah } = await ubahPromo(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/promo')
    redirect(`/promo/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusPromoAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.promo', 'U', async (p) => {
    await ubahStatusPromo(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/promo')
    redirect(`/promo/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { aturPin, hapusPin } from '@/lib/pin'
import { konteksPermintaan } from '@/lib/sesi'

export async function aturPinAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.pin', 'U', async (p) => {
    await aturPin(db, await konteksPermintaan(p), p, id, { pin: String(fd.get('pin') ?? ''), ulangiPin: String(fd.get('ulangiPin') ?? '') })
    revalidatePath('/pin')
    redirect(`/pin/${id}?pesan=pin`)
  })
}

export async function hapusPinAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.pin', 'U', async (p) => {
    await hapusPin(db, await konteksPermintaan(p), p, id)
    revalidatePath('/pin')
    redirect(`/pin/${id}?pesan=pin-hapus`)
  })
}

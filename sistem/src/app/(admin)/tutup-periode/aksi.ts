'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { bukaPeriode, tutupPeriode } from '@/lib/akuntansi/periode'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { konteksPermintaan } from '@/lib/sesi'

const MENU = 'akun.tutup_periode'

export async function tutupPeriodeAksi(bulan: string, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    await tutupPeriode(db, await konteksPermintaan(p), p, bulan)
    revalidatePath('/tutup-periode')
    redirect(`/tutup-periode?pesan=tutup&bulan=${bulan}`)
  })
}

export async function bukaPeriodeAksi(bulan: string, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'H', async (p) => {
    await bukaPeriode(db, await konteksPermintaan(p), p, bulan, { alasan: String(fd.get('alasan') ?? '') })
    revalidatePath('/tutup-periode')
    redirect(`/tutup-periode?pesan=buka&bulan=${bulan}`)
  })
}

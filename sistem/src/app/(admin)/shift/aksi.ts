'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { konteksPermintaan } from '@/lib/sesi'
import { bukaShift, catatKasLaci, isiAlasanSelisih, setujuiShift, tutupShift } from '@/lib/shift'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function bukaShiftAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.shift', 'T', async (p) => {
    const s = await bukaShift(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/shift')
    redirect(`/shift/${s.id}?pesan=shift-buka`)
  })
}

export async function kasLaciAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.shift', 'U', async (p) => {
    const m = await catatKasLaci(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath(`/shift/${id}`)
    redirect(`/shift/${id}?pesan=shift-kas&gerak=${m.id}`)
  })
}

export async function tutupShiftAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.shift', 'U', async (p) => {
    await tutupShift(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/shift')
    redirect(`/shift/${id}?pesan=shift-tutup`)
  })
}

// tahap 6C: alasan selisih diisi sesudah shift ditutup.
export async function alasanShiftAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.shift', 'U', async (p) => {
    await isiAlasanSelisih(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/shift')
    redirect(`/shift/${id}?pesan=shift-alasan`)
  })
}

export async function setujuiShiftAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.shift', 'S', async (p) => {
    await setujuiShift(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/shift')
    redirect(`/shift/${id}?pesan=shift-setuju`)
  })
}

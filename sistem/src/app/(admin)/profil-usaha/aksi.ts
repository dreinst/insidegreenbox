'use server'
// Aksi Profil Usaha (tahap 6A). Izin Ubah atur.lokasi dicek lagi di ubahProfil.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { bacaPilihanFoto } from '@/lib/foto'
import { jalankanAksi } from '@/lib/izin'
import { ubahProfil } from '@/lib/profil'
import { konteksPermintaan } from '@/lib/sesi'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k, v]) => !k.startsWith('$') && typeof v === 'string'))

export async function ubahProfilAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'atur.lokasi', 'U', async (p) => {
    const n = await ubahProfil(db, await konteksPermintaan(p), p, id, data(fd), bacaPilihanFoto(fd, 'receiptLogo', 'fotoUnggah'))
    revalidatePath('/profil-usaha')
    revalidatePath('/kasir')
    redirect(`/profil-usaha?pesan=${n ? 'tersimpan' : 'tetap'}`)
  })
}

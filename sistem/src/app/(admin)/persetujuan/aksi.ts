'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { simpanAturan } from '@/lib/persetujuan'
import { konteksPermintaan } from '@/lib/sesi'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function simpanAturanAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'atur.persetujuan', 'U', async (p) => {
    const n = await simpanAturan(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/persetujuan')
    redirect(`/persetujuan?pesan=${n ? 'tersimpan' : 'tetap'}`)
  })
}

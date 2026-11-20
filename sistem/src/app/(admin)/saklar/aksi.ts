'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { saklarDariForm, simpanSaklarPeran } from '@/lib/peran'
import { konteksPermintaan } from '@/lib/sesi'

export async function simpanSaklarAksi(roleId: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'atur.saklar', 'U', async (p) => {
    const n = await simpanSaklarPeran(db, await konteksPermintaan(p), p, roleId, await saklarDariForm(db, fd))
    revalidatePath('/saklar')
    redirect(`/saklar?peran=${roleId}&pesan=${n ? 'tersimpan' : 'tetap'}`)
  })
}

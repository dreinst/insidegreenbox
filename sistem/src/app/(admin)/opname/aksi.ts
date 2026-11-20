'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { konteksPermintaan } from '@/lib/sesi'
import type { AksiStatus } from '@/lib/stok/dokumen'
import { buatOpname, hapusOpname, simpanHitungan, ubahStatusOpname } from '@/lib/stok/opname'

const MENU = 'stok.opname'
const JALUR = '/opname'
const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function buatOpnameAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    const d = await buatOpname(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath(JALUR)
    redirect(`${JALUR}/${d.id}?pesan=dibuat`)
  })
}

export async function simpanHitunganAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'L', async (p) => {
    const berubah = await simpanHitungan(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`${JALUR}/${id}?pesan=${berubah ? 'hitungan' : 'tetap'}`)
  })
}

export async function statusOpnameAksi(id: number, aksi: AksiStatus, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, aksi === 'posting' ? 'P' : 'L', async (p) => {
    const lama = aksi === 'batal' ? (await db.stockOpname.findUnique({ where: { id }, select: { status: true } }))?.status : null
    await ubahStatusOpname(db, await konteksPermintaan(p), p, id, aksi, { alasan: String(fd.get('alasan') ?? '') })
    revalidatePath(JALUR)
    redirect(`${JALUR}/${id}?pesan=${aksi === 'batal' && lama === 'Diposting' ? 'batal_posting' : aksi}`)
  })
}

export async function hapusOpnameAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'H', async (p) => {
    await hapusOpname(db, await konteksPermintaan(p), p, id)
    revalidatePath(JALUR)
    redirect(`${JALUR}?pesan=dihapus`)
  })
}

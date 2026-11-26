'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { buatHasil, hapusHasil, ubahKepalaHasil, ubahStatusHasil } from '@/lib/produksi/hasil'
import { konteksPermintaan } from '@/lib/sesi'
import type { AksiStatus } from '@/lib/stok/dokumen'

// Cek awal jalankanAksi memakai izin Lihat untuk tindakan yang boleh T atau U; modul memeriksa izin rinciannya.
const MENU = 'produksi.hasil'
const JALUR = '/hasil-produksi'
const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function buatHasilAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    const d = await buatHasil(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath(JALUR)
    redirect(`${JALUR}/${d.id}?pesan=draf`)
  })
}

export async function ubahKepalaHasilAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'L', async (p) => {
    const berubah = await ubahKepalaHasil(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`${JALUR}/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusHasilAksi(id: number, aksi: AksiStatus, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, aksi === 'posting' ? 'P' : 'L', async (p) => {
    const lama = aksi === 'batal' ? (await db.productionResult.findUnique({ where: { id }, select: { status: true } }))?.status : null
    await ubahStatusHasil(db, await konteksPermintaan(p), p, id, aksi, { alasan: String(fd.get('alasan') ?? '') })
    revalidatePath(JALUR)
    revalidatePath('/perintah-produksi')
    redirect(`${JALUR}/${id}?pesan=${aksi === 'batal' && lama === 'Diposting' ? 'batal_posting' : aksi}`)
  })
}

export async function hapusHasilAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'H', async (p) => {
    await hapusHasil(db, await konteksPermintaan(p), p, id)
    revalidatePath(JALUR)
    redirect(`${JALUR}?pesan=dihapus`)
  })
}

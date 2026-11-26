'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { buatMemorial, hapusBarisMemorial, hapusMemorial, tambahBarisMemorial, ubahKepalaMemorial, ubahStatusMemorial, type AksiMemorial } from '@/lib/akuntansi/memorial'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { konteksPermintaan } from '@/lib/sesi'

// Cek awal jalankanAksi memakai izin Lihat untuk tindakan yang boleh T atau U; modul memeriksa izin rinciannya.
const MENU = 'akun.jurnal'
const JALUR = '/jurnal'
const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function buatMemorialAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    const j = await buatMemorial(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath(JALUR)
    redirect(`${JALUR}/${j.id}?pesan=draf`)
  })
}

export async function ubahKepalaMemorialAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'L', async (p) => {
    const { berubah } = await ubahKepalaMemorial(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`${JALUR}/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function tambahBarisMemorialAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'L', async (p) => {
    await tambahBarisMemorial(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`${JALUR}/${id}?pesan=baris`)
  })
}

export async function hapusBarisMemorialAksi(id: number, baris: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'L', async (p) => {
    await hapusBarisMemorial(db, await konteksPermintaan(p), p, id, baris)
    redirect(`${JALUR}/${id}?pesan=baris_hapus`)
  })
}

export async function statusMemorialAksi(id: number, aksi: AksiMemorial, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, aksi === 'posting' ? 'P' : 'L', async (p) => {
    const lama = aksi === 'batal' ? (await db.journal.findUnique({ where: { id }, select: { status: true } }))?.status : null
    await ubahStatusMemorial(db, await konteksPermintaan(p), p, id, aksi, { alasan: String(fd.get('alasan') ?? '') })
    revalidatePath(JALUR)
    redirect(`${JALUR}/${id}?pesan=${aksi === 'batal' && lama === 'Diposting' ? 'batal_posting' : aksi}`)
  })
}

export async function hapusMemorialAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'H', async (p) => {
    await hapusMemorial(db, await konteksPermintaan(p), p, id)
    revalidatePath(JALUR)
    redirect(`${JALUR}?pesan=dihapus`)
  })
}

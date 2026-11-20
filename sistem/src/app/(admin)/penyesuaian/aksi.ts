'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { konteksPermintaan } from '@/lib/sesi'
import type { AksiStatus } from '@/lib/stok/dokumen'
import { buatPenyesuaian, hapusBarisPenyesuaian, hapusPenyesuaian, tambahBarisPenyesuaian, ubahKepalaPenyesuaian, ubahStatusPenyesuaian } from '@/lib/stok/penyesuaian'

// Cek awal jalankanAksi memakai izin Lihat untuk tindakan yang boleh T atau U; modul memeriksa izin rinciannya.
const MENU = 'stok.penyesuaian'
const JALUR = '/penyesuaian'
const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function buatPenyesuaianAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    const d = await buatPenyesuaian(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath(JALUR)
    redirect(`${JALUR}/${d.id}?pesan=draf`)
  })
}

export async function ubahKepalaPenyesuaianAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'L', async (p) => {
    const berubah = await ubahKepalaPenyesuaian(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`${JALUR}/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function tambahBarisPenyesuaianAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'L', async (p) => {
    await tambahBarisPenyesuaian(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`${JALUR}/${id}?pesan=baris`)
  })
}

export async function hapusBarisPenyesuaianAksi(id: number, baris: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'L', async (p) => {
    await hapusBarisPenyesuaian(db, await konteksPermintaan(p), p, id, baris)
    redirect(`${JALUR}/${id}?pesan=baris_hapus`)
  })
}

export async function statusPenyesuaianAksi(id: number, aksi: AksiStatus, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, aksi === 'posting' ? 'P' : 'L', async (p) => {
    const lama = aksi === 'batal' ? (await db.stockAdjustment.findUnique({ where: { id }, select: { status: true } }))?.status : null
    await ubahStatusPenyesuaian(db, await konteksPermintaan(p), p, id, aksi, { alasan: String(fd.get('alasan') ?? '') })
    revalidatePath(JALUR)
    redirect(`${JALUR}/${id}?pesan=${aksi === 'batal' && lama === 'Diposting' ? 'batal_posting' : aksi}`)
  })
}

export async function hapusPenyesuaianAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'H', async (p) => {
    await hapusPenyesuaian(db, await konteksPermintaan(p), p, id)
    revalidatePath(JALUR)
    redirect(`${JALUR}?pesan=dihapus`)
  })
}

'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { konteksPermintaan } from '@/lib/sesi'
import type { AksiStatus } from '@/lib/stok/dokumen'
import { buatPindah, hapusBarisPindah, hapusPindah, tambahBarisPindah, ubahKepalaPindah, ubahStatusPindah } from '@/lib/stok/pindah'

const MENU = 'stok.pindah'
const JALUR = '/pindah-stok'
const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function buatPindahAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    const d = await buatPindah(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath(JALUR)
    redirect(`${JALUR}/${d.id}?pesan=draf`)
  })
}

export async function ubahKepalaPindahAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'L', async (p) => {
    const berubah = await ubahKepalaPindah(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`${JALUR}/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function tambahBarisPindahAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'L', async (p) => {
    await tambahBarisPindah(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`${JALUR}/${id}?pesan=baris`)
  })
}

export async function hapusBarisPindahAksi(id: number, baris: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'L', async (p) => {
    await hapusBarisPindah(db, await konteksPermintaan(p), p, id, baris)
    redirect(`${JALUR}/${id}?pesan=baris_hapus`)
  })
}

export async function statusPindahAksi(id: number, aksi: AksiStatus, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, aksi === 'posting' ? 'P' : 'L', async (p) => {
    const lama = aksi === 'batal' ? (await db.stockTransfer.findUnique({ where: { id }, select: { status: true } }))?.status : null
    await ubahStatusPindah(db, await konteksPermintaan(p), p, id, aksi, { alasan: String(fd.get('alasan') ?? '') })
    revalidatePath(JALUR)
    redirect(`${JALUR}/${id}?pesan=${aksi === 'batal' && lama === 'Diposting' ? 'batal_posting' : aksi}`)
  })
}

export async function hapusPindahAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'H', async (p) => {
    await hapusPindah(db, await konteksPermintaan(p), p, id)
    revalidatePath(JALUR)
    redirect(`${JALUR}?pesan=dihapus`)
  })
}

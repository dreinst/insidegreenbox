'use server'
// Aksi server Kas Masuk, Kas Keluar, dan Pindah Dana (tahap 5C). Tipis: jalankanAksi memeriksa sesi dan izin awal, lalu
// fungsi di src/lib/kas.ts memeriksa izin rinci, saklar, dan aturan di dalam transaksinya.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { buatKas, buatPindah, hapusBarisKas, hapusKas, tambahBarisKas, ubahKepalaKas, ubahPindah, ubahStatusKas, type AksiKas } from '@/lib/kas'
import { konteksPermintaan } from '@/lib/sesi'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, typeof v === 'string' ? v : '']))
const jalur = (pindah: boolean) => (pindah ? '/pindah-dana' : '/kas')
const menu = (pindah: boolean) => (pindah ? 'kas.pindah' : 'kas.transaksi')

export async function buatKasAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kas.transaksi', 'T', async (p) => {
    const c = await buatKas(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/kas')
    redirect(`/kas/${c.id}?pesan=draf`)
  })
}

export async function ubahKepalaKasAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kas.transaksi', 'L', async (p) => {
    const n = await ubahKepalaKas(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`/kas/${id}?pesan=${n ? 'tersimpan' : 'tetap'}`)
  })
}

export async function tambahBarisKasAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kas.transaksi', 'L', async (p) => {
    await tambahBarisKas(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`/kas/${id}?pesan=baris`)
  })
}

export async function hapusBarisKasAksi(id: number, baris: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kas.transaksi', 'L', async (p) => {
    await hapusBarisKas(db, await konteksPermintaan(p), p, id, baris)
    redirect(`/kas/${id}?pesan=baris_hapus`)
  })
}

export async function buatPindahAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kas.pindah', 'T', async (p) => {
    const c = await buatPindah(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/pindah-dana')
    redirect(`/pindah-dana/${c.id}?pesan=draf`)
  })
}

export async function ubahPindahAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kas.pindah', 'L', async (p) => {
    const n = await ubahPindah(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`/pindah-dana/${id}?pesan=${n ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusKasAksi(pindah: boolean, id: number, aksi: AksiKas, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, menu(pindah), 'L', async (p) => {
    const alasan = String(fd.get('alasan') ?? '')
    const dari = (await db.cashTransaction.findUnique({ where: { id }, select: { status: true } }))?.status
    await ubahStatusKas(db, await konteksPermintaan(p), p, id, aksi, { alasan })
    revalidatePath(jalur(pindah))
    redirect(`${jalur(pindah)}/${id}?pesan=${aksi === 'batal' && dari === 'Diposting' ? 'batal_posting' : aksi}`)
  })
}

export async function hapusKasAksi(pindah: boolean, id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, menu(pindah), 'H', async (p) => {
    await hapusKas(db, await konteksPermintaan(p), p, id)
    revalidatePath(jalur(pindah))
    redirect(`${jalur(pindah)}?pesan=dihapus`)
  })
}

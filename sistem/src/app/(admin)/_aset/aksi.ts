'use server'
// Aksi server aset tetap, penyusutan, pelepasan, dan anggaran tahap 6B. Tipis: cek sesi dan izin awal lewat
// jalankanAksi, lalu fungsi modul di src/lib/aset dan src/lib/anggaran yang memeriksa izin rinci, saklar, dan aturan di
// dalam transaksinya sendiri (KONTRAK 6).
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { batalAnggaran, buatAnggaran, hapusAkunAnggaran, hapusAnggaran, MENU_ANGGARAN, revisiAnggaran, setujuiAnggaran, simpanRincianAnggaran, tambahAkunAnggaran, ubahKepalaAnggaran } from '@/lib/anggaran/anggaran'
import { aktifkanAset, batalkanAset, hapusAset, tambahAset, ubahAset } from '@/lib/aset/aset'
import { MENU_ASET, tambahKategoriAset, ubahKategoriAset, ubahStatusKategoriAset } from '@/lib/aset/kategori'
import { batalPelepasan, buatPelepasan, hapusPelepasan, postingPelepasan, ubahPelepasan } from '@/lib/aset/pelepasan'
import { batalPenyusutan, hitungPenyusutan, MENU_SUSUT } from '@/lib/aset/penyusutan'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import type { Pengguna } from '@/lib/izin-inti'
import { konteksPermintaan } from '@/lib/sesi'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([kunci]) => !kunci.startsWith('$')).map(([kunci, v]) => [kunci, typeof v === 'string' ? v : '']))
const k = (p: Pengguna) => konteksPermintaan(p)
const alasan = (fd: FormData) => String(fd.get('alasan') ?? '')

// ===== Kategori aset =====
export async function tambahKategoriAsetAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ASET, 'T', async (p) => {
    await tambahKategoriAset(db, await k(p), p, data(fd))
    revalidatePath('/aset/kategori')
    redirect('/aset/kategori?pesan=dibuat')
  })
}
export async function ubahKategoriAsetAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ASET, 'U', async (p) => {
    const n = await ubahKategoriAset(db, await k(p), p, id, data(fd))
    revalidatePath('/aset/kategori')
    redirect(`/aset/kategori/${id}?pesan=${n ? 'tersimpan' : 'tetap'}`)
  })
}
export async function statusKategoriAsetAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ASET, 'U', async (p) => {
    await ubahStatusKategoriAset(db, await k(p), p, id, aktif)
    revalidatePath('/aset/kategori')
    redirect(`/aset/kategori/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

// ===== Aset =====
export async function tambahAsetAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ASET, 'T', async (p) => {
    const a = await tambahAset(db, await k(p), p, data(fd))
    revalidatePath('/aset')
    redirect(`/aset/${a.id}?pesan=draf`)
  })
}
export async function ubahAsetAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ASET, 'U', async (p) => {
    const n = await ubahAset(db, await k(p), p, id, data(fd))
    revalidatePath('/aset')
    redirect(`/aset/${id}?pesan=${n ? 'tersimpan' : 'tetap'}`)
  })
}
export async function hapusAsetAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ASET, 'H', async (p) => {
    await hapusAset(db, await k(p), p, id)
    revalidatePath('/aset')
    redirect('/aset?pesan=dihapus')
  })
}
export async function aktifkanAsetAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ASET, 'S', async (p) => {
    await aktifkanAset(db, await k(p), p, id)
    revalidatePath('/aset')
    redirect(`/aset/${id}?pesan=diaktifkan`)
  })
}
export async function batalAsetAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ASET, 'S', async (p) => {
    await batalkanAset(db, await k(p), p, id, alasan(fd))
    revalidatePath('/aset')
    redirect(`/aset/${id}?pesan=dibatalkan`)
  })
}

// ===== Penyusutan =====
export async function hitungPenyusutanAksi(bulan: string, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_SUSUT, 'P', async (p) => {
    const r = await hitungPenyusutan(db, await k(p), p, { bulan })
    revalidatePath('/penyusutan')
    revalidatePath('/aset')
    redirect(`/penyusutan/${r.id}?pesan=dihitung`)
  })
}
export async function batalPenyusutanAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_SUSUT, 'P', async (p) => {
    await batalPenyusutan(db, await k(p), p, id, alasan(fd))
    revalidatePath('/penyusutan')
    revalidatePath('/aset')
    redirect(`/penyusutan/${id}?pesan=dibatalkan`)
  })
}

// ===== Pelepasan =====
export async function buatPelepasanAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_SUSUT, 'T', async (p) => {
    const x = await buatPelepasan(db, await k(p), p, data(fd))
    revalidatePath('/pelepasan-aset')
    redirect(`/pelepasan-aset/${x.id}?pesan=draf`)
  })
}
export async function ubahPelepasanAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_SUSUT, 'T', async (p) => {
    const n = await ubahPelepasan(db, await k(p), p, id, data(fd))
    revalidatePath('/pelepasan-aset')
    redirect(`/pelepasan-aset/${id}?pesan=${n ? 'tersimpan' : 'tetap'}`)
  })
}
export async function hapusPelepasanAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_SUSUT, 'H', async (p) => {
    await hapusPelepasan(db, await k(p), p, id)
    revalidatePath('/pelepasan-aset')
    redirect('/pelepasan-aset?pesan=dihapus')
  })
}
export async function postingPelepasanAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_SUSUT, 'P', async (p) => {
    await postingPelepasan(db, await k(p), p, id)
    revalidatePath('/pelepasan-aset')
    revalidatePath('/aset')
    redirect(`/pelepasan-aset/${id}?pesan=posting`)
  })
}
export async function batalPelepasanAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_SUSUT, 'P', async (p) => {
    await batalPelepasan(db, await k(p), p, id, alasan(fd))
    revalidatePath('/pelepasan-aset')
    revalidatePath('/aset')
    redirect(`/pelepasan-aset/${id}?pesan=dibatalkan`)
  })
}

// ===== Anggaran =====
export async function buatAnggaranAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ANGGARAN, 'T', async (p) => {
    const b = await buatAnggaran(db, await k(p), p, data(fd))
    revalidatePath('/anggaran')
    redirect(`/anggaran/${b.id}?pesan=draf`)
  })
}
export async function ubahKepalaAnggaranAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ANGGARAN, 'L', async (p) => {
    const n = await ubahKepalaAnggaran(db, await k(p), p, id, data(fd))
    revalidatePath('/anggaran')
    redirect(`/anggaran/${id}?pesan=${n ? 'tersimpan' : 'tetap'}`)
  })
}
export async function tambahAkunAnggaranAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ANGGARAN, 'L', async (p) => {
    await tambahAkunAnggaran(db, await k(p), p, id, data(fd))
    revalidatePath(`/anggaran/${id}`)
    redirect(`/anggaran/${id}?pesan=akun`)
  })
}
export async function hapusAkunAnggaranAksi(id: number, accountId: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ANGGARAN, 'L', async (p) => {
    await hapusAkunAnggaran(db, await k(p), p, id, accountId)
    revalidatePath(`/anggaran/${id}`)
    redirect(`/anggaran/${id}?pesan=akun_hapus`)
  })
}
export async function simpanRincianAnggaranAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ANGGARAN, 'L', async (p) => {
    const n = await simpanRincianAnggaran(db, await k(p), p, id, data(fd))
    revalidatePath(`/anggaran/${id}`)
    redirect(`/anggaran/${id}?pesan=${n ? 'rincian' : 'tetap'}`)
  })
}
export async function hapusAnggaranAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ANGGARAN, 'H', async (p) => {
    await hapusAnggaran(db, await k(p), p, id)
    revalidatePath('/anggaran')
    redirect('/anggaran?pesan=dihapus')
  })
}
export async function setujuiAnggaranAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ANGGARAN, 'S', async (p) => {
    await setujuiAnggaran(db, await k(p), p, id)
    revalidatePath('/anggaran')
    revalidatePath('/realisasi-anggaran')
    redirect(`/anggaran/${id}?pesan=disetujui`)
  })
}
export async function batalAnggaranAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ANGGARAN, 'L', async (p) => {
    await batalAnggaran(db, await k(p), p, id, alasan(fd))
    revalidatePath('/anggaran')
    redirect(`/anggaran/${id}?pesan=batal`)
  })
}
export async function revisiAnggaranAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU_ANGGARAN, 'T', async (p) => {
    const b = await revisiAnggaran(db, await k(p), p, id)
    revalidatePath('/anggaran')
    redirect(`/anggaran/${b.id}?pesan=revisi`)
  })
}

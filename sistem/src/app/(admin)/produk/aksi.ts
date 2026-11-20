'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { konteksPermintaan } from '@/lib/sesi'
import {
  hapusKonversi,
  simpanKonversi,
  tambahKategoriProduk,
  tambahProduk,
  tambahSatuan,
  ubahKategoriProduk,
  ubahProduk,
  ubahSatuan,
  ubahStatusKategoriProduk,
  ubahStatusProduk,
  ubahStatusSatuan,
} from '@/lib/stok/produk'

const MENU = 'stok.produk'
const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function tambahProdukAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    const b = await tambahProduk(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/produk')
    redirect(`/produk/${b.id}?pesan=dibuat`)
  })
}

export async function ubahProdukAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const { berubah } = await ubahProduk(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/produk')
    redirect(`/produk/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusProdukAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    await ubahStatusProduk(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/produk')
    redirect(`/produk/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

export async function simpanKonversiAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    await simpanKonversi(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(`/produk/${id}?pesan=konversi`)
  })
}

export async function hapusKonversiAksi(id: number, unitId: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    await hapusKonversi(db, await konteksPermintaan(p), p, id, unitId)
    redirect(`/produk/${id}?pesan=konversi_hapus`)
  })
}

export async function tambahKategoriProdukAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    await tambahKategoriProduk(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/produk/kategori')
    redirect('/produk/kategori?pesan=dibuat')
  })
}

export async function ubahKategoriProdukAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const berubah = await ubahKategoriProduk(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/produk/kategori')
    redirect(`/produk/kategori/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusKategoriProdukAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    await ubahStatusKategoriProduk(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/produk/kategori')
    redirect(`/produk/kategori/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

export async function tambahSatuanAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    await tambahSatuan(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/produk/satuan')
    redirect('/produk/satuan?pesan=dibuat')
  })
}

export async function ubahSatuanAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const berubah = await ubahSatuan(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/produk/satuan')
    redirect(`/produk/satuan/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusSatuanAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    await ubahStatusSatuan(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/produk/satuan')
    redirect(`/produk/satuan/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

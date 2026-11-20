'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { GalatAturan } from '@/lib/aksi'
import { bacaPilihanFoto, tambahKategori, tambahMenu, tambahPaket, terapkanHargaMassal, ubahKategori, ubahMenu, ubahPaket, ubahStatusKategori, ubahStatusMenu, ubahStatusPaket } from '@/lib/menu'
import { konteksPermintaan } from '@/lib/sesi'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function tambahMenuAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.menu', 'T', async (p) => {
    const m = await tambahMenu(db, await konteksPermintaan(p), p, data(fd), bacaPilihanFoto(fd))
    revalidatePath('/menu')
    redirect(`/menu/${m.id}?pesan=dibuat`)
  })
}

export async function ubahMenuAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.menu', 'U', async (p) => {
    const { berubah } = await ubahMenu(db, await konteksPermintaan(p), p, id, data(fd), bacaPilihanFoto(fd))
    revalidatePath('/menu')
    redirect(`/menu/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusMenuAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.menu', 'U', async (p) => {
    await ubahStatusMenu(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/menu')
    redirect(`/menu/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

export async function tambahKategoriAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.menu', 'T', async (p) => {
    await tambahKategori(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/menu', 'layout')
    redirect('/menu/kategori?pesan=dibuat')
  })
}

export async function ubahKategoriAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.menu', 'U', async (p) => {
    const { berubah } = await ubahKategori(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/menu', 'layout')
    redirect(`/menu/kategori/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusKategoriAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.menu', 'U', async (p) => {
    await ubahStatusKategori(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/menu', 'layout')
    redirect(`/menu/kategori/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

export async function tambahPaketAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.menu', 'T', async (p) => {
    const s = await tambahPaket(db, await konteksPermintaan(p), p, data(fd), bacaPilihanFoto(fd))
    revalidatePath('/menu', 'layout')
    redirect(`/menu/paket/${s.id}?pesan=dibuat`)
  })
}

export async function ubahPaketAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.menu', 'U', async (p) => {
    const { berubah } = await ubahPaket(db, await konteksPermintaan(p), p, id, data(fd), bacaPilihanFoto(fd))
    revalidatePath('/menu', 'layout')
    redirect(`/menu/paket/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusPaketAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.menu', 'U', async (p) => {
    await ubahStatusPaket(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/menu', 'layout')
    redirect(`/menu/paket/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

export async function hargaMassalAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.menu', 'U', async (p) => {
    const d = data(fd)
    if (d.konfirmasi !== 'on') throw new GalatAturan('Centang dulu bahwa kamu sudah memeriksa pratinjau harga.', 'konfirmasi')
    await terapkanHargaMassal(db, await konteksPermintaan(p), p, d)
    revalidatePath('/menu', 'layout')
    redirect('/menu/riwayat?pesan=harga')
  })
}

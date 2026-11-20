'use server'
// Aksi server Rekonsiliasi Bank (tahap 5C). jalankanAksi memeriksa sesi dan izin awal kas.rekonsiliasi; fungsi di
// src/lib/rekonsiliasi.ts memeriksa izin rinci dan aturan di dalam transaksinya.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { GalatAturan, type HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { skemaPemetaan } from '@/lib/mutasi-csv'
import {
  batalRekonsiliasi,
  buatRekonsiliasi,
  cocokkan,
  hapusMutasi,
  hapusRekonsiliasi,
  imporMutasi,
  kasDariBarisMutasi,
  lepasCocok,
  muatUlangMutasi,
  postingRekonsiliasi,
  terapkanSaran,
  ubahKepalaRekonsiliasi,
} from '@/lib/rekonsiliasi'
import { konteksPermintaan } from '@/lib/sesi'

const MENU = 'kas.rekonsiliasi'
const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k, v]) => !k.startsWith('$') && typeof v === 'string').map(([k, v]) => [k, v as string]))
const ke = (id: number, pesan: string) => `/rekonsiliasi/${id}?pesan=${pesan}`

export async function imporMutasiAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    const isian = data(fd)
    const rek = /^\d+$/.test(isian.bankAccountId ?? '') ? Number(isian.bankAccountId) : 0
    if (!rek) throw new GalatAturan('Pilih rekening.', 'bankAccountId')
    const pemetaan = skemaPemetaan.parse(isian)
    const berkas = fd.get('berkas')
    if (!(berkas instanceof File) || !berkas.size) throw new GalatAturan('Pilih berkas CSV mutasi.', 'berkas')
    if (berkas.size > 1024 * 1024) throw new GalatAturan('Berkas paling besar 1 MB.', 'berkas')
    const teks = new TextDecoder('utf-8').decode(await berkas.arrayBuffer())
    if (teks.includes('\u0000')) throw new GalatAturan('Berkas ini bukan teks CSV.', 'berkas')
    const h = await imporMutasi(db, await konteksPermintaan(p), p, rek, teks, pemetaan, berkas.name)
    revalidatePath('/rekonsiliasi')
    redirect(`/rekonsiliasi?pesan=impor&batch=${encodeURIComponent(h.batch)}`)
  })
}

export async function buatRekonsiliasiAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'T', async (p) => {
    const r = await buatRekonsiliasi(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/rekonsiliasi')
    redirect(ke(r.id, 'draf'))
  })
}

export async function ubahRekonsiliasiAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const n = await ubahKepalaRekonsiliasi(db, await konteksPermintaan(p), p, id, data(fd))
    redirect(ke(id, n ? 'tersimpan' : 'tetap'))
  })
}

export async function cocokAksi(id: number, mutasiId: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const pilih = [...fd.keys()].filter((k) => /^jl_\d+$/.test(k)).map((k) => Number(k.slice(3)))
    await cocokkan(db, await konteksPermintaan(p), p, id, mutasiId, pilih)
    redirect(`${ke(id, 'cocok')}&m=${mutasiId}#m-${mutasiId}`)
  })
}

export async function lepasAksi(id: number, mutasiId: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    await lepasCocok(db, await konteksPermintaan(p), p, id, mutasiId)
    redirect(`${ke(id, 'lepas')}&m=${mutasiId}#m-${mutasiId}`)
  })
}

export async function saranAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const n = await terapkanSaran(db, await konteksPermintaan(p), p, id)
    redirect(ke(id, n ? 'saran' : 'saran_kosong'))
  })
}

export async function kasMutasiAksi(id: number, mutasiId: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    // Nama kolom per baris mutasi (akun_<id>, memo_<id>) supaya id kolom di halaman tidak kembar.
    const d = data(fd)
    try {
      await kasDariBarisMutasi(db, await konteksPermintaan(p), p, id, mutasiId, { accountId: d[`akun_${mutasiId}`] ?? '', memo: d[`memo_${mutasiId}`] ?? '' })
    } catch (e) {
      if (e instanceof GalatAturan && e.kolom === 'accountId') throw new GalatAturan(e.message, `akun_${mutasiId}`)
      if (e instanceof ZodError) throw new GalatAturan(e.issues[0]?.message ?? 'Isian tidak sah.', `akun_${mutasiId}`)
      throw e
    }
    revalidatePath('/kas')
    redirect(`${ke(id, 'kas')}&m=${mutasiId}#m-${mutasiId}`)
  })
}

export async function hapusMutasiAksi(id: number, mutasiId: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'H', async (p) => {
    await hapusMutasi(db, await konteksPermintaan(p), p, mutasiId)
    redirect(ke(id, 'mutasi_hapus'))
  })
}

export async function muatUlangAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const n = await muatUlangMutasi(db, await konteksPermintaan(p), p, id)
    redirect(ke(id, n ? 'muat' : 'tetap'))
  })
}

export async function postingRekonsiliasiAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'P', async (p) => {
    await postingRekonsiliasi(db, await konteksPermintaan(p), p, id)
    revalidatePath('/rekonsiliasi')
    redirect(ke(id, 'posting'))
  })
}

export async function batalRekonsiliasiAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'U', async (p) => {
    const dari = await batalRekonsiliasi(db, await konteksPermintaan(p), p, id, String(fd.get('alasan') ?? ''))
    revalidatePath('/rekonsiliasi')
    redirect(ke(id, dari === 'Diposting' ? 'batal_posting' : 'batal'))
  })
}

export async function hapusRekonsiliasiAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, MENU, 'H', async (p) => {
    await hapusRekonsiliasi(db, await konteksPermintaan(p), p, id)
    revalidatePath('/rekonsiliasi')
    redirect('/rekonsiliasi?pesan=dihapus')
  })
}

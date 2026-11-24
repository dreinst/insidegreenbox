import 'server-only'
import { forbidden, redirect, unstable_rethrow } from 'next/navigation'
import { GalatAturan, GalatIzin, GalatSaklar, galatDariZod, isianDari, type HasilAksi } from './aksi'
import { catatAudit } from './audit'
import { db } from './db'
import { punyaIzin, saklarNyala, type Pengguna } from './izin-inti'
import { MENU_PER_KODE, NAMA_AKSI, SAKLAR, type Aksi } from './katalog'
import { konteksPermintaan, penggunaSaatIni } from './sesi'
import { ZodError } from 'zod'

// Halaman: tanpa sesi sah dialihkan ke /masuk.
export async function wajibMasuk(): Promise<Pengguna> {
  const p = await penggunaSaatIni()
  if (!p) redirect('/masuk')
  return p
}

// menu berawalan "saklar:" berarti penolakan karena saklar fitur mati (wajibSaklar atau GalatSaklar dari modul).
async function catatTolak(p: Pengguna, menu: string, aksi: string, lewat: 'halaman' | 'aksi', pesan?: string) {
  const kodeSaklar = menu.startsWith('saklar:') ? menu.slice(7) : null
  const namaMenu = kodeSaklar ? `saklar ${SAKLAR.find((s) => s.kode === kodeSaklar)?.nama ?? kodeSaklar}` : (MENU_PER_KODE.get(menu)?.nama ?? menu)
  await catatAudit(db, await konteksPermintaan(p), {
    action: 'izin.ditolak',
    docType: kodeSaklar ? 'role_feature_switch' : 'role_permission',
    docId: `${p.peran.id}:${menu}`,
    summary: kodeSaklar ? `${p.name} (${p.peran.name}) ditolak ${namaMenu} di ${lewat}` : `${p.name} (${p.peran.name}) ditolak di ${lewat} ${namaMenu}, aksi ${NAMA_AKSI[aksi as Aksi] ?? aksi}`,
    after: { menu, aksi, lewat, ...(pesan ? { pesan } : {}) },
  })
}

// Halaman server: dipanggil di baris pertama. Tanpa izin menampilkan layar Akses ditolak (403).
export async function wajibIzin(menu: string, aksi: Aksi = 'L'): Promise<Pengguna> {
  const p = await wajibMasuk()
  if (!punyaIzin(p.izin, menu, aksi)) {
    await catatTolak(p, menu, aksi, 'halaman')
    forbidden()
  }
  return p
}

export async function wajibSaklar(p: Pengguna, kode: string) {
  if (!saklarNyala(p, kode)) {
    await catatTolak(p, `saklar:${kode}`, 'U', 'halaman')
    forbidden()
  }
}

// Aksi server: cek sesi dan izin, lalu jalankan isi aksi. Galat aturan dan validasi menjadi HasilAksi dengan isian
// terjaga; redirect dari isi aksi diteruskan.
export async function jalankanAksi(
  sebelum: HasilAksi,
  fd: FormData,
  menu: string,
  aksi: Aksi,
  isi: (p: Pengguna) => Promise<HasilAksi | void>,
): Promise<HasilAksi> {
  const n = (sebelum?.n ?? 0) + 1
  const p = await penggunaSaatIni()
  if (!p) redirect('/masuk')
  if (!punyaIzin(p.izin, menu, aksi)) {
    await catatTolak(p, menu, aksi, 'aksi')
    return { ok: false, pesan: 'Kamu tidak punya izin untuk tindakan ini.', isian: isianDari(fd), n }
  }
  try {
    const hasil = await isi(p)
    return hasil ? { ...hasil, n } : { ok: true, n }
  } catch (e) {
    unstable_rethrow(e)
    if (e instanceof ZodError) return { ok: false, ...galatDariZod(e), isian: isianDari(fd), n }
    // Penolakan saklar juga dicatat (temuan audit B-5), lalu tampil seperti galat aturan biasa.
    if (e instanceof GalatSaklar) await catatTolak(p, `saklar:${e.kode}`, aksi, 'aksi', e.message)
    if (e instanceof GalatAturan) return { ok: false, pesan: e.message, galat: e.kolom ? { [e.kolom]: e.message } : undefined, isian: isianDari(fd), n }
    if (e instanceof GalatIzin) {
      await catatTolak(p, e.menu, e.aksi, 'aksi')
      return { ok: false, pesan: e.message, isian: isianDari(fd), n }
    }
    console.error('Galat aksi server', menu, aksi, e)
    return { ok: false, pesan: 'Terjadi galat di server. Coba lagi.', isian: isianDari(fd), n }
  }
}

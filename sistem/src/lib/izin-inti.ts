// Logika izin tanpa Next (KONTRAK 4.5). Dipakai halaman, aksi server, dan tes.
import { GalatIzin } from './aksi'
import type { DbAtauTx } from './db'
import { AKSI, KOLOM_AKSI, MENU_PER_KODE, setaraOwner, type Aksi } from './katalog'

// Kode menu -> huruf aksi yang dimiliki, misalnya { 'atur.pengguna': 'LTU' }.
export type PetaIzin = Record<string, string>
export type PetaSaklar = Record<string, { nyala: boolean; batas: number | null }>

export type Pengguna = {
  id: number
  username: string
  name: string
  sesiId: string
  peran: { id: number; code: string; name: string }
  izin: PetaIzin
  saklar: PetaSaklar
}

type BarisIzin = Record<(typeof KOLOM_AKSI)[Aksi], boolean>

export const hurufIzin = (b: BarisIzin) => AKSI.filter((a) => b[KOLOM_AKSI[a]]).join('')

export async function muatIzin(db: DbAtauTx, roleId: number): Promise<PetaIzin> {
  const baris = await db.rolePermission.findMany({ where: { roleId } })
  const peta: PetaIzin = {}
  for (const b of baris) {
    // Aksi yang tidak berlaku untuk menu itu diabaikan walau tersimpan di database.
    const berlaku = MENU_PER_KODE.get(b.menuCode)?.aksi ?? ''
    const huruf = hurufIzin(b)
      .split('')
      .filter((h) => berlaku.includes(h))
      .join('')
    if (huruf) peta[b.menuCode] = huruf
  }
  return peta
}

export async function muatSaklar(db: DbAtauTx, roleId: number): Promise<PetaSaklar> {
  const baris = await db.roleFeatureSwitch.findMany({ where: { roleId }, include: { featureSwitch: true } })
  const peta: PetaSaklar = {}
  for (const b of baris) peta[b.featureSwitch.code] = { nyala: b.enabled, batas: b.limitValue === null ? null : Number(b.limitValue) }
  return peta
}

export const punyaIzin = (izin: PetaIzin, menu: string, aksi: Aksi = 'L') => (izin[menu] ?? '').includes(aksi)

export const saklarNyala = (p: Pick<Pengguna, 'saklar'>, kode: string) => p.saklar[kode]?.nyala === true

export const batasSaklar = (p: Pick<Pengguna, 'saklar'>, kode: string) => p.saklar[kode]?.batas ?? null

// Dipanggil di dalam fungsi modul sebagai pengaman kedua sesudah cek di aksi server.
export function pastikanIzin(p: Pick<Pengguna, 'izin'>, menu: string, aksi: Aksi) {
  if (!punyaIzin(p.izin, menu, aksi)) throw new GalatIzin(menu, aksi)
}

// Benar untuk Owner dan Superadmin (KONTRAK 4.1 dan 4.6): semua pengecekan "hanya Owner" memakai fungsi ini.
export const isOwner = (p: Pick<Pengguna, 'peran'>) => setaraOwner(p.peran.code)

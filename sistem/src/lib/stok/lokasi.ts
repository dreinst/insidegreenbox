// Master Lokasi stok (tahap 4A, versi sederhana dari menu "Lokasi dan profil usaha"). Izin atur.lokasi.
// Lokasi tidak dihapus, hanya dinonaktifkan. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, selisih, type Konteks } from '../audit'
import type { Db } from '../db'
import { pastikanIzin } from '../izin-inti'
import { skemaCentang } from '../master'
import { CABANG_BAWAAN } from './bawaan'
import type { Aktor } from './produk'

const MENU = 'atur.lokasi'

export const JENIS_LOKASI = { gudang: 'Gudang', outlet: 'Outlet', bar: 'Bar', dapur: 'Dapur' } as const
const KODE_JENIS = Object.keys(JENIS_LOKASI) as [keyof typeof JENIS_LOKASI, ...(keyof typeof JENIS_LOKASI)[]]

export const skemaLokasi = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,15}$/, 'Kode 2 sampai 16 huruf besar, angka, garis bawah, atau tanda hubung.')),
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(60, 'Nama paling panjang 60 huruf.'),
  kind: z.enum(KODE_JENIS, { message: 'Pilih jenis lokasi.' }),
  allowNegativeStock: skemaCentang,
})

const NAMA_KOLOM: Record<string, string> = { code: 'kode', name: 'nama', kind: 'jenis', allowNegativeStock: 'izin stok minus' }
const label = (k: string[]) => k.map((x) => NAMA_KOLOM[x] ?? x).join(', ')

export async function tambahLokasi(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaLokasi.parse(masukan)
  return db.$transaction(async (tx) => {
    if (await tx.location.findFirst({ where: { code: d.code } })) throw new GalatAturan('Kode lokasi sudah dipakai.', 'code')
    if (await tx.location.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' } } })) throw new GalatAturan('Nama lokasi sudah dipakai.', 'name')
    const cabang = (await tx.branch.findFirst({ where: { active: true }, orderBy: { id: 'asc' } })) ?? (await tx.branch.create({ data: CABANG_BAWAAN }))
    const l = await tx.location.create({ data: { ...d, branchId: cabang.id } })
    await catatAudit(tx, k, { action: 'lokasi.tambah', docType: 'location', docId: l.id, summary: `Menambah lokasi ${l.code} ${l.name}`, after: d })
    return l
  })
}

export async function ubahLokasi(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaLokasi.parse(masukan)
  return db.$transaction(async (tx) => {
    const l = await tx.location.findUnique({ where: { id } })
    if (!l) throw new GalatAturan('Lokasi tidak ditemukan.')
    if (await tx.location.findFirst({ where: { code: d.code, NOT: { id } } })) throw new GalatAturan('Kode lokasi sudah dipakai.', 'code')
    if (await tx.location.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, NOT: { id } } })) throw new GalatAturan('Nama lokasi sudah dipakai.', 'name')
    const s = selisih({ code: l.code, name: l.name, kind: l.kind, allowNegativeStock: l.allowNegativeStock }, d)
    if (!s.berubah.length) return 0
    if (s.berubah.includes('code') && (await tx.stockLedger.count({ where: { locationId: id } }))) throw new GalatAturan('Kode lokasi yang sudah punya gerak stok tidak bisa diganti.', 'code')
    await tx.location.update({ where: { id }, data: d })
    await catatAudit(tx, k, { action: 'lokasi.ubah', docType: 'location', docId: id, summary: `Mengubah ${label(s.berubah)} lokasi ${d.name}`, before: s.sebelum, after: s.sesudah })
    return s.berubah.length
  })
}

export async function ubahStatusLokasi(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const l = await tx.location.findUnique({ where: { id } })
    if (!l) throw new GalatAturan('Lokasi tidak ditemukan.')
    if (l.active === aktif) return
    if (!aktif) {
      if (await tx.stockBalance.count({ where: { locationId: id, NOT: { qty: 0 } } })) throw new GalatAturan('Lokasi masih menyimpan stok. Pindahkan atau kosongkan dulu.')
      if (!(await tx.location.count({ where: { active: true, NOT: { id } } }))) throw new GalatAturan('Ini satu-satunya lokasi aktif.')
    }
    await tx.location.update({ where: { id }, data: { active: aktif } })
    await catatAudit(tx, k, {
      action: aktif ? 'lokasi.aktifkan' : 'lokasi.nonaktifkan',
      docType: 'location',
      docId: id,
      summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} lokasi ${l.name}`,
      before: { active: l.active },
      after: { active: aktif },
    })
  })
}

export const daftarLokasi = (db: Db) => db.location.findMany({ orderBy: [{ active: 'desc' }, { id: 'asc' }], include: { _count: { select: { stockBalances: { where: { NOT: { qty: 0 } } } } } } })
export const pilihanLokasi = (db: Db) => db.location.findMany({ where: { active: true }, orderBy: { id: 'asc' } })

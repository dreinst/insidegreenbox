// Master Alasan penyesuaian (tahap 4A, setara Purpose ESB). Izin stok.alasan. Alasan sistem (Saldo awal) dikunci.
// Akun lawan jurnal diisi di tahap 5. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, selisih, type Konteks } from '../audit'
import type { Db } from '../db'
import { pastikanIzin } from '../izin-inti'
import type { Aktor } from './produk'

const MENU = 'stok.alasan'

export const BERLAKU_ALASAN = { semua: 'Penyesuaian dan opname', sesuai: 'Penyesuaian saja', opname: 'Opname saja' } as const
const KODE = Object.keys(BERLAKU_ALASAN) as [keyof typeof BERLAKU_ALASAN, ...(keyof typeof BERLAKU_ALASAN)[]]

export const skemaAlasan = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(60, 'Nama paling panjang 60 huruf.'),
  appliesTo: z.enum(KODE, { message: 'Pilih tempat alasan dipakai.' }),
})

const label = (k: string[]) => k.map((x) => ({ name: 'nama', appliesTo: 'berlaku untuk' })[x] ?? x).join(', ')

export async function tambahAlasan(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaAlasan.parse(masukan)
  return db.$transaction(async (tx) => {
    if (await tx.stockReason.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' } } })) throw new GalatAturan('Nama alasan sudah dipakai.', 'name')
    const a = await tx.stockReason.create({ data: d })
    await catatAudit(tx, k, { action: 'alasan.tambah', docType: 'stock_reason', docId: a.id, summary: `Menambah alasan ${a.name}`, after: d })
    return a
  })
}

export async function ubahAlasan(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaAlasan.parse(masukan)
  return db.$transaction(async (tx) => {
    const a = await tx.stockReason.findUnique({ where: { id } })
    if (!a) throw new GalatAturan('Alasan tidak ditemukan.')
    if (a.code) throw new GalatAturan('Alasan sistem tidak bisa diubah.')
    if (await tx.stockReason.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, NOT: { id } } })) throw new GalatAturan('Nama alasan sudah dipakai.', 'name')
    const s = selisih({ name: a.name, appliesTo: a.appliesTo }, d)
    if (!s.berubah.length) return 0
    await tx.stockReason.update({ where: { id }, data: d })
    await catatAudit(tx, k, { action: 'alasan.ubah', docType: 'stock_reason', docId: id, summary: `Mengubah ${label(s.berubah)} alasan ${d.name}`, before: s.sebelum, after: s.sesudah })
    return s.berubah.length
  })
}

export async function ubahStatusAlasan(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const a = await tx.stockReason.findUnique({ where: { id } })
    if (!a) throw new GalatAturan('Alasan tidak ditemukan.')
    if (a.code) throw new GalatAturan('Alasan sistem tidak bisa dinonaktifkan.')
    if (a.active === aktif) return
    await tx.stockReason.update({ where: { id }, data: { active: aktif } })
    await catatAudit(tx, k, {
      action: aktif ? 'alasan.aktifkan' : 'alasan.nonaktifkan',
      docType: 'stock_reason',
      docId: id,
      summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} alasan ${a.name}`,
      before: { active: a.active },
      after: { active: aktif },
    })
  })
}

export const daftarAlasan = (db: Db) => db.stockReason.findMany({ orderBy: [{ active: 'desc' }, { id: 'asc' }] })

// Alasan aktif untuk dokumen. Alasan sistem tidak ditawarkan di layar (hanya dipakai impor saldo awal).
export const pilihanAlasan = (db: Db, tempat: 'sesuai' | 'opname') => db.stockReason.findMany({ where: { active: true, code: null, appliesTo: { in: ['semua', tempat] } }, orderBy: { name: 'asc' } })

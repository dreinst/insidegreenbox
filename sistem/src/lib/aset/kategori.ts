// Kategori aset tetap (tahap 6B), master di bawah izin aset.daftar (Owner L T U H, Admin L). Kategori memberi umur
// manfaat bawaan dan menjadi kunci pemetaan akun aset, akumulasi, dan beban penyusutan (aset_tetap.<id>,
// akumulasi_penyusutan.<id>, beban_penyusutan.<id>; kosong ikut kunci umumnya). Kategori tidak dihapus, hanya
// dinonaktifkan (KONTRAK 3.1). Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, selisih, type Konteks } from '../audit'
import type { Db, DbAtauTx } from '../db'
import { pastikanIzin } from '../izin-inti'
import type { Aktor } from '../beli/dokumen'

export const MENU_ASET = 'aset.daftar'

export const skemaUmur = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, `${label} berupa jumlah bulan, 1 sampai 600.`)
    .transform(Number)
    .pipe(z.number().min(1, `${label} minimal 1 bulan.`).max(600, `${label} paling lama 600 bulan.`))

export const skemaKategori = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/, 'Kode 2 sampai 20 huruf besar, angka, garis bawah, atau tanda hubung.')),
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(60, 'Nama paling panjang 60 huruf.'),
  usefulMonths: skemaUmur('Umur manfaat'),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

const NAMA_KOLOM: Record<string, string> = { code: 'kode', name: 'nama', usefulMonths: 'umur manfaat', note: 'catatan' }
const label = (k: string[]) => k.map((x) => NAMA_KOLOM[x] ?? x).join(', ')

async function periksaKembar(tx: DbAtauTx, d: z.infer<typeof skemaKategori>, kecuali?: number) {
  const lain = kecuali ? { NOT: { id: kecuali } } : {}
  if (await tx.assetCategory.findFirst({ where: { code: d.code, ...lain } })) throw new GalatAturan('Kode kategori sudah dipakai.', 'code')
  if (await tx.assetCategory.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, ...lain } })) throw new GalatAturan('Nama kategori sudah dipakai.', 'name')
}

export async function tambahKategoriAset(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU_ASET, 'T')
  const d = skemaKategori.parse(masukan)
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('kategori_aset'))`
    await periksaKembar(tx, d)
    const c = await tx.assetCategory.create({ data: { ...d, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'kategori_aset.tambah', docType: 'asset_category', docId: c.id, summary: `Menambah kategori aset ${c.code} ${c.name}, umur ${c.usefulMonths} bulan`, after: d })
    return c
  })
}

export async function ubahKategoriAset(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU_ASET, 'U')
  const d = skemaKategori.parse(masukan)
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('kategori_aset'))`
    const c = await tx.assetCategory.findUnique({ where: { id } })
    if (!c) throw new GalatAturan('Kategori aset tidak ditemukan.')
    await periksaKembar(tx, d, id)
    const beda = selisih({ code: c.code, name: c.name, usefulMonths: c.usefulMonths, note: c.note }, d)
    if (!beda.berubah.length) return 0
    await tx.assetCategory.update({ where: { id }, data: { ...d, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'kategori_aset.ubah', docType: 'asset_category', docId: id, summary: `Mengubah ${label(beda.berubah)} kategori aset ${d.name}`, before: beda.sebelum, after: beda.sesudah })
    return beda.berubah.length
  })
}

export async function ubahStatusKategoriAset(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU_ASET, 'U')
  return db.$transaction(async (tx) => {
    const c = await tx.assetCategory.findUnique({ where: { id } })
    if (!c) throw new GalatAturan('Kategori aset tidak ditemukan.')
    if (c.active === aktif) return
    await tx.assetCategory.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: aktif ? 'kategori_aset.aktifkan' : 'kategori_aset.nonaktifkan',
      docType: 'asset_category',
      docId: id,
      summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} kategori aset ${c.name}`,
      before: { active: c.active },
      after: { active: aktif },
    })
  })
}

export const daftarKategoriAset = (db: DbAtauTx) =>
  db.assetCategory.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { _count: { select: { fixedAssets: true } } }, take: 200 })

export const pilihanKategoriAset = (db: DbAtauTx) => db.assetCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, usefulMonths: true } })

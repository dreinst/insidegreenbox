// Master Produk dan Satuan (tahap 4A): produk bahan, setengah jadi, dan jadi; kategori produk; satuan; konversi satuan
// beli ke satuan dasar. Izin memakai stok.produk. Master tidak dihapus, hanya dinonaktifkan. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, selisih, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin, saklarNyala, type Pengguna } from '../izin-inti'
import { PER_HALAMAN, pesanUnik, sesuaiHalaman, skemaCentang } from '../master'
import { Desimal, bacaAngka, skemaQtyOpsional } from './angka'

export type Aktor = Pick<Pengguna, 'id' | 'izin' | 'saklar'>
const MENU = 'stok.produk'

export const JENIS_PRODUK = { bahan: 'Bahan baku', setengah_jadi: 'Setengah jadi', jadi: 'Barang jadi' } as const
export type JenisProduk = keyof typeof JENIS_PRODUK
const KODE_JENIS = Object.keys(JENIS_PRODUK) as [JenisProduk, ...JenisProduk[]]

const NAMA_KOLOM: Record<string, string> = {
  code: 'kode',
  name: 'nama',
  kind: 'jenis',
  categoryId: 'kategori',
  baseUnitId: 'satuan dasar',
  minStock: 'stok minimum',
  purchasable: 'bisa dibeli',
  symbol: 'simbol',
}
export const labelKolomStok = (k: string[]) => k.map((x) => NAMA_KOLOM[x] ?? x).join(', ')

const idOpsional = z
  .string()
  .optional()
  .transform((v) => (v && /^\d+$/.test(v) ? Number(v) : null))

export const skemaProduk = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._-]{1,19}$/, 'Kode 2 sampai 20 huruf besar, angka, titik, garis bawah, atau tanda hubung.')),
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(80, 'Nama paling panjang 80 huruf.'),
  kind: z.enum(KODE_JENIS, { message: 'Pilih jenis produk.' }),
  categoryId: idOpsional,
  baseUnitId: z.string().regex(/^\d+$/, 'Pilih satuan dasar.').transform(Number),
  minStock: skemaQtyOpsional({ label: 'Stok minimum', boleh0: true }).transform((v) => v ?? new Desimal(0)),
  purchasable: skemaCentang,
})

async function periksaRujukan(tx: Tx, d: z.infer<typeof skemaProduk>) {
  const satuan = await tx.unit.findUnique({ where: { id: d.baseUnitId } })
  if (!satuan || !satuan.active) throw new GalatAturan('Satuan dasar tidak ditemukan atau nonaktif.', 'baseUnitId')
  if (d.categoryId) {
    const kat = await tx.productCategory.findUnique({ where: { id: d.categoryId } })
    if (!kat || !kat.active) throw new GalatAturan('Kategori tidak ditemukan atau nonaktif.', 'categoryId')
  }
}

const unikProduk = async (tx: Tx, d: { code: string; name: string }, kecuali?: number) => {
  const NOT = kecuali ? { NOT: { id: kecuali } } : {}
  if (await tx.product.findFirst({ where: { code: d.code, ...NOT } })) throw new GalatAturan('Kode produk sudah dipakai.', 'code')
  if (await tx.product.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, ...NOT } })) throw new GalatAturan('Nama produk sudah dipakai.', 'name')
}

const dataProduk = (d: z.infer<typeof skemaProduk>) => ({
  code: d.code,
  name: d.name,
  kind: d.kind,
  categoryId: d.categoryId,
  baseUnitId: d.baseUnitId,
  minStock: d.minStock,
  purchasable: d.purchasable,
})

export async function tambahProduk(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaProduk.parse(masukan)
  try {
    return await db.$transaction(async (tx) => {
      await periksaRujukan(tx, d)
      await unikProduk(tx, d)
      const p = await tx.product.create({ data: { ...dataProduk(d), createdBy: aktor.id, updatedBy: aktor.id } })
      await catatAudit(tx, k, { action: 'produk.tambah', docType: 'product', docId: p.id, summary: `Menambah produk ${p.code} ${p.name} (${JENIS_PRODUK[d.kind]})`, after: dataProduk(d) })
      return p
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Kode produk sudah dipakai.', 'code')
    throw e
  }
}

export async function ubahProduk(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaProduk.parse(masukan)
  try {
    return await db.$transaction(async (tx) => {
      const p = await tx.product.findUnique({ where: { id } })
      if (!p) throw new GalatAturan('Produk tidak ditemukan.')
      await periksaRujukan(tx, d)
      await unikProduk(tx, d, id)
      const s = selisih(
        { code: p.code, name: p.name, kind: p.kind, categoryId: p.categoryId, baseUnitId: p.baseUnitId, minStock: p.minStock.toString(), purchasable: p.purchasable },
        { ...dataProduk(d), minStock: d.minStock.toString() },
      )
      if (!s.berubah.length) return { p, berubah: 0 }
      const dipakai = (await tx.stockLedger.count({ where: { productId: id } })) > 0
      if (dipakai && s.berubah.includes('baseUnitId')) throw new GalatAturan('Satuan dasar tidak bisa diganti karena produk sudah punya gerak stok.', 'baseUnitId')
      if (dipakai && (s.berubah.includes('code') || s.berubah.includes('name')) && !saklarNyala(aktor, 'produk.ubah_kode_nama')) {
        throw new GalatAturan('Kode dan nama produk yang sudah dipakai transaksi hanya bisa diubah pemegang saklar Ubah kode dan nama produk.', s.berubah.includes('code') ? 'code' : 'name')
      }
      const b = await tx.product.update({ where: { id }, data: { ...dataProduk(d), updatedBy: aktor.id } })
      await catatAudit(tx, k, {
        action: 'produk.ubah',
        docType: 'product',
        docId: id,
        summary: `Mengubah ${labelKolomStok(s.berubah)} produk ${b.code} ${b.name}`,
        before: s.sebelum,
        after: s.sesudah,
      })
      return { p: b, berubah: s.berubah.length }
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Kode produk sudah dipakai.', 'code')
    throw e
  }
}

export async function ubahStatusProduk(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const p = await tx.product.findUnique({ where: { id } })
    if (!p) throw new GalatAturan('Produk tidak ditemukan.')
    if (p.active === aktif) return p
    // Saldo bernilai bukan 0 juga menahan (sisa data lama sebelum aturan koreksi stok minus, temuan audit B-1).
    if (!aktif && (await tx.stockBalance.count({ where: { productId: id, OR: [{ NOT: { qty: 0 } }, { NOT: { value: 0n } }] } }))) {
      throw new GalatAturan('Produk masih punya stok. Kosongkan dulu lewat penyesuaian atau opname, baru nonaktifkan.')
    }
    const b = await tx.product.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: aktif ? 'produk.aktifkan' : 'produk.nonaktifkan',
      docType: 'product',
      docId: id,
      summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} produk ${p.code} ${p.name}`,
      before: { active: p.active },
      after: { active: aktif },
    })
    return b
  })
}

// Konversi satuan: 1 satuan lain = faktor x satuan dasar. Satuan dasar sendiri tidak disimpan (faktornya selalu 1).
export const skemaKonversi = z.object({
  unitId: z.string().regex(/^\d+$/, 'Pilih satuan.').transform(Number),
  factor: z.string().transform((v, ctx) => {
    const d = bacaAngka(v)
    // isPos() juga benar untuk 0 di decimal.js, jadi pakai gt(0).
    if (!d || !d.gt(0)) {
      ctx.addIssue({ code: 'custom', message: 'Faktor harus angka lebih dari 0, misalnya 1000 atau 0,5.' })
      return z.NEVER
    }
    if (d.decimalPlaces() > 6 || d.gt(1_000_000_000)) {
      ctx.addIssue({ code: 'custom', message: 'Faktor paling banyak 6 angka di belakang koma.' })
      return z.NEVER
    }
    return d
  }),
  isPurchase: skemaCentang,
  isDefault: skemaCentang,
})

export async function simpanKonversi(db: Db, k: Konteks, aktor: Aktor, productId: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaKonversi.parse(masukan)
  return db.$transaction(async (tx) => {
    const p = await tx.product.findUnique({ where: { id: productId }, include: { baseUnit: true } })
    if (!p) throw new GalatAturan('Produk tidak ditemukan.')
    if (d.unitId === p.baseUnitId) throw new GalatAturan('Satuan dasar tidak perlu dikonversi.', 'unitId')
    const u = await tx.unit.findUnique({ where: { id: d.unitId } })
    if (!u || !u.active) throw new GalatAturan('Satuan tidak ditemukan atau nonaktif.', 'unitId')
    const lama = await tx.productUnit.findUnique({ where: { productId_unitId: { productId, unitId: d.unitId } } })
    const isPurchase = d.isPurchase || d.isDefault
    if (d.isDefault) await tx.productUnit.updateMany({ where: { productId, NOT: { unitId: d.unitId } }, data: { isDefault: false } })
    await tx.productUnit.upsert({
      where: { productId_unitId: { productId, unitId: d.unitId } },
      update: { factorToBase: d.factor, isPurchase, isDefault: d.isDefault },
      create: { productId, unitId: d.unitId, factorToBase: d.factor, isPurchase, isDefault: d.isDefault },
    })
    const sesudah = { unit: u.name, factorToBase: d.factor.toString(), isPurchase, isDefault: d.isDefault }
    await catatAudit(tx, k, {
      action: lama ? 'produk.satuan_ubah' : 'produk.satuan_tambah',
      docType: 'product_unit',
      docId: `${productId}:${d.unitId}`,
      summary: `${lama ? 'Mengubah' : 'Menambah'} konversi ${p.code}: 1 ${u.symbol} = ${d.factor.toString().replace('.', ',')} ${p.baseUnit.symbol}`,
      before: lama ? { unit: u.name, factorToBase: lama.factorToBase.toString(), isPurchase: lama.isPurchase, isDefault: lama.isDefault } : undefined,
      after: sesudah,
    })
  })
}

export async function hapusKonversi(db: Db, k: Konteks, aktor: Aktor, productId: number, unitId: number) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const lama = await tx.productUnit.findUnique({ where: { productId_unitId: { productId, unitId } }, include: { unit: true, product: true } })
    if (!lama) throw new GalatAturan('Konversi tidak ditemukan.')
    await tx.productUnit.delete({ where: { productId_unitId: { productId, unitId } } })
    await catatAudit(tx, k, {
      action: 'produk.satuan_hapus',
      docType: 'product_unit',
      docId: `${productId}:${unitId}`,
      summary: `Menghapus konversi ${lama.unit.symbol} dari produk ${lama.product.code}`,
      before: { unit: lama.unit.name, factorToBase: lama.factorToBase.toString(), isPurchase: lama.isPurchase, isDefault: lama.isDefault },
    })
  })
}

export type SaringProduk = { q?: string; jenis?: string; kategori?: string; status?: string; hal?: string }

export async function daftarProduk(db: Db, s: SaringProduk) {
  const q = s.q?.trim().slice(0, 64)
  const jenis = s.jenis && s.jenis in JENIS_PRODUK ? s.jenis : undefined
  const kategori = s.kategori && /^\d+$/.test(s.kategori) ? Number(s.kategori) : undefined
  const status = s.status === 'aktif' || s.status === 'nonaktif' ? s.status : undefined
  const hal = sesuaiHalaman(s.hal)
  const where = {
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { code: { contains: q.toUpperCase() } }] } : {}),
    ...(jenis ? { kind: jenis } : {}),
    ...(kategori ? { categoryId: kategori } : {}),
    ...(status ? { active: status === 'aktif' } : {}),
  }
  const [baris, total] = await Promise.all([
    db.product.findMany({ where, include: { category: true, baseUnit: true }, orderBy: [{ active: 'desc' }, { code: 'asc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.product.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

// Pilihan untuk formulir: satuan aktif, kategori aktif, produk aktif.
export const pilihanSatuan = (db: Db) => db.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
export const pilihanKategori = (db: Db) => db.productCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
export const pilihanProduk = (db: Db) => db.product.findMany({ where: { active: true }, include: { baseUnit: true }, orderBy: { name: 'asc' } })

// ===== Kategori produk =====

export const skemaKategoriProduk = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(60, 'Nama paling panjang 60 huruf.'),
  kind: z.enum(KODE_JENIS, { message: 'Pilih jenis.' }),
})

export async function tambahKategoriProduk(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKategoriProduk.parse(masukan)
  return db.$transaction(async (tx) => {
    if (await tx.productCategory.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' } } })) throw new GalatAturan('Nama kategori sudah dipakai.', 'name')
    const c = await tx.productCategory.create({ data: d })
    await catatAudit(tx, k, { action: 'kategori_produk.tambah', docType: 'product_category', docId: c.id, summary: `Menambah kategori produk ${c.name}`, after: d })
    return c
  })
}

export async function ubahKategoriProduk(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaKategoriProduk.parse(masukan)
  return db.$transaction(async (tx) => {
    const c = await tx.productCategory.findUnique({ where: { id } })
    if (!c) throw new GalatAturan('Kategori tidak ditemukan.')
    if (await tx.productCategory.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, NOT: { id } } })) throw new GalatAturan('Nama kategori sudah dipakai.', 'name')
    const s = selisih({ name: c.name, kind: c.kind }, d)
    if (!s.berubah.length) return 0
    await tx.productCategory.update({ where: { id }, data: d })
    await catatAudit(tx, k, {
      action: 'kategori_produk.ubah',
      docType: 'product_category',
      docId: id,
      summary: `Mengubah ${labelKolomStok(s.berubah)} kategori produk ${d.name}`,
      before: s.sebelum,
      after: s.sesudah,
    })
    return s.berubah.length
  })
}

export async function ubahStatusKategoriProduk(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const c = await tx.productCategory.findUnique({ where: { id } })
    if (!c) throw new GalatAturan('Kategori tidak ditemukan.')
    if (c.active === aktif) return
    if (!aktif && (await tx.product.count({ where: { categoryId: id, active: true } }))) throw new GalatAturan('Kategori masih dipakai produk aktif. Pindahkan produknya dulu.')
    await tx.productCategory.update({ where: { id }, data: { active: aktif } })
    await catatAudit(tx, k, {
      action: aktif ? 'kategori_produk.aktifkan' : 'kategori_produk.nonaktifkan',
      docType: 'product_category',
      docId: id,
      summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} kategori produk ${c.name}`,
      before: { active: c.active },
      after: { active: aktif },
    })
  })
}

// ===== Satuan =====

export const skemaSatuan = z.object({
  name: z.string().trim().min(1, 'Nama satuan wajib diisi.').max(30, 'Nama paling panjang 30 huruf.'),
  symbol: z.string().trim().min(1, 'Simbol wajib diisi.').max(10, 'Simbol paling panjang 10 huruf.'),
})

export async function tambahSatuan(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaSatuan.parse(masukan)
  try {
    return await db.$transaction(async (tx) => {
      if (await tx.unit.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' } } })) throw new GalatAturan('Nama satuan sudah dipakai.', 'name')
      const u = await tx.unit.create({ data: d })
      await catatAudit(tx, k, { action: 'satuan.tambah', docType: 'unit', docId: u.id, summary: `Menambah satuan ${u.name} (${u.symbol})`, after: d })
      return u
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Nama satuan sudah dipakai.', 'name')
    throw e
  }
}

export async function ubahSatuan(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaSatuan.parse(masukan)
  try {
    return await db.$transaction(async (tx) => {
      const u = await tx.unit.findUnique({ where: { id } })
      if (!u) throw new GalatAturan('Satuan tidak ditemukan.')
      if (await tx.unit.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, NOT: { id } } })) throw new GalatAturan('Nama satuan sudah dipakai.', 'name')
      const s = selisih({ name: u.name, symbol: u.symbol }, d)
      if (!s.berubah.length) return 0
      await tx.unit.update({ where: { id }, data: d })
      await catatAudit(tx, k, { action: 'satuan.ubah', docType: 'unit', docId: id, summary: `Mengubah ${labelKolomStok(s.berubah)} satuan ${d.name}`, before: s.sebelum, after: s.sesudah })
      return s.berubah.length
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Nama satuan sudah dipakai.', 'name')
    throw e
  }
}

export async function ubahStatusSatuan(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const u = await tx.unit.findUnique({ where: { id } })
    if (!u) throw new GalatAturan('Satuan tidak ditemukan.')
    if (u.active === aktif) return
    if (!aktif && (await tx.product.count({ where: { baseUnitId: id, active: true } }))) throw new GalatAturan('Satuan masih menjadi satuan dasar produk aktif.')
    await tx.unit.update({ where: { id }, data: { active: aktif } })
    await catatAudit(tx, k, {
      action: aktif ? 'satuan.aktifkan' : 'satuan.nonaktifkan',
      docType: 'unit',
      docId: id,
      summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} satuan ${u.name}`,
      before: { active: u.active },
      after: { active: aktif },
    })
  })
}

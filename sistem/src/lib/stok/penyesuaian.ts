// Penyesuaian Stok (tahap 4A, setara Item Journal ESB; RANCANGAN 4). Baris tambah atau kurang dengan alasan.
// Kurang memakai harga rata-rata; tambah memakai harga rata-rata kecuali harga satuan diisi. Saklar stok.sesuai_kurang
// dan stok.sesuai_tambah terpisah. Penyesuaian yang punya baris tambah wajib disetujui (approval_rule). Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan, GalatSaklar } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin, saklarNyala } from '../izin-inti'
import { PER_HALAMAN, sesuaiHalaman, skemaTanggal } from '../master'
import { ambilNomor } from '../nomor'
import { des, formatNilai, formatQty, skemaHargaSatuan, skemaQty } from './angka'
import {
  BATAS_BARIS,
  DOK_STOK,
  aturanSetuju,
  hapusDraf,
  pastikanSalahSatu,
  periksaTanggal,
  saringDok,
  ubahStatusDok,
  type Aktor,
  type AksiStatus,
  type KaitDok,
  type KepalaDok,
  type SaringDok,
} from './dokumen'
import { catatGerak, saldoDi } from './mesin'

const JENIS = 'stock_adjustment' as const
const MENU = DOK_STOK[JENIS].menu

export const ARAH = { tambah: 'Tambah', kurang: 'Kurang' } as const

const id = (label: string) => z.string().regex(/^\d+$/, `Pilih ${label}.`).transform(Number)

export const skemaKepalaPenyesuaian = z.object({
  locationId: id('lokasi'),
  date: skemaTanggal('Tanggal').transform((v, ctx) => {
    if (!v) {
      ctx.addIssue({ code: 'custom', message: 'Tanggal wajib diisi.' })
      return z.NEVER
    }
    return v
  }),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

export const skemaBarisPenyesuaian = z.object({
  productId: id('produk'),
  reasonId: id('alasan'),
  direction: z.enum(['tambah', 'kurang'], { message: 'Pilih tambah atau kurang.' }),
  qty: skemaQty({ label: 'Qty' }),
  unitCost: skemaHargaSatuan('Harga satuan'),
})

async function lokasiAktif(tx: Tx, locationId: number) {
  const l = await tx.location.findUnique({ where: { id: locationId } })
  if (!l || !l.active) throw new GalatAturan('Lokasi tidak ditemukan atau nonaktif.', 'locationId')
  return l
}

export async function buatPenyesuaian(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKepalaPenyesuaian.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const l = await lokasiAktif(tx, d.locationId)
    const no = await ambilNomor(tx, JENIS, DOK_STOK[JENIS].awalan, d.date)
    const dok = await tx.stockAdjustment.create({ data: { no, locationId: d.locationId, date: d.date, note: d.note, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'penyesuaian.tambah',
      docType: JENIS,
      docId: dok.id,
      summary: `Membuat draf penyesuaian stok ${no} di ${l.name}`,
      after: { no, lokasi: l.name, date: d.date, note: d.note },
    })
    return dok
  })
}

async function muatDraf(tx: Tx, idDok: number) {
  await tx.$executeRaw`SELECT id FROM stock_adjustment WHERE id = ${idDok} FOR UPDATE`
  const dok = await tx.stockAdjustment.findUnique({ where: { id: idDok }, include: { location: true } })
  if (!dok) throw new GalatAturan('Penyesuaian stok tidak ditemukan.')
  if (dok.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return dok
}

export async function ubahKepalaPenyesuaian(db: Db, k: Konteks, aktor: Aktor, idDok: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaPenyesuaian.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const dok = await muatDraf(tx, idDok)
    const l = await lokasiAktif(tx, d.locationId)
    const sebelum = { lokasi: dok.location.name, date: dok.date.toISOString().slice(0, 10), note: dok.note }
    const sesudah = { lokasi: l.name, date: d.date.toISOString().slice(0, 10), note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.stockAdjustment.update({ where: { id: idDok }, data: { locationId: d.locationId, date: d.date, note: d.note, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'penyesuaian.ubah', docType: JENIS, docId: idDok, summary: `Mengubah kepala penyesuaian stok ${dok.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

function periksaSaklarArah(aktor: Aktor, arah: string) {
  if (arah === 'kurang' && !saklarNyala(aktor, 'stok.sesuai_kurang')) throw new GalatSaklar('stok.sesuai_kurang', 'Kamu tidak punya saklar Penyesuaian stok kurang.', 'direction')
  if (arah === 'tambah' && !saklarNyala(aktor, 'stok.sesuai_tambah')) throw new GalatSaklar('stok.sesuai_tambah', 'Kamu tidak punya saklar Penyesuaian stok tambah.', 'direction')
}

export async function tambahBarisPenyesuaian(db: Db, k: Konteks, aktor: Aktor, idDok: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaBarisPenyesuaian.parse(masukan)
  periksaSaklarArah(aktor, d.direction)
  if (d.direction === 'kurang' && d.unitCost) throw new GalatAturan('Baris kurang selalu memakai harga rata-rata. Kosongkan harga satuan.', 'unitCost')
  return db.$transaction(async (tx) => {
    const dok = await muatDraf(tx, idDok)
    const p = await tx.product.findUnique({ where: { id: d.productId }, include: { baseUnit: true } })
    if (!p || !p.active) throw new GalatAturan('Produk tidak ditemukan atau nonaktif.', 'productId')
    const a = await tx.stockReason.findUnique({ where: { id: d.reasonId } })
    if (!a || !a.active || a.code || !['semua', 'sesuai'].includes(a.appliesTo)) throw new GalatAturan('Alasan tidak ditemukan atau tidak berlaku untuk penyesuaian.', 'reasonId')
    if ((await tx.stockAdjustmentLine.count({ where: { stockAdjustmentId: idDok } })) >= BATAS_BARIS) throw new GalatAturan(`Satu dokumen paling banyak ${BATAS_BARIS} baris.`)
    const b = await tx.stockAdjustmentLine.create({ data: { stockAdjustmentId: idDok, productId: p.id, reasonId: a.id, direction: d.direction, qty: d.qty, unitCost: d.unitCost ?? 0 } })
    await tx.stockAdjustment.update({ where: { id: idDok }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'penyesuaian.baris_tambah',
      docType: JENIS,
      docId: idDok,
      summary: `Menambah baris ${dok.no}: ${ARAH[d.direction].toLowerCase()} ${formatQty(d.qty)} ${p.baseUnit.symbol} ${p.name} (${a.name})`,
      after: { lineId: b.id, produk: p.code, alasan: a.name, direction: d.direction, qty: d.qty, unitCost: d.unitCost },
    })
    return b
  })
}

export async function hapusBarisPenyesuaian(db: Db, k: Konteks, aktor: Aktor, idDok: number, idBaris: number) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const dok = await muatDraf(tx, idDok)
    const b = await tx.stockAdjustmentLine.findFirst({ where: { id: idBaris, stockAdjustmentId: idDok }, include: { product: true } })
    if (!b) throw new GalatAturan('Baris tidak ditemukan.')
    await tx.stockAdjustmentLine.delete({ where: { id: idBaris } })
    await catatAudit(tx, k, {
      action: 'penyesuaian.baris_hapus',
      docType: JENIS,
      docId: idDok,
      summary: `Menghapus baris ${dok.no}: ${b.direction} ${formatQty(b.qty)} ${b.product.name}`,
      before: { lineId: b.id, produk: b.product.code, direction: b.direction, qty: b.qty },
    })
  })
}

const punyaTambah = async (tx: Tx, idDok: number) => (await tx.stockAdjustmentLine.count({ where: { stockAdjustmentId: idDok, direction: 'tambah' } })) > 0

export const KAIT_PENYESUAIAN: KaitDok<KepalaDok & { locationId: number }> = {
  jenis: JENIS,
  muat: (tx, idDok) => tx.stockAdjustment.findUnique({ where: { id: idDok } }),
  simpan: (tx, idDok, data) => tx.stockAdjustment.update({ where: { id: idDok }, data }),
  butuhSetuju: async (tx, d) => (await aturanSetuju(tx, JENIS)) && (await punyaTambah(tx, d.id)),
  periksaAjukan: async (tx, d) => {
    if (!(await tx.stockAdjustmentLine.count({ where: { stockAdjustmentId: d.id } }))) throw new GalatAturan('Tambahkan minimal satu baris dulu.')
  },
  posting: async (tx, d, asal) => {
    const baris = await tx.stockAdjustmentLine.findMany({ where: { stockAdjustmentId: d.id }, include: { product: true }, orderBy: { id: 'asc' } })
    if (!baris.length) throw new GalatAturan('Tambahkan minimal satu baris dulu.')
    for (const b of baris) {
      if (!b.product.active) throw new GalatAturan(`Produk ${b.product.name} sudah nonaktif. Hapus barisnya dulu.`)
      if (b.direction === 'tambah' && des(b.unitCost).isZero()) {
        const s = await saldoDi(tx, b.productId, d.locationId)
        if (!s.rata.gt(0) && !des(b.product.lastCost).gt(0)) throw new GalatAturan(`Isi harga satuan untuk ${b.product.name}, karena belum ada harga rata-rata di lokasi ini.`)
      }
    }
    const hasil = await catatGerak(
      tx,
      asal,
      baris.map((b) => ({
        productId: b.productId,
        locationId: d.locationId,
        qty: b.direction === 'tambah' ? des(b.qty) : des(b.qty).neg(),
        hargaSatuan: b.direction === 'tambah' && des(b.unitCost).gt(0) ? b.unitCost : null,
        lineId: b.id,
      })),
    )
    for (const h of hasil) await tx.stockAdjustmentLine.update({ where: { id: h.lineId! }, data: { unitCost: h.hargaSatuan } })
    const bersih = hasil.reduce((n, h) => n + h.nilai, 0n)
    return { ringkas: `${hasil.length} baris, nilai bersih ${formatNilai(bersih)}`, sesudah: { baris: hasil.length, nilaiBersih: bersih } }
  },
}

// Pemeriksaan saklar arah juga berlaku untuk yang memposting.
export async function ubahStatusPenyesuaian(db: Db, k: Konteks, aktor: Aktor, idDok: number, aksi: AksiStatus, opsi: { alasan?: string } = {}) {
  if (aksi === 'posting') {
    const arah = await db.stockAdjustmentLine.findMany({ where: { stockAdjustmentId: idDok }, distinct: ['direction'], select: { direction: true } })
    for (const a of arah) periksaSaklarArah(aktor, a.direction)
  }
  return ubahStatusDok(db, k, aktor, KAIT_PENYESUAIAN, idDok, aksi, opsi)
}

export const hapusPenyesuaian = (db: Db, k: Konteks, aktor: Aktor, idDok: number) =>
  hapusDraf(db, k, aktor, JENIS, idDok, async (tx) => {
    const d = await tx.stockAdjustment.findUnique({ where: { id: idDok } })
    if (!d || d.status !== 'Draft') return null
    await tx.stockAdjustment.delete({ where: { id: idDok } })
    return d
  })

export const muatPenyesuaian = (db: Db, idDok: number) =>
  db.stockAdjustment.findUnique({
    where: { id: idDok },
    include: { location: true, stockAdjustmentLines: { include: { product: { include: { baseUnit: true } }, reason: true }, orderBy: { id: 'asc' } } },
  })

export async function daftarPenyesuaian(db: Db, s: SaringDok) {
  const hal = sesuaiHalaman(s.hal)
  const { where: dasar, lokasi } = saringDok(s)
  const where = { ...dasar, ...(lokasi ? { locationId: lokasi } : {}) }
  const [baris, total] = await Promise.all([
    db.stockAdjustment.findMany({
      where,
      include: { location: true, _count: { select: { stockAdjustmentLines: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: (hal - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    db.stockAdjustment.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

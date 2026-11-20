// Pindah Stok antar lokasi (tahap 4A, setara Simple Transfer ESB; RANCANGAN 4). Nilai ikut harga rata-rata lokasi asal
// dan masuk ke tujuan dengan nilai yang sama persis, tanpa jurnal karena satu akun persediaan. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin } from '../izin-inti'
import { PER_HALAMAN, sesuaiHalaman, skemaTanggal } from '../master'
import { ambilNomor } from '../nomor'
import { formatNilai, formatQty, skemaQty } from './angka'
import { BATAS_BARIS, DOK_STOK, hapusDraf, pastikanSalahSatu, periksaTanggal, saringDok, ubahStatusDok, type Aktor, type AksiStatus, type KaitDok, type KepalaDok, type SaringDok } from './dokumen'
import { pindahStok } from './mesin'

const JENIS = 'stock_transfer' as const
const MENU = DOK_STOK[JENIS].menu

const idWajib = (label: string) => z.string().regex(/^\d+$/, `Pilih ${label}.`).transform(Number)

export const skemaKepalaPindah = z
  .object({
    fromLocationId: idWajib('lokasi asal'),
    toLocationId: idWajib('lokasi tujuan'),
    date: skemaTanggal('Tanggal').transform((v, ctx) => {
      if (!v) {
        ctx.addIssue({ code: 'custom', message: 'Tanggal wajib diisi.' })
        return z.NEVER
      }
      return v
    }),
    note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
  })
  .refine((d) => d.fromLocationId !== d.toLocationId, { message: 'Lokasi tujuan harus berbeda dari lokasi asal.', path: ['toLocationId'] })

export const skemaBarisPindah = z.object({ productId: idWajib('produk'), qty: skemaQty({ label: 'Qty' }) })

async function duaLokasi(tx: Tx, dari: number, ke: number) {
  const [a, b] = await Promise.all([tx.location.findUnique({ where: { id: dari } }), tx.location.findUnique({ where: { id: ke } })])
  if (!a || !a.active) throw new GalatAturan('Lokasi asal tidak ditemukan atau nonaktif.', 'fromLocationId')
  if (!b || !b.active) throw new GalatAturan('Lokasi tujuan tidak ditemukan atau nonaktif.', 'toLocationId')
  return [a, b] as const
}

export async function buatPindah(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKepalaPindah.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const [a, b] = await duaLokasi(tx, d.fromLocationId, d.toLocationId)
    const no = await ambilNomor(tx, JENIS, DOK_STOK[JENIS].awalan, d.date)
    const dok = await tx.stockTransfer.create({ data: { no, fromLocationId: a.id, toLocationId: b.id, date: d.date, note: d.note, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'pindah.tambah',
      docType: JENIS,
      docId: dok.id,
      summary: `Membuat draf pindah stok ${no} dari ${a.name} ke ${b.name}`,
      after: { no, dari: a.name, ke: b.name, date: d.date, note: d.note },
    })
    return dok
  })
}

async function muatDraf(tx: Tx, idDok: number) {
  await tx.$executeRaw`SELECT id FROM stock_transfer WHERE id = ${idDok} FOR UPDATE`
  const dok = await tx.stockTransfer.findUnique({ where: { id: idDok }, include: { fromLocation: true, toLocation: true } })
  if (!dok) throw new GalatAturan('Pindah stok tidak ditemukan.')
  if (dok.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return dok
}

export async function ubahKepalaPindah(db: Db, k: Konteks, aktor: Aktor, idDok: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaPindah.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const dok = await muatDraf(tx, idDok)
    const [a, b] = await duaLokasi(tx, d.fromLocationId, d.toLocationId)
    const sebelum = { dari: dok.fromLocation.name, ke: dok.toLocation.name, date: dok.date.toISOString().slice(0, 10), note: dok.note }
    const sesudah = { dari: a.name, ke: b.name, date: d.date.toISOString().slice(0, 10), note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.stockTransfer.update({ where: { id: idDok }, data: { fromLocationId: a.id, toLocationId: b.id, date: d.date, note: d.note, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pindah.ubah', docType: JENIS, docId: idDok, summary: `Mengubah kepala pindah stok ${dok.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

export async function tambahBarisPindah(db: Db, k: Konteks, aktor: Aktor, idDok: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaBarisPindah.parse(masukan)
  return db.$transaction(async (tx) => {
    const dok = await muatDraf(tx, idDok)
    const p = await tx.product.findUnique({ where: { id: d.productId }, include: { baseUnit: true } })
    if (!p || !p.active) throw new GalatAturan('Produk tidak ditemukan atau nonaktif.', 'productId')
    if (await tx.stockTransferLine.findFirst({ where: { stockTransferId: idDok, productId: p.id } }))
      throw new GalatAturan('Produk ini sudah ada di dokumen. Hapus barisnya dulu bila qty-nya mau diganti.', 'productId')
    if ((await tx.stockTransferLine.count({ where: { stockTransferId: idDok } })) >= BATAS_BARIS) throw new GalatAturan(`Satu dokumen paling banyak ${BATAS_BARIS} baris.`)
    const b = await tx.stockTransferLine.create({ data: { stockTransferId: idDok, productId: p.id, qty: d.qty } })
    await tx.stockTransfer.update({ where: { id: idDok }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'pindah.baris_tambah',
      docType: JENIS,
      docId: idDok,
      summary: `Menambah baris ${dok.no}: ${formatQty(d.qty)} ${p.baseUnit.symbol} ${p.name}`,
      after: { lineId: b.id, produk: p.code, qty: d.qty },
    })
    return b
  })
}

export async function hapusBarisPindah(db: Db, k: Konteks, aktor: Aktor, idDok: number, idBaris: number) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const dok = await muatDraf(tx, idDok)
    const b = await tx.stockTransferLine.findFirst({ where: { id: idBaris, stockTransferId: idDok }, include: { product: true } })
    if (!b) throw new GalatAturan('Baris tidak ditemukan.')
    await tx.stockTransferLine.delete({ where: { id: idBaris } })
    await catatAudit(tx, k, {
      action: 'pindah.baris_hapus',
      docType: JENIS,
      docId: idDok,
      summary: `Menghapus baris ${dok.no}: ${formatQty(b.qty)} ${b.product.name}`,
      before: { lineId: b.id, produk: b.product.code, qty: b.qty },
    })
  })
}

type KepalaPindah = KepalaDok & { fromLocationId: number; toLocationId: number }

export const KAIT_PINDAH: KaitDok<KepalaPindah> = {
  jenis: JENIS,
  muat: (tx, idDok) => tx.stockTransfer.findUnique({ where: { id: idDok } }),
  simpan: (tx, idDok, data) => tx.stockTransfer.update({ where: { id: idDok }, data }),
  butuhSetuju: async () => false,
  periksaAjukan: async (tx, d) => {
    if (!(await tx.stockTransferLine.count({ where: { stockTransferId: d.id } }))) throw new GalatAturan('Tambahkan minimal satu baris dulu.')
  },
  posting: async (tx, d, asal) => {
    const baris = await tx.stockTransferLine.findMany({ where: { stockTransferId: d.id }, include: { product: true }, orderBy: { id: 'asc' } })
    if (!baris.length) throw new GalatAturan('Tambahkan minimal satu baris dulu.')
    const [a, b] = await duaLokasi(tx, d.fromLocationId, d.toLocationId)
    for (const x of baris) if (!x.product.active) throw new GalatAturan(`Produk ${x.product.name} sudah nonaktif. Hapus barisnya dulu.`)
    const hasil = await pindahStok(
      tx,
      asal,
      baris.map((x) => ({ productId: x.productId, dari: a.id, ke: b.id, qty: x.qty, lineId: x.id })),
    )
    const keluar = hasil.filter((h) => h.qty.isNeg())
    for (const h of keluar) await tx.stockTransferLine.update({ where: { id: h.lineId! }, data: { unitCost: h.hargaSatuan } })
    const nilai = keluar.reduce((n, h) => n - h.nilai, 0n)
    return { ringkas: `${baris.length} baris dari ${a.name} ke ${b.name}, nilai ${formatNilai(nilai)}`, sesudah: { baris: baris.length, nilai } }
  },
}

export const ubahStatusPindah = (db: Db, k: Konteks, aktor: Aktor, idDok: number, aksi: AksiStatus, opsi: { alasan?: string } = {}) => ubahStatusDok(db, k, aktor, KAIT_PINDAH, idDok, aksi, opsi)

export const hapusPindah = (db: Db, k: Konteks, aktor: Aktor, idDok: number) =>
  hapusDraf(db, k, aktor, JENIS, idDok, async (tx) => {
    const d = await tx.stockTransfer.findUnique({ where: { id: idDok } })
    if (!d || d.status !== 'Draft') return null
    await tx.stockTransfer.delete({ where: { id: idDok } })
    return d
  })

export const muatPindah = (db: Db, idDok: number) =>
  db.stockTransfer.findUnique({
    where: { id: idDok },
    include: { fromLocation: true, toLocation: true, stockTransferLines: { include: { product: { include: { baseUnit: true } } }, orderBy: { id: 'asc' } } },
  })

export async function daftarPindah(db: Db, s: SaringDok) {
  const hal = sesuaiHalaman(s.hal)
  const { where: dasar, lokasi } = saringDok(s)
  const where = { ...dasar, ...(lokasi ? { OR: [{ fromLocationId: lokasi }, { toLocationId: lokasi }] } : {}) }
  const [baris, total] = await Promise.all([
    db.stockTransfer.findMany({
      where,
      include: { fromLocation: true, toLocation: true, _count: { select: { stockTransferLines: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: (hal - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    db.stockTransfer.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

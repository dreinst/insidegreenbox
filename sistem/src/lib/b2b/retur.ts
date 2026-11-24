// Retur Penjualan B2B (tahap 6A). Barang dari satu Faktur Penjualan Diposting kembali masuk ke lokasi faktur dengan HPP
// asalnya (nilai keluar faktur yang sebanding dengan qty retur), bukan harga rata-rata saat ini. Retur menghasilkan nota
// kredit (qty x harga jual faktur) yang mengurangi piutang lewat Penerimaan Pelanggan. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin } from '../izin-inti'
import { formatRupiah } from '../master'
import { ambilNomor } from '../nomor'
import { Desimal, NOL, des, formatQty, isianQty, keRupiah, skemaQtyOpsional } from '../stok/angka'
import { catatGerak } from '../stok/mesin'
import { balikJurnalReturJual, jurnalReturJual } from '../akuntansi/dokumen-b2b'
import {
  BATAS_BARIS_BELI,
  DOK_BELI,
  dataPelaksana,
  hapusDrafBeli,
  idSkema,
  jumlahHal,
  kunciBaris,
  pastikanSalahSatu,
  periksaTanggal,
  skemaTanggalWajib,
  ubahStatusBeli,
  type AksiBeli,
  type Aktor,
  type KaitBeli,
  type KepalaBeli,
} from '../beli/dokumen'
import { saringJual, type SaringJual } from './umum'

const JENIS = 'sales_return' as const
const INFO = DOK_BELI[JENIS]
const MENU = INFO.menu

export const skemaKepalaReturJual = z.object({
  date: skemaTanggalWajib('Tanggal retur'),
  reason: z.string().trim().min(5, 'Alasan retur minimal 5 huruf.').max(300, 'Alasan paling panjang 300 huruf.'),
})

export const skemaReturJualBaru = skemaKepalaReturJual.extend({ salesInvoiceId: idSkema('faktur penjualan') })

export async function buatReturJual(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaReturJualBaru.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const f = await tx.salesInvoice.findUnique({ where: { id: d.salesInvoiceId }, include: { customer: true } })
    if (!f || f.status !== 'Diposting') throw new GalatAturan('Faktur penjualan tidak ditemukan atau belum Diposting.', 'salesInvoiceId')
    if (d.date.getTime() < f.date.getTime()) throw new GalatAturan('Tanggal retur tidak boleh sebelum tanggal faktur.', 'date')
    const no = await ambilNomor(tx, JENIS, INFO.awalan, d.date)
    const r = await tx.salesReturn.create({ data: { no, date: d.date, reason: d.reason, salesInvoiceId: f.id, customerId: f.customerId, locationId: f.locationId, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'retur_jual.tambah', docType: JENIS, docId: r.id, summary: `Membuat draf retur penjualan ${no} dari ${f.no} (${f.customer.name})`, after: { no, faktur: f.no, date: d.date, reason: d.reason } })
    return r
  })
}

async function muatDraf(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const r = await tx.salesReturn.findUnique({ where: { id } })
  if (!r) throw new GalatAturan('Retur penjualan tidak ditemukan.')
  if (r.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return r
}

export async function ubahKepalaReturJual(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaReturJual.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const r = await muatDraf(tx, id)
    const f = await tx.salesInvoice.findUniqueOrThrow({ where: { id: r.salesInvoiceId }, select: { date: true } })
    if (d.date.getTime() < f.date.getTime()) throw new GalatAturan('Tanggal retur tidak boleh sebelum tanggal faktur.', 'date')
    const sebelum = { date: r.date.toISOString().slice(0, 10), reason: r.reason }
    const sesudah = { date: d.date.toISOString().slice(0, 10), reason: d.reason }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.salesReturn.update({ where: { id }, data: { ...d, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'retur_jual.ubah', docType: JENIS, docId: id, summary: `Mengubah kepala retur penjualan ${r.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

// Baris faktur asal dengan qty yang masih bisa diretur (satuan jual baris faktur).
export async function barisAsalReturJual(db: Db | Tx, salesInvoiceId: number) {
  const baris = await db.salesInvoiceLine.findMany({ where: { salesInvoiceId }, include: { product: { include: { baseUnit: true } }, unit: true }, orderBy: { id: 'asc' } })
  return baris.map((b) => ({ ...b, sisa: des(b.qty).minus(des(b.qtyReturned)) }))
}

// Simpan qty retur per baris faktur (isian qty_<id baris faktur>). Kosong atau 0 berarti baris tidak diretur.
export async function simpanBarisReturJual(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const r = await muatDraf(tx, id)
    const asal = await barisAsalReturJual(tx, r.salesInvoiceId)
    const lama = await tx.salesReturnLine.findMany({ where: { salesReturnId: id } })
    const peta = new Map(lama.map((b) => [b.salesInvoiceLineId, b]))
    const ubah: { produk: string; sebelum: string; sesudah: string }[] = []
    for (const a of asal) {
      const kini = peta.get(a.id)
      const q = skemaQtyOpsional({ label: `Qty retur ${a.product.name}`, boleh0: true }).safeParse(String(masukan[`qty_${a.id}`] ?? (kini ? isianQty(kini.qty) : '')))
      if (!q.success) throw new GalatAturan(q.error.issues[0].message, `qty_${a.id}`)
      const qty = q.data ?? NOL
      if (qty.gt(a.sisa)) throw new GalatAturan(`Qty retur ${a.product.name} melebihi qty yang belum diretur (${formatQty(a.sisa)}).`, `qty_${a.id}`)
      if (kini && qty.eq(des(kini.qty))) continue
      if (!kini && qty.isZero()) continue
      const lineTotal = keRupiah(qty.times(des(a.price)))
      if (kini && qty.isZero()) await tx.salesReturnLine.delete({ where: { id: kini.id } })
      else if (kini) await tx.salesReturnLine.update({ where: { id: kini.id }, data: { qty, price: a.price, lineTotal } })
      else await tx.salesReturnLine.create({ data: { salesReturnId: id, salesInvoiceLineId: a.id, productId: a.productId, qty, price: a.price, lineTotal } })
      ubah.push({ produk: a.product.code, sebelum: kini ? kini.qty.toString() : '0', sesudah: qty.toString() })
    }
    if (!ubah.length) return 0
    if ((await tx.salesReturnLine.count({ where: { salesReturnId: id } })) > BATAS_BARIS_BELI) throw new GalatAturan(`Satu dokumen paling banyak ${BATAS_BARIS_BELI} baris.`)
    const s = await tx.salesReturnLine.aggregate({ where: { salesReturnId: id }, _sum: { lineTotal: true } })
    await tx.salesReturn.update({ where: { id }, data: { subtotal: s._sum.lineTotal ?? 0n, total: s._sum.lineTotal ?? 0n, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'retur_jual.baris_ubah',
      docType: JENIS,
      docId: id,
      summary: `Mengubah qty retur ${ubah.length} baris ${r.no}`,
      before: ubah.map((u) => ({ produk: u.produk, qty: u.sebelum })),
      after: ubah.map((u) => ({ produk: u.produk, qty: u.sesudah })),
    })
    return ubah.length
  })
}

type KepalaReturJual = KepalaBeli & { salesInvoiceId: number; locationId: number; creditUsed: bigint }

export const KAIT_RETUR_JUAL: KaitBeli<KepalaReturJual> = {
  jenis: JENIS,
  muat: (tx, id) => tx.salesReturn.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.salesReturn.update({ where: { id }, data: dataPelaksana(data) }),
  butuhSetuju: async () => false,
  periksaIsi: async (tx, d) => {
    if (!(await tx.salesReturnLine.count({ where: { salesReturnId: d.id } }))) throw new GalatAturan('Isi qty retur minimal satu baris dulu.')
  },
  posting: async (tx, d, asal) => {
    const f = await tx.salesInvoice.findUniqueOrThrow({ where: { id: d.salesInvoiceId } })
    if (f.status !== 'Diposting') throw new GalatAturan(`Faktur ${f.no} tidak lagi Diposting.`)
    const baris = await tx.salesReturnLine.findMany({ where: { salesReturnId: d.id }, include: { product: true }, orderBy: { salesInvoiceLineId: 'asc' } })
    const hasil = new Map<number, { nilai: bigint; kredit: bigint; qtyDasar: Desimal; price: bigint }>()
    for (const b of baris) {
      await kunciBaris(tx, 'sales_invoice_line', b.salesInvoiceLineId)
      const g = await tx.salesInvoiceLine.findUniqueOrThrow({ where: { id: b.salesInvoiceLineId } })
      const q = des(b.qty)
      const sisa = des(g.qty).minus(des(g.qtyReturned))
      if (q.gt(sisa)) throw new GalatAturan(`Qty retur ${b.product.name} melebihi qty yang belum diretur (${formatQty(sisa)}).`)
      // HPP asal dan nota kredit sebanding qty. Retur yang menghabiskan baris faktur mengambil sisa persisnya, supaya
      // jumlah semua retur sama dengan nilai baris faktur.
      let nilai = keRupiah(new Desimal(g.value.toString()).times(q).div(des(g.qty)))
      let kredit = keRupiah(q.times(des(g.price)))
      if (q.eq(sisa)) {
        const dulu = await tx.salesReturnLine.aggregate({ where: { salesInvoiceLineId: g.id, salesReturn: { status: 'Diposting' } }, _sum: { value: true, lineTotal: true } })
        nilai = g.value - (dulu._sum.value ?? 0n)
        kredit = g.lineTotal - (dulu._sum.lineTotal ?? 0n)
      }
      hasil.set(b.id, { nilai, kredit, qtyDasar: q.times(des(g.factor)).toDecimalPlaces(3, Desimal.ROUND_HALF_UP), price: g.price })
      await tx.salesInvoiceLine.update({ where: { id: g.id }, data: { qtyReturned: des(g.qtyReturned).plus(q) } })
    }
    // Barang masuk lagi dengan nilai pasti = HPP asal (mesin stok, nilai masuk mengalahkan harga satuan).
    const gerak = await catatGerak(
      tx,
      asal,
      baris.map((b) => ({ productId: b.productId, locationId: d.locationId, qty: hasil.get(b.id)!.qtyDasar, nilai: hasil.get(b.id)!.nilai, lineId: b.id })),
    )
    for (const g of gerak) {
      const h = hasil.get(g.lineId!)!
      await tx.salesReturnLine.update({ where: { id: g.lineId! }, data: { unitCost: g.hargaSatuan, value: g.nilai, price: h.price, lineTotal: h.kredit } })
    }
    const nilai = gerak.reduce((n, g) => n + g.nilai, 0n)
    const kredit = [...hasil.values()].reduce((n, h) => n + h.kredit, 0n)
    await tx.salesReturn.update({ where: { id: d.id }, data: { subtotal: kredit, tax: 0n, total: kredit, value: nilai, creditUsed: 0n } })
    // tahap 6B: jurnal nota kredit dan persediaan kembali (KONTRAK 11 butir 96).
    const j = await jurnalReturJual(tx, d.id, asal.oleh)
    return { ringkas: `${baris.length} baris, HPP kembali ${formatRupiah(nilai)}, nota kredit ${formatRupiah(kredit)}`, sesudah: { baris: baris.length, hppKembali: nilai, notaKredit: kredit, jurnal: j?.no ?? null } }
  },
  batal: async (tx, d, _a, dari) => {
    if (dari !== 'Diposting') return
    if (d.creditUsed > 0n) throw new GalatAturan('Nota kredit retur ini sudah dipakai penerimaan pelanggan. Batalkan penerimaannya dulu.')
    const terima = await tx.customerPaymentAlloc.count({ where: { salesReturnId: d.id, customerPayment: { status: { in: ['Draft', 'Diajukan'] } } } })
    if (terima) throw new GalatAturan('Nota kredit retur ini sudah dialokasikan di draf penerimaan pelanggan. Kosongkan alokasinya dulu.')
    const baris = await tx.salesReturnLine.findMany({ where: { salesReturnId: d.id }, orderBy: { salesInvoiceLineId: 'asc' } })
    for (const b of baris) {
      await kunciBaris(tx, 'sales_invoice_line', b.salesInvoiceLineId)
      const g = await tx.salesInvoiceLine.findUniqueOrThrow({ where: { id: b.salesInvoiceLineId } })
      await tx.salesInvoiceLine.update({ where: { id: g.id }, data: { qtyReturned: Desimal.max(0, des(g.qtyReturned).minus(des(b.qty))) } })
    }
  },
  sesudahBalik: async (tx, d, aktor, tanggal) => {
    const b = await balikJurnalReturJual(tx, d.id, tanggal, aktor.id)
    return { sesudah: { jurnalBalik: b?.no ?? null } }
  },
}

export const ubahStatusReturJual = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiBeli, opsi: { alasan?: string } = {}) => ubahStatusBeli(db, k, aktor, KAIT_RETUR_JUAL, id, aksi, opsi)

export const hapusReturJual = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDrafBeli(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.salesReturn.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    await tx.salesReturn.delete({ where: { id } })
    return d
  })

export const muatReturJual = (db: Db, id: number) =>
  db.salesReturn.findUnique({
    where: { id },
    include: {
      customer: true,
      location: true,
      salesInvoice: { select: { id: true, no: true, status: true } },
      salesReturnLines: { include: { product: { include: { baseUnit: true } }, salesInvoiceLine: { include: { unit: true } } }, orderBy: { id: 'asc' } },
      customerPaymentAllocs: { where: { customerPayment: { status: { not: 'Batal' } } }, include: { customerPayment: { select: { id: true, no: true, status: true } } } },
    },
  })

export async function daftarReturJual(db: Db, s: SaringJual) {
  const { where, hal, per } = saringJual(s)
  const [baris, total] = await Promise.all([
    db.salesReturn.findMany({ where, include: { customer: true, salesInvoice: { select: { no: true } } }, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * per, take: per }),
    db.salesReturn.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: jumlahHal(total) }
}

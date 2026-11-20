// Retur Pembelian (tahap 4C, RANCANGAN 3.5). Mengembalikan barang dari satu Penerimaan Barang atau satu Pembelian Langsung
// yang Diposting. Stok keluar dengan nilai penerimaannya (bukan harga rata-rata). Dari penerimaan, qty retur diambil dulu
// dari bagian yang belum difakturkan (memotong qty yang menunggu faktur), sisanya dari bagian yang sudah difakturkan dan
// menjadi nota debit (qty x harga faktur) yang mengurangi hutang lewat Pembayaran Pembelian. Dari pembelian langsung,
// seluruh qty menjadi nota debit. Pilihan "minta ganti barang" membuka lagi sisa pesanan. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin } from '../izin-inti'
import { formatRupiah } from '../master'
import { ambilNomor } from '../nomor'
import { Desimal, NOL, des, formatQty, isianQty, keRupiah, skemaQtyOpsional } from '../stok/angka'
import { catatGerak } from '../stok/mesin'
import {
  BATAS_BARIS_BELI,
  DOK_BELI,
  dataPelaksana,
  hapusDrafBeli,

  jumlahHal,
  kunciBaris,
  pastikanSalahSatu,
  periksaTanggal,
  saringBeli,
  skemaTanggalWajib,
  ubahStatusBeli,
  type AksiBeli,
  type Aktor,
  type KaitBeli,
  type KepalaBeli,
  type SaringBeli,
} from './dokumen'
import { perbaruiProgresFaktur, batasTerima } from './penerimaan'
import { perbaruiProgresPesanan } from './pesanan'

const JENIS = 'purchase_return' as const
const INFO = DOK_BELI[JENIS]
const MENU = INFO.menu

export const CARA_SELESAI = { potong: 'Potong tagihan', ganti: 'Minta ganti barang' } as const

export const skemaKepalaRetur = z.object({
  date: skemaTanggalWajib('Tanggal retur'),
  reason: z.string().trim().min(5, 'Alasan retur minimal 5 huruf.').max(300, 'Alasan paling panjang 300 huruf.'),
  settleMode: z.enum(['potong', 'ganti'], { message: 'Pilih cara penyelesaian.' }),
})

export const skemaReturBaru = skemaKepalaRetur.extend({
  sumber: z.string().regex(/^(gr|bl):\d+$/, 'Pilih dokumen asal.').transform((v) => {
    const [jenis, id] = v.split(':')
    return { jenis: jenis as 'gr' | 'bl', id: Number(id) }
  }),
})

export async function buatRetur(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaReturBaru.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    let asal: { supplierId: number; locationId: number; no: string; date: Date }
    if (d.sumber.jenis === 'gr') {
      const gr = await tx.goodsReceipt.findUnique({ where: { id: d.sumber.id } })
      if (!gr || gr.status !== 'Diposting') throw new GalatAturan('Penerimaan barang tidak ditemukan atau belum Diposting.', 'sumber')
      asal = gr
    } else {
      const bl = await tx.directPurchase.findUnique({ where: { id: d.sumber.id } })
      if (!bl || bl.status !== 'Diposting') throw new GalatAturan('Pembelian langsung tidak ditemukan atau belum Diposting.', 'sumber')
      if (d.settleMode === 'ganti') throw new GalatAturan('Retur pembelian langsung hanya bisa potong tagihan, karena tidak ada pesanan yang dibuka lagi.', 'settleMode')
      asal = bl
    }
    if (d.date.getTime() < asal.date.getTime()) throw new GalatAturan('Tanggal retur tidak boleh sebelum tanggal dokumen asal.', 'date')
    const no = await ambilNomor(tx, JENIS, INFO.awalan, d.date)
    const r = await tx.purchaseReturn.create({
      data: {
        no,
        date: d.date,
        reason: d.reason,
        settleMode: d.settleMode,
        supplierId: asal.supplierId,
        locationId: asal.locationId,
        goodsReceiptId: d.sumber.jenis === 'gr' ? d.sumber.id : null,
        directPurchaseId: d.sumber.jenis === 'bl' ? d.sumber.id : null,
        createdBy: aktor.id,
        updatedBy: aktor.id,
      },
    })
    await catatAudit(tx, k, { action: 'retur_beli.tambah', docType: JENIS, docId: r.id, summary: `Membuat draf retur pembelian ${no} dari ${asal.no}`, after: { no, asal: asal.no, date: d.date, reason: d.reason, settleMode: d.settleMode } })
    return r
  })
}

async function muatDraf(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const r = await tx.purchaseReturn.findUnique({ where: { id } })
  if (!r) throw new GalatAturan('Retur pembelian tidak ditemukan.')
  if (r.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return r
}

export async function ubahKepalaRetur(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaRetur.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const r = await muatDraf(tx, id)
    if (r.directPurchaseId && d.settleMode === 'ganti') throw new GalatAturan('Retur pembelian langsung hanya bisa potong tagihan.', 'settleMode')
    const sebelum = { date: r.date.toISOString().slice(0, 10), reason: r.reason, settleMode: r.settleMode }
    const sesudah = { date: d.date.toISOString().slice(0, 10), reason: d.reason, settleMode: d.settleMode }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.purchaseReturn.update({ where: { id }, data: { ...d, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'retur_beli.ubah', docType: JENIS, docId: id, summary: `Mengubah kepala retur pembelian ${r.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

// Baris dokumen asal yang bisa diretur, dengan qty tersisa dalam satuan beli baris asal.
export async function barisAsalRetur(db: Db | Tx, r: { goodsReceiptId: number | null; directPurchaseId: number | null }) {
  if (r.goodsReceiptId) {
    const baris = await db.goodsReceiptLine.findMany({ where: { goodsReceiptId: r.goodsReceiptId }, include: { product: { include: { baseUnit: true } }, unit: true }, orderBy: { id: 'asc' } })
    return baris.map((b) => ({
      id: b.id,
      produk: b.product,
      satuan: b.unit.symbol,
      qty: des(b.qty),
      faktor: des(b.factor),
      nilai: b.value,
      difakturkan: des(b.qtyInvoiced),
      diretur: des(b.qtyReturned),
      sisa: des(b.qty).minus(des(b.qtyReturned)),
    }))
  }
  const baris = await db.directPurchaseLine.findMany({ where: { directPurchaseId: r.directPurchaseId!, productId: { not: null } }, include: { product: { include: { baseUnit: true } }, unit: true }, orderBy: { id: 'asc' } })
  return baris.map((b) => ({
    id: b.id,
    produk: b.product!,
    satuan: b.unit?.symbol ?? b.product!.baseUnit.symbol,
    qty: des(b.qty),
    faktor: des(b.factor),
    nilai: b.value,
    difakturkan: des(b.qty),
    diretur: des(b.qtyReturned),
    sisa: des(b.qty).minus(des(b.qtyReturned)),
  }))
}

// Simpan qty retur per baris asal (isian qty_<id baris asal>). Qty kosong atau 0 berarti baris tidak diretur.
export async function simpanBarisRetur(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const r = await muatDraf(tx, id)
    const asal = await barisAsalRetur(tx, r)
    const lama = await tx.purchaseReturnLine.findMany({ where: { purchaseReturnId: id } })
    const kunciAsal = (b: { goodsReceiptLineId: number | null; directPurchaseLineId: number | null }) => (b.goodsReceiptLineId ?? b.directPurchaseLineId)!
    const peta = new Map(lama.map((b) => [kunciAsal(b), b]))
    const ubah: { produk: string; sebelum: string; sesudah: string }[] = []
    for (const a of asal) {
      const kini = peta.get(a.id)
      const q = skemaQtyOpsional({ label: `Qty retur ${a.produk.name}`, boleh0: true }).safeParse(String(masukan[`qty_${a.id}`] ?? (kini ? isianQty(kini.qty) : '')))
      if (!q.success) throw new GalatAturan(q.error.issues[0].message, `qty_${a.id}`)
      const qty = q.data ?? NOL
      if (qty.gt(a.sisa)) throw new GalatAturan(`Qty retur ${a.produk.name} melebihi qty yang belum diretur (${formatQty(a.sisa)}).`, `qty_${a.id}`)
      if (kini && qty.eq(des(kini.qty))) continue
      if (!kini && qty.isZero()) continue
      if (kini && qty.isZero()) await tx.purchaseReturnLine.delete({ where: { id: kini.id } })
      else if (kini) await tx.purchaseReturnLine.update({ where: { id: kini.id }, data: { qty } })
      else
        await tx.purchaseReturnLine.create({
          data: { purchaseReturnId: id, productId: a.produk.id, qty, goodsReceiptLineId: r.goodsReceiptId ? a.id : null, directPurchaseLineId: r.directPurchaseId ? a.id : null },
        })
      ubah.push({ produk: a.produk.code, sebelum: kini ? kini.qty.toString() : '0', sesudah: qty.toString() })
    }
    if (!ubah.length) return 0
    if ((await tx.purchaseReturnLine.count({ where: { purchaseReturnId: id } })) > BATAS_BARIS_BELI) throw new GalatAturan(`Satu dokumen paling banyak ${BATAS_BARIS_BELI} baris.`)
    await tx.purchaseReturn.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'retur_beli.baris_ubah',
      docType: JENIS,
      docId: id,
      summary: `Mengubah qty retur ${ubah.length} baris ${r.no}`,
      before: ubah.map((u) => ({ produk: u.produk, qty: u.sebelum })),
      after: ubah.map((u) => ({ produk: u.produk, qty: u.sesudah })),
    })
    return ubah.length
  })
}

type KepalaRetur = KepalaBeli & { goodsReceiptId: number | null; directPurchaseId: number | null; locationId: number; settleMode: string; debitNoteUsed: bigint }

// Harga faktur rata-rata per satuan beli untuk satu baris penerimaan (jumlah baris faktur Diposting / qty faktur).
async function hargaFaktur(tx: Tx, grLineId: number) {
  const s = await tx.purchaseInvoiceLine.aggregate({ where: { goodsReceiptLineId: grLineId, purchaseInvoice: { status: 'Diposting' } }, _sum: { lineTotal: true, qty: true } })
  const qty = des(s._sum.qty ?? 0)
  return qty.gt(0) ? new Desimal((s._sum.lineTotal ?? 0n).toString()).div(qty) : NOL
}

export const KAIT_RETUR: KaitBeli<KepalaRetur> = {
  jenis: JENIS,
  muat: (tx, id) => tx.purchaseReturn.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.purchaseReturn.update({ where: { id }, data: dataPelaksana(data) }),
  butuhSetuju: async () => false,
  periksaIsi: async (tx, d) => {
    if (!(await tx.purchaseReturnLine.count({ where: { purchaseReturnId: d.id } }))) throw new GalatAturan('Isi qty retur minimal satu baris dulu.')
  },
  posting: async (tx, d, asal, aktor) => {
    const baris = await tx.purchaseReturnLine.findMany({ where: { purchaseReturnId: d.id }, include: { product: true }, orderBy: { id: 'asc' } })
    const hasilBaris: { id: number; nilai: bigint; uninv: Desimal; inv: Desimal; harga: bigint; nota: bigint; qtyDasar: Desimal }[] = []
    let poId: number | null = null
    if (d.goodsReceiptId) {
      const gr = await tx.goodsReceipt.findUniqueOrThrow({ where: { id: d.goodsReceiptId } })
      if (gr.status !== 'Diposting') throw new GalatAturan(`Penerimaan ${gr.no} tidak lagi Diposting.`)
      poId = gr.purchaseOrderId
      for (const b of [...baris].sort((a, b) => a.goodsReceiptLineId! - b.goodsReceiptLineId!)) {
        await kunciBaris(tx, 'goods_receipt_line', b.goodsReceiptLineId!)
        const g = await tx.goodsReceiptLine.findUniqueOrThrow({ where: { id: b.goodsReceiptLineId! } })
        const q = des(b.qty)
        const sisa = des(g.qty).minus(des(g.qtyReturned))
        if (q.gt(sisa)) throw new GalatAturan(`Qty retur ${b.product.name} melebihi qty yang belum diretur (${formatQty(sisa)}).`)
        // Bagian belum difakturkan dipakai lebih dulu (RANCANGAN 3.5).
        const belum = Desimal.max(0, des(g.qty).minus(des(g.qtyInvoiced)).minus(des(g.qtyRetUninv)))
        const uninv = Desimal.min(q, belum)
        const inv = q.minus(uninv)
        const hf = inv.gt(0) ? await hargaFaktur(tx, g.id) : NOL
        const nota = keRupiah(inv.times(hf))
        const nilai = keRupiah(new Desimal(g.value.toString()).times(q).div(des(g.qty)))
        hasilBaris.push({ id: b.id, nilai, uninv, inv, harga: keRupiah(hf), nota, qtyDasar: q.times(des(g.factor)).toDecimalPlaces(3, Desimal.ROUND_HALF_UP) })
        await tx.goodsReceiptLine.update({ where: { id: g.id }, data: { qtyReturned: des(g.qtyReturned).plus(q), qtyRetUninv: des(g.qtyRetUninv).plus(uninv) } })
        if (d.settleMode === 'ganti') {
          await kunciBaris(tx, 'purchase_order_line', g.purchaseOrderLineId)
          const p = await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: g.purchaseOrderLineId } })
          await tx.purchaseOrderLine.update({ where: { id: p.id }, data: { qtyReceived: Desimal.max(0, des(p.qtyReceived).minus(q)) } })
        }
      }
    } else {
      const bl = await tx.directPurchase.findUniqueOrThrow({ where: { id: d.directPurchaseId! } })
      if (bl.status !== 'Diposting') throw new GalatAturan(`Pembelian langsung ${bl.no} tidak lagi Diposting.`)
      for (const b of [...baris].sort((a, b) => a.directPurchaseLineId! - b.directPurchaseLineId!)) {
        await kunciBaris(tx, 'direct_purchase_line', b.directPurchaseLineId!)
        const g = await tx.directPurchaseLine.findUniqueOrThrow({ where: { id: b.directPurchaseLineId! } })
        const q = des(b.qty)
        const sisa = des(g.qty).minus(des(g.qtyReturned))
        if (q.gt(sisa)) throw new GalatAturan(`Qty retur ${b.product.name} melebihi qty yang belum diretur (${formatQty(sisa)}).`)
        const nilai = keRupiah(new Desimal(g.value.toString()).times(q).div(des(g.qty)))
        const harga = new Desimal(g.lineTotal.toString()).div(des(g.qty))
        hasilBaris.push({ id: b.id, nilai, uninv: NOL, inv: q, harga: keRupiah(harga), nota: keRupiah(q.times(harga)), qtyDasar: q.times(des(g.factor)).toDecimalPlaces(3, Desimal.ROUND_HALF_UP) })
        await tx.directPurchaseLine.update({ where: { id: g.id }, data: { qtyReturned: des(g.qtyReturned).plus(q) } })
      }
    }
    // Stok keluar dengan nilai penerimaannya, bukan harga rata-rata (mesin stok, nilai keluar pasti).
    const urut = new Map(hasilBaris.map((h) => [h.id, h]))
    const gerak = await catatGerak(
      tx,
      asal,
      baris.map((b) => ({ productId: b.productId, locationId: d.locationId, qty: urut.get(b.id)!.qtyDasar.neg(), nilai: -urut.get(b.id)!.nilai, lineId: b.id })),
    )
    for (const g of gerak) {
      const h = urut.get(g.lineId!)!
      await tx.purchaseReturnLine.update({ where: { id: h.id }, data: { unitCost: g.hargaSatuan, value: -g.nilai, qtyUninvoiced: h.uninv, qtyInvoiced: h.inv, invoicePrice: h.harga, debitNote: h.nota } })
    }
    const nilai = gerak.reduce((n, g) => n - g.nilai, 0n)
    const nota = hasilBaris.reduce((n, h) => n + h.nota, 0n)
    await tx.purchaseReturn.update({ where: { id: d.id }, data: { subtotal: nilai, tax: 0n, total: nota, debitNoteAmount: nota, debitNoteUsed: 0n } })
    if (d.goodsReceiptId) await perbaruiProgresFaktur(tx, d.goodsReceiptId)
    if (poId && d.settleMode === 'ganti') await perbaruiProgresPesanan(tx, poId, aktor)
    return { ringkas: `${baris.length} baris, nilai persediaan keluar ${formatRupiah(nilai)}, nota debit ${formatRupiah(nota)}`, sesudah: { baris: baris.length, nilaiKeluar: nilai, notaDebit: nota } }
  },
  batal: async (tx, d, aktor, dari) => {
    if (dari !== 'Diposting') return
    if (d.debitNoteUsed > 0n) throw new GalatAturan('Nota debit retur ini sudah dipakai pembayaran. Batalkan pembayarannya dulu.')
    const baris = await tx.purchaseReturnLine.findMany({ where: { purchaseReturnId: d.id }, include: { product: true } })
    if (d.goodsReceiptId) {
      const gr = await tx.goodsReceipt.findUniqueOrThrow({ where: { id: d.goodsReceiptId } })
      for (const b of [...baris].sort((a, b) => a.goodsReceiptLineId! - b.goodsReceiptLineId!)) {
        await kunciBaris(tx, 'goods_receipt_line', b.goodsReceiptLineId!)
        const g = await tx.goodsReceiptLine.findUniqueOrThrow({ where: { id: b.goodsReceiptLineId! } })
        // Bagian belum difakturkan kembali bisa ditarik ke faktur; bagian yang sudah difakturkan kembali tanpa nota debit.
        const uninv = des(b.qtyUninvoiced)
        await tx.goodsReceiptLine.update({ where: { id: g.id }, data: { qtyReturned: Desimal.max(0, des(g.qtyReturned).minus(des(b.qty))), qtyRetUninv: Desimal.max(0, des(g.qtyRetUninv).minus(uninv)) } })
        if (d.settleMode === 'ganti') {
          await kunciBaris(tx, 'purchase_order_line', g.purchaseOrderLineId)
          const p = await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: g.purchaseOrderLineId } })
          const baru = des(p.qtyReceived).plus(des(b.qty))
          if (baru.gt(batasTerima({ qty: p.qty, qtyReceived: '0' }, b.product.receiptTolPct))) throw new GalatAturan(`Barang pengganti ${b.product.name} sudah diterima. Batalkan penerimaan penggantinya dulu.`)
          await tx.purchaseOrderLine.update({ where: { id: p.id }, data: { qtyReceived: baru } })
        }
      }
      await perbaruiProgresFaktur(tx, d.goodsReceiptId)
      if (d.settleMode === 'ganti') await perbaruiProgresPesanan(tx, gr.purchaseOrderId, aktor)
    } else {
      for (const b of [...baris].sort((a, b) => a.directPurchaseLineId! - b.directPurchaseLineId!)) {
        await kunciBaris(tx, 'direct_purchase_line', b.directPurchaseLineId!)
        const g = await tx.directPurchaseLine.findUniqueOrThrow({ where: { id: b.directPurchaseLineId! } })
        await tx.directPurchaseLine.update({ where: { id: g.id }, data: { qtyReturned: Desimal.max(0, des(g.qtyReturned).minus(des(b.qty))) } })
      }
    }
  },
}

export const ubahStatusRetur = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiBeli, opsi: { alasan?: string } = {}) => ubahStatusBeli(db, k, aktor, KAIT_RETUR, id, aksi, opsi)

export const hapusRetur = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDrafBeli(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.purchaseReturn.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    await tx.purchaseReturn.delete({ where: { id } })
    return d
  })

export const muatRetur = (db: Db, id: number) =>
  db.purchaseReturn.findUnique({
    where: { id },
    include: {
      supplier: true,
      location: true,
      goodsReceipt: { select: { id: true, no: true } },
      directPurchase: { select: { id: true, no: true } },
      purchaseReturnLines: { include: { product: { include: { baseUnit: true } } }, orderBy: { id: 'asc' } },
      purchasePaymentAllocs: { where: { purchasePayment: { status: { not: 'Batal' } } }, include: { purchasePayment: { select: { id: true, no: true, status: true } } } },
    },
  })

export async function daftarRetur(db: Db, s: SaringBeli) {
  const { where: dasar, pemasok, hal, per } = saringBeli(s)
  const where = { ...dasar, ...(pemasok ? { supplierId: pemasok } : {}) }
  const [baris, total] = await Promise.all([
    db.purchaseReturn.findMany({ where, include: { supplier: true, goodsReceipt: { select: { no: true } }, directPurchase: { select: { no: true } } }, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * per, take: per }),
    db.purchaseReturn.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: jumlahHal(total) }
}

// Pilihan dokumen asal: penerimaan dan pembelian langsung Diposting yang masih punya barang belum diretur.
export async function pilihanAsalRetur(db: Db) {
  const [gr, bl] = await Promise.all([
    db.goodsReceipt.findMany({ where: { status: 'Diposting' }, include: { supplier: true, goodsReceiptLines: { select: { qty: true, qtyReturned: true } } }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 100 }),
    db.directPurchase.findMany({ where: { status: 'Diposting' }, include: { supplier: true, directPurchaseLines: { where: { productId: { not: null } }, select: { qty: true, qtyReturned: true } } }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 100 }),
  ])
  const ada = (b: { qty: Desimal; qtyReturned: Desimal }[]) => b.some((x) => des(x.qty).gt(des(x.qtyReturned)))
  return [
    ...gr.filter((g) => ada(g.goodsReceiptLines)).map((g) => ({ nilai: `gr:${g.id}`, label: `${g.no} · penerimaan · ${g.supplier.name}` })),
    ...bl.filter((g) => ada(g.directPurchaseLines)).map((g) => ({ nilai: `bl:${g.id}`, label: `${g.no} · pembelian langsung · ${g.supplier.name}` })),
  ]
}

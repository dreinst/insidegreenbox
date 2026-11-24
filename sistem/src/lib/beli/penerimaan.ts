// Penerimaan Barang (tahap 4C, RANCANGAN 3.3). Dokumen pelaksana dari satu Pesanan Pembelian yang Disetujui. Boleh
// sebagian, dan satu pesanan bisa diterima beberapa kali; qty terima tidak boleh melebihi sisa pesanan (ditambah
// toleransi terima produk). Saat Diposting stok masuk lewat mesin stok dengan hargaBeli: qty x faktor satuan ke satuan
// dasar, nilai = qty x harga ditambah bagian biaya tambahan. Progres faktur (Belum, Sebagian, Penuh) dihitung dari qty
// difakturkan ditambah qty yang diretur sebelum difakturkan. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan, GalatSaklar } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin, saklarNyala } from '../izin-inti'
import { formatRupiah, skemaUang } from '../master'
import { ambilNomor } from '../nomor'
import { Desimal, des, formatNilai, formatQty, isianQty, skemaQtyOpsional } from '../stok/angka'
import { catatGerak } from '../stok/mesin'
import {
  DOK_BELI,
  uangOpsional,
  dataPelaksana,
  bagiBiaya,
  hapusDrafBeli,
  hitungProgres,
  idSkema,
  jumlahHal,
  kunciBaris,
  lokasiAktif,
  nilaiBaris,
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
import { perbaruiProgresPesanan } from './pesanan'

const JENIS = 'goods_receipt' as const
const INFO = DOK_BELI[JENIS]
const MENU = INFO.menu

export const skemaKepalaPenerimaan = z.object({
  locationId: idSkema('lokasi'),
  date: skemaTanggalWajib('Tanggal terima'),
  deliveryNoteNo: z.string().trim().max(40, 'Nomor surat jalan paling panjang 40 huruf.').default(''),
  extraCost: uangOpsional('Biaya tambahan'),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

export const skemaPenerimaanBaru = skemaKepalaPenerimaan.extend({ purchaseOrderId: idSkema('pesanan pembelian') })

// Batas qty terima: sisa pesanan ditambah toleransi terima produk (persen dari qty pesan).
export function batasTerima(b: { qty: Desimal | string; qtyReceived: Desimal | string }, tolPct: Desimal | string) {
  const sisa = des(b.qty).minus(des(b.qtyReceived))
  const tol = des(b.qty).times(des(tolPct)).div(100)
  return Desimal.max(0, sisa.plus(tol)).toDecimalPlaces(3, Desimal.ROUND_DOWN)
}

export async function buatPenerimaan(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaPenerimaanBaru.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    await kunciBaris(tx, 'purchase_order', d.purchaseOrderId)
    const po = await tx.purchaseOrder.findUnique({ where: { id: d.purchaseOrderId }, include: { supplier: true, purchaseOrderLines: { include: { product: true }, orderBy: { id: 'asc' } } } })
    if (!po || po.status !== 'Disetujui') throw new GalatAturan('Pesanan harus berstatus Disetujui untuk diterima.', 'purchaseOrderId')
    if (d.date.getTime() < po.date.getTime()) throw new GalatAturan('Tanggal terima tidak boleh sebelum tanggal pesanan.', 'date')
    const l = await lokasiAktif(tx, d.locationId)
    const sisa = po.purchaseOrderLines.map((b) => ({ b, sisa: des(b.qty).minus(des(b.qtyReceived)) })).filter((x) => x.sisa.gt(0))
    if (!sisa.length) throw new GalatAturan('Semua barang pesanan ini sudah diterima.', 'purchaseOrderId')
    const no = await ambilNomor(tx, JENIS, INFO.awalan, d.date)
    const { purchaseOrderId, ...kepala } = d
    const gr = await tx.goodsReceipt.create({ data: { ...kepala, purchaseOrderId, supplierId: po.supplierId, no, createdBy: aktor.id, updatedBy: aktor.id } })
    // Baris bawaan: sisa qty tiap baris pesanan dengan harga pesanan.
    for (const { b, sisa: q } of sisa) {
      await tx.goodsReceiptLine.create({ data: { goodsReceiptId: gr.id, purchaseOrderLineId: b.id, productId: b.productId, unitId: b.unitId, qty: q, price: b.price, factor: b.factor } })
    }
    await catatAudit(tx, k, {
      action: 'penerimaan.tambah',
      docType: JENIS,
      docId: gr.id,
      summary: `Membuat draf penerimaan barang ${no} dari ${po.no} (${po.supplier.name}) di ${l.name}, ${sisa.length} baris sisa pesanan`,
      after: { no, pesanan: po.no, lokasi: l.name, ...kepala },
    })
    return gr
  })
}

async function muatDraf(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const gr = await tx.goodsReceipt.findUnique({ where: { id }, include: { location: true } })
  if (!gr) throw new GalatAturan('Penerimaan barang tidak ditemukan.')
  if (gr.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return gr
}

export async function ubahKepalaPenerimaan(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaPenerimaan.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const gr = await muatDraf(tx, id)
    const l = await lokasiAktif(tx, d.locationId)
    const sebelum = { lokasi: gr.location.name, date: gr.date.toISOString().slice(0, 10), deliveryNoteNo: gr.deliveryNoteNo, extraCost: gr.extraCost.toString(), note: gr.note }
    const sesudah = { lokasi: l.name, date: d.date.toISOString().slice(0, 10), deliveryNoteNo: d.deliveryNoteNo, extraCost: d.extraCost.toString(), note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.goodsReceipt.update({ where: { id }, data: { ...d, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'penerimaan.ubah', docType: JENIS, docId: id, summary: `Mengubah kepala penerimaan barang ${gr.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

// Simpan qty dan harga terima semua baris (isian qty_<id> dan price_<id>). Qty kosong atau 0 menghapus barisnya.
export async function simpanBarisPenerimaan(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const gr = await muatDraf(tx, id)
    const baris = await tx.goodsReceiptLine.findMany({ where: { goodsReceiptId: id }, include: { product: true, purchaseOrderLine: true }, orderBy: { id: 'asc' } })
    const ubah: { lineId: number; produk: string; sebelum: Record<string, string>; sesudah: Record<string, string> | null }[] = []
    for (const b of baris) {
      const q = skemaQtyOpsional({ label: `Qty ${b.product.name}`, boleh0: true }).safeParse(String(masukan[`qty_${b.id}`] ?? isianQty(b.qty)))
      if (!q.success) throw new GalatAturan(q.error.issues[0].message, `qty_${b.id}`)
      const h = b.purchaseOrderLine.isFree ? { success: true as const, data: 0n } : skemaUang({ label: `Harga ${b.product.name}`, min: 0n }).safeParse(String(masukan[`price_${b.id}`] ?? b.price.toString()))
      if (!h.success) throw new GalatAturan(h.error.issues[0].message, `price_${b.id}`)
      const qty = q.data ?? new Desimal(0)
      if (qty.isZero()) {
        await tx.goodsReceiptLine.delete({ where: { id: b.id } })
        ubah.push({ lineId: b.id, produk: b.product.code, sebelum: { qty: b.qty.toString(), price: b.price.toString() }, sesudah: null })
        continue
      }
      if (qty.eq(des(b.qty)) && h.data === b.price) continue
      const batas = batasTerima(b.purchaseOrderLine, b.product.receiptTolPct)
      if (qty.gt(batas)) throw new GalatAturan(`Qty ${b.product.name} melebihi sisa pesanan (${formatQty(batas)}).`, `qty_${b.id}`)
      if (h.data !== b.purchaseOrderLine.price && !saklarNyala(aktor, 'beli.ubah_harga_po')) {
        throw new GalatSaklar('beli.ubah_harga_po', `Harga ${b.product.name} harus sama dengan harga pesanan ${formatRupiah(b.purchaseOrderLine.price)}. Mengubah harga butuh saklar Ubah harga pesanan.`, `price_${b.id}`)
      }
      if (!b.purchaseOrderLine.isFree && h.data <= 0n) throw new GalatAturan(`Harga ${b.product.name} harus lebih dari 0.`, `price_${b.id}`)
      await tx.goodsReceiptLine.update({ where: { id: b.id }, data: { qty, price: h.data } })
      ubah.push({ lineId: b.id, produk: b.product.code, sebelum: { qty: b.qty.toString(), price: b.price.toString() }, sesudah: { qty: qty.toString(), price: h.data.toString() } })
    }
    if (!ubah.length) return 0
    await tx.goodsReceipt.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'penerimaan.baris_ubah',
      docType: JENIS,
      docId: id,
      summary: `Mengubah qty atau harga ${ubah.length} baris ${gr.no}`,
      before: ubah.map((u) => ({ lineId: u.lineId, produk: u.produk, ...u.sebelum })),
      after: ubah.map((u) => ({ lineId: u.lineId, produk: u.produk, ...(u.sesudah ?? { dihapus: 'ya' }) })),
    })
    return ubah.length
  })
}

// Progres faktur: (qty difakturkan + qty diretur sebelum difakturkan) dibanding qty terima.
export async function perbaruiProgresFaktur(tx: Tx, id: number) {
  const baris = await tx.goodsReceiptLine.findMany({ where: { goodsReceiptId: id } })
  const progres = hitungProgres(baris.map((b) => ({ target: b.qty, selesai: des(b.qtyInvoiced).plus(des(b.qtyRetUninv)) })))
  await tx.goodsReceipt.update({ where: { id }, data: { invoiceProgress: progres } })
  return progres
}

type KepalaPenerimaan = KepalaBeli & { purchaseOrderId: number; locationId: number; extraCost: bigint }

export const KAIT_PENERIMAAN: KaitBeli<KepalaPenerimaan> = {
  jenis: JENIS,
  muat: (tx, id) => tx.goodsReceipt.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.goodsReceipt.update({ where: { id }, data: dataPelaksana(data) }),
  butuhSetuju: async () => false,
  periksaIsi: async (tx, d) => {
    if (!(await tx.goodsReceiptLine.count({ where: { goodsReceiptId: d.id } }))) throw new GalatAturan('Tidak ada baris yang diterima.')
  },
  posting: async (tx, d, asal, aktor) => {
    await kunciBaris(tx, 'purchase_order', d.purchaseOrderId)
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: d.purchaseOrderId } })
    if (po.status !== 'Disetujui') throw new GalatAturan(`Pesanan ${po.no} berstatus ${po.status}, jadi tidak bisa diterima.`)
    await lokasiAktif(tx, d.locationId)
    const baris = await tx.goodsReceiptLine.findMany({ where: { goodsReceiptId: d.id }, include: { product: true }, orderBy: { id: 'asc' } })
    // Kunci baris pesanan berurutan, lalu periksa sisa terhadap qty diterima terbaru.
    for (const id of [...new Set(baris.map((b) => b.purchaseOrderLineId))].sort((a, b) => a - b)) await kunciBaris(tx, 'purchase_order_line', id)
    const pol = new Map((await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } })).map((b) => [b.id, b]))
    const pakai = new Map<number, Desimal>()
    for (const b of baris) {
      if (!b.product.active) throw new GalatAturan(`Produk ${b.product.name} sudah nonaktif.`)
      const p = pol.get(b.purchaseOrderLineId)
      if (!p) throw new GalatAturan(`Baris pesanan untuk ${b.product.name} tidak ditemukan.`)
      const sudah = pakai.get(p.id) ?? new Desimal(0)
      const batas = batasTerima({ qty: p.qty, qtyReceived: des(p.qtyReceived).plus(sudah) }, b.product.receiptTolPct)
      if (des(b.qty).gt(batas)) throw new GalatAturan(`Qty ${b.product.name} (${formatQty(b.qty)}) melebihi sisa pesanan ${po.no} (${formatQty(batas)}).`)
      pakai.set(p.id, sudah.plus(des(b.qty)))
    }
    const dasar = baris.map((b) => nilaiBaris(b.qty, b.price))
    const biaya = bagiBiaya(d.extraCost, dasar)
    const nilai = dasar.map((n, i) => n + biaya[i])
    const gerak = baris.map((b, i) => ({ productId: b.productId, locationId: d.locationId, qty: des(b.qty).times(des(b.factor)).toDecimalPlaces(3, Desimal.ROUND_HALF_UP), nilai: nilai[i], lineId: b.id }))
    // Barang bonus (harga 0) tidak boleh menimpa harga beli terakhir, jadi digerakkan tanpa hargaBeli.
    const bonus = new Set(baris.filter((b) => b.price === 0n).map((b) => b.id))
    const hasil = [
      ...(await catatGerak(tx, asal, gerak.filter((g) => !bonus.has(g.lineId)), { hargaBeli: true })),
      ...(bonus.size ? await catatGerak(tx, asal, gerak.filter((g) => bonus.has(g.lineId))) : []),
    ]
    const harga = new Map(hasil.map((h) => [h.lineId, h.hargaSatuan]))
    for (const [i, b] of baris.entries()) {
      await tx.goodsReceiptLine.update({ where: { id: b.id }, data: { unitCost: harga.get(b.id), extraAlloc: biaya[i], value: nilai[i] } })
    }
    for (const [id, q] of pakai) await tx.purchaseOrderLine.update({ where: { id }, data: { qtyReceived: des(pol.get(id)!.qtyReceived).plus(q) } })
    const subtotal = dasar.reduce((a, b) => a + b, 0n)
    await tx.goodsReceipt.update({ where: { id: d.id }, data: { subtotal, invoiceProgress: 'Belum' } })
    const progres = await perbaruiProgresPesanan(tx, po.id, aktor)
    const total = subtotal + d.extraCost
    return {
      ringkas: `${baris.length} baris, nilai ${formatNilai(total)}${d.extraCost ? ` termasuk biaya tambahan ${formatNilai(d.extraCost)}` : ''}; ${po.no} diterima ${progres.receiveProgress.toLowerCase()}${progres.status === 'Selesai' ? ' dan Selesai' : ''}`,
      sesudah: { baris: baris.length, nilai: total, pesanan: po.no, progresTerima: progres.receiveProgress },
    }
  },
  batal: async (tx, d, aktor, dari) => {
    if (dari !== 'Diposting') return
    const baris = await tx.goodsReceiptLine.findMany({ where: { goodsReceiptId: d.id }, orderBy: { id: 'asc' } })
    if (baris.some((b) => des(b.qtyInvoiced).gt(0)) || (await tx.purchaseInvoiceLine.count({ where: { goodsReceiptId: d.id, purchaseInvoice: { status: 'Diposting' } } }))) {
      throw new GalatAturan('Penerimaan ini sudah difakturkan. Batalkan fakturnya dulu.')
    }
    if (baris.some((b) => des(b.qtyReturned).gt(0))) throw new GalatAturan('Penerimaan ini sudah diretur. Batalkan returnya dulu.')
    await kunciBaris(tx, 'purchase_order', d.purchaseOrderId)
    for (const b of [...baris].sort((a, b) => a.purchaseOrderLineId - b.purchaseOrderLineId)) {
      await kunciBaris(tx, 'purchase_order_line', b.purchaseOrderLineId)
      const p = await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: b.purchaseOrderLineId } })
      await tx.purchaseOrderLine.update({ where: { id: p.id }, data: { qtyReceived: Desimal.max(0, des(p.qtyReceived).minus(des(b.qty))) } })
    }
    const progres = await perbaruiProgresPesanan(tx, d.purchaseOrderId, aktor)
    return { sesudah: { progresTerima: progres.receiveProgress } }
  },
}

export const ubahStatusPenerimaan = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiBeli, opsi: { alasan?: string } = {}) => ubahStatusBeli(db, k, aktor, KAIT_PENERIMAAN, id, aksi, opsi)

export const hapusPenerimaan = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDrafBeli(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.goodsReceipt.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    await tx.goodsReceipt.delete({ where: { id } })
    return d
  })

export const muatPenerimaan = (db: Db, id: number) =>
  db.goodsReceipt.findUnique({
    where: { id },
    include: {
      supplier: true,
      location: true,
      purchaseOrder: true,
      goodsReceiptLines: { include: { product: { include: { baseUnit: true } }, unit: true, purchaseOrderLine: true }, orderBy: { id: 'asc' } },
      purchaseInvoiceLines: { where: { purchaseInvoice: { status: { not: 'Batal' } } }, select: { purchaseInvoice: { select: { id: true, no: true, status: true } } } },
      purchaseReturns: { where: { status: { not: 'Batal' } }, select: { id: true, no: true, status: true } },
    },
  })

export async function daftarPenerimaan(db: Db, s: SaringBeli) {
  const { where: dasar, pemasok, hal, per } = saringBeli(s)
  const where = { ...dasar, ...(pemasok ? { supplierId: pemasok } : {}) }
  const [baris, total] = await Promise.all([
    db.goodsReceipt.findMany({ where, include: { supplier: true, purchaseOrder: { select: { no: true } }, location: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * per, take: per }),
    db.goodsReceipt.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: jumlahHal(total) }
}

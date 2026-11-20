// Faktur Pembelian (tahap 4C, RANCANGAN 3.4). Mencatat tagihan pemasok dan memunculkan hutang. Baris barang ditarik dari
// satu atau beberapa penerimaan Diposting milik pemasok yang sama, biaya tambahan penerimaan ikut tertarik, dan boleh ada
// baris jasa tanpa penerimaan. Selisih harga faktur lawan harga terima disimpan per baris dan di kepala (price_diff) dan
// nanti dijurnal ke Selisih Harga Pembelian (KONTRAK 11). Selisih di atas batas approval_rule (bawaan 5 persen dari nilai
// penerimaan yang difakturkan) wajib disetujui Owner. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin, saklarNyala } from '../izin-inti'
import { formatRupiah, skemaTanggal, skemaUang } from '../master'
import { ambilNomor } from '../nomor'
import { Desimal, des, formatQty, isianQty, skemaQtyOpsional } from '../stok/angka'
import {
  BATAS_BARIS_BELI,
  DOK_BELI,
  dataPelaksana,
  aturanBeli,
  hapusDrafBeli,
  idSkema,
  jatuhTempo,
  jumlahHal,
  kunciBaris,
  nilaiBaris,
  pastikanSalahSatu,
  pemasokAktif,
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
import { perbaruiProgresFaktur } from './penerimaan'

const JENIS = 'purchase_invoice' as const
const INFO = DOK_BELI[JENIS]
const MENU = INFO.menu

export const JENIS_BARIS_FAKTUR = { barang: 'Barang', biaya_terima: 'Biaya tambahan penerimaan', jasa: 'Jasa atau biaya' } as const

export const skemaKepalaFaktur = z.object({
  supplierId: idSkema('pemasok'),
  date: skemaTanggalWajib('Tanggal faktur'),
  supplierInvoiceNo: z.string().trim().min(1, 'Nomor faktur pemasok wajib diisi.').max(40, 'Nomor faktur pemasok paling panjang 40 huruf.'),
  dueDate: skemaTanggal('Jatuh tempo'),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

export const skemaBiayaFaktur = z.object({
  description: z.string().trim().min(3, 'Keterangan minimal 3 huruf.').max(120, 'Keterangan paling panjang 120 huruf.'),
  amount: skemaUang({ label: 'Jumlah', max: 1_000_000_000n }),
})

async function periksaNomorPemasok(tx: Tx, supplierId: number, no: string, kecuali?: number) {
  const ada = await tx.purchaseInvoice.findFirst({ where: { supplierId, supplierInvoiceNo: { equals: no, mode: 'insensitive' }, status: { not: 'Batal' }, ...(kecuali ? { NOT: { id: kecuali } } : {}) } })
  if (ada) throw new GalatAturan(`Nomor faktur pemasok ini sudah tercatat di ${ada.no}.`, 'supplierInvoiceNo')
}

function periksaKepala(aktor: Aktor, d: z.infer<typeof skemaKepalaFaktur>) {
  periksaTanggal(aktor, d.date)
  if (d.dueDate && d.dueDate.getTime() < d.date.getTime()) throw new GalatAturan('Jatuh tempo tidak boleh sebelum tanggal faktur.', 'dueDate')
}

export async function buatFaktur(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKepalaFaktur.parse(masukan)
  periksaKepala(aktor, d)
  return db.$transaction(async (tx) => {
    const s = await pemasokAktif(tx, d.supplierId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('faktur-pemasok'), ${s.id})`
    await periksaNomorPemasok(tx, s.id, d.supplierInvoiceNo)
    const no = await ambilNomor(tx, JENIS, INFO.awalan, d.date)
    const dueDate = d.dueDate ?? jatuhTempo(d.date, s.creditDays)
    const f = await tx.purchaseInvoice.create({ data: { ...d, dueDate, no, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'faktur.tambah', docType: JENIS, docId: f.id, summary: `Membuat draf faktur pembelian ${no} dari ${s.name} (nomor pemasok ${d.supplierInvoiceNo})`, after: { no, pemasok: s.name, ...d, dueDate } })
    return f
  })
}

async function muatDraf(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const f = await tx.purchaseInvoice.findUnique({ where: { id }, include: { supplier: true } })
  if (!f) throw new GalatAturan('Faktur pembelian tidak ditemukan.')
  if (f.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return f
}

export async function ubahKepalaFaktur(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaFaktur.parse(masukan)
  periksaKepala(aktor, d)
  return db.$transaction(async (tx) => {
    const f = await muatDraf(tx, id)
    if (d.supplierId !== f.supplierId && (await tx.purchaseInvoiceLine.count({ where: { purchaseInvoiceId: id, goodsReceiptId: { not: null } } }))) {
      throw new GalatAturan('Pemasok tidak bisa diganti karena faktur sudah menarik penerimaan. Hapus baris penerimaannya dulu.', 'supplierId')
    }
    const s = await pemasokAktif(tx, d.supplierId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('faktur-pemasok'), ${s.id})`
    await periksaNomorPemasok(tx, s.id, d.supplierInvoiceNo, id)
    const dueDate = d.dueDate ?? jatuhTempo(d.date, s.creditDays)
    const iso = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null)
    const sebelum = { pemasok: f.supplier.name, date: iso(f.date), supplierInvoiceNo: f.supplierInvoiceNo, dueDate: iso(f.dueDate), note: f.note }
    const sesudah = { pemasok: s.name, date: iso(d.date), supplierInvoiceNo: d.supplierInvoiceNo, dueDate: iso(dueDate), note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.purchaseInvoice.update({ where: { id }, data: { ...d, dueDate, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'faktur.ubah', docType: JENIS, docId: id, summary: `Mengubah kepala faktur pembelian ${f.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

// Qty yang masih bisa difakturkan: qty terima - qty difakturkan - qty diretur sebelum difakturkan.
export const sisaFaktur = (b: { qty: Desimal | string; qtyInvoiced: Desimal | string; qtyRetUninv: Desimal | string }) => des(b.qty).minus(des(b.qtyInvoiced)).minus(des(b.qtyRetUninv))

// Biaya tambahan penerimaan yang sudah tertagih di faktur Diposting lain.
const biayaSudahDifakturkan = async (tx: Tx | Db, grId: number, kecuali?: number) =>
  (await tx.purchaseInvoiceLine.count({ where: { goodsReceiptId: grId, kind: 'biaya_terima', purchaseInvoice: { status: 'Diposting', ...(kecuali ? { NOT: { id: kecuali } } : {}) } } })) > 0

// Hitung ulang nilai penerimaan, jumlah baris, selisih harga, dan total faktur.
export async function hitungUlangFaktur(tx: Tx, id: number) {
  const baris = await tx.purchaseInvoiceLine.findMany({ where: { purchaseInvoiceId: id }, include: { goodsReceiptLine: true, goodsReceipt: true } })
  let total = 0n
  let selisih = 0n
  for (const b of baris) {
    const jumlah = b.kind === 'barang' ? nilaiBaris(b.qty, b.price) : b.price
    const terima = b.kind === 'barang' ? nilaiBaris(b.qty, b.goodsReceiptLine!.price) : b.kind === 'biaya_terima' ? b.goodsReceipt!.extraCost : 0n
    const beda = b.kind === 'jasa' ? 0n : jumlah - terima
    if (jumlah !== b.lineTotal || terima !== b.receiptValue || beda !== b.priceDiff) await tx.purchaseInvoiceLine.update({ where: { id: b.id }, data: { lineTotal: jumlah, receiptValue: terima, priceDiff: beda } })
    total += jumlah
    selisih += beda
  }
  await tx.purchaseInvoice.update({ where: { id }, data: { subtotal: total, tax: 0n, total, priceDiff: selisih } })
  return { total, selisih }
}

// Penerimaan Diposting milik pemasok yang masih punya qty atau biaya tambahan untuk difakturkan.
export async function penerimaanBelumDifakturkan(db: Db | Tx, supplierId: number) {
  const gr = await db.goodsReceipt.findMany({
    where: { supplierId, status: 'Diposting', invoiceProgress: { not: 'Penuh' } },
    include: { goodsReceiptLines: { include: { product: true, unit: true } } },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    take: 100,
  })
  return gr.filter((g) => g.goodsReceiptLines.some((b) => sisaFaktur(b).gt(0)))
}

// Tarik semua baris penerimaan yang belum difakturkan (qty bawaan = sisa, harga bawaan = harga terima) dan biaya
// tambahannya bila belum tertagih.
export async function tarikPenerimaan(db: Db, k: Konteks, aktor: Aktor, id: number, grId: number) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const f = await muatDraf(tx, id)
    const gr = await tx.goodsReceipt.findUnique({ where: { id: grId }, include: { goodsReceiptLines: { include: { product: true }, orderBy: { id: 'asc' } } } })
    if (!gr || gr.status !== 'Diposting') throw new GalatAturan('Penerimaan tidak ditemukan atau belum Diposting.', 'goodsReceiptId')
    if (gr.supplierId !== f.supplierId) throw new GalatAturan('Penerimaan ini milik pemasok lain. Satu faktur hanya untuk satu pemasok.', 'goodsReceiptId')
    const ada = new Set((await tx.purchaseInvoiceLine.findMany({ where: { purchaseInvoiceId: id, goodsReceiptId: grId } })).map((b) => (b.kind === 'biaya_terima' ? 'biaya' : String(b.goodsReceiptLineId))))
    let n = 0
    for (const b of gr.goodsReceiptLines) {
      const sisa = sisaFaktur(b)
      if (!sisa.gt(0) || ada.has(String(b.id))) continue
      await tx.purchaseInvoiceLine.create({ data: { purchaseInvoiceId: id, kind: 'barang', goodsReceiptId: grId, goodsReceiptLineId: b.id, productId: b.productId, qty: sisa, price: b.price } })
      n++
    }
    if (gr.extraCost > 0n && !ada.has('biaya') && !(await biayaSudahDifakturkan(tx, grId))) {
      await tx.purchaseInvoiceLine.create({ data: { purchaseInvoiceId: id, kind: 'biaya_terima', goodsReceiptId: grId, description: `Biaya tambahan ${gr.no}`, qty: 1, price: gr.extraCost } })
      n++
    }
    if (!n) throw new GalatAturan('Semua baris penerimaan ini sudah ada di faktur atau sudah difakturkan.', 'goodsReceiptId')
    if ((await tx.purchaseInvoiceLine.count({ where: { purchaseInvoiceId: id } })) > BATAS_BARIS_BELI) throw new GalatAturan(`Satu dokumen paling banyak ${BATAS_BARIS_BELI} baris.`)
    const h = await hitungUlangFaktur(tx, id)
    await tx.purchaseInvoice.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'faktur.baris_tambah', docType: JENIS, docId: id, summary: `Menarik ${n} baris dari ${gr.no} ke ${f.no}, total ${formatRupiah(h.total)}`, after: { penerimaan: gr.no, baris: n, total: h.total } })
    return n
  })
}

export async function tambahBiayaFaktur(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaBiayaFaktur.parse(masukan)
  return db.$transaction(async (tx) => {
    const f = await muatDraf(tx, id)
    if ((await tx.purchaseInvoiceLine.count({ where: { purchaseInvoiceId: id } })) >= BATAS_BARIS_BELI) throw new GalatAturan(`Satu dokumen paling banyak ${BATAS_BARIS_BELI} baris.`)
    const b = await tx.purchaseInvoiceLine.create({ data: { purchaseInvoiceId: id, kind: 'jasa', description: d.description, qty: 1, price: d.amount } })
    const h = await hitungUlangFaktur(tx, id)
    await catatAudit(tx, k, { action: 'faktur.baris_tambah', docType: JENIS, docId: id, summary: `Menambah baris jasa ${f.no}: ${d.description} ${formatRupiah(d.amount)}, total ${formatRupiah(h.total)}`, after: { lineId: b.id, ...d } })
    return b
  })
}

// Simpan qty dan harga semua baris (qty_<id>, price_<id>). Beda dari penerimaan butuh saklar beli.ubah_harga_faktur, dan
// qty hanya boleh lebih kecil dari sisa yang belum difakturkan.
export async function simpanBarisFaktur(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const f = await muatDraf(tx, id)
    const baris = await tx.purchaseInvoiceLine.findMany({ where: { purchaseInvoiceId: id }, include: { goodsReceiptLine: { include: { product: true } }, goodsReceipt: true }, orderBy: { id: 'asc' } })
    const ubah: { lineId: number; sebelum: Record<string, string>; sesudah: Record<string, string> }[] = []
    const bolehUbah = saklarNyala(aktor, 'beli.ubah_harga_faktur')
    for (const b of baris) {
      const nama = b.kind === 'barang' ? b.goodsReceiptLine!.product.name : b.description
      const h = skemaUang({ label: `Harga ${nama}`, min: 0n, max: 1_000_000_000n }).safeParse(String(masukan[`price_${b.id}`] ?? b.price.toString()))
      if (!h.success) throw new GalatAturan(h.error.issues[0].message, `price_${b.id}`)
      let qty = des(b.qty)
      if (b.kind === 'barang') {
        const q = skemaQtyOpsional({ label: `Qty ${nama}` }).safeParse(String(masukan[`qty_${b.id}`] ?? isianQty(b.qty)))
        if (!q.success || !q.data) throw new GalatAturan(q.success ? `Qty ${nama} wajib diisi.` : q.error.issues[0].message, `qty_${b.id}`)
        qty = q.data
        const sisa = sisaFaktur(b.goodsReceiptLine!)
        if (qty.gt(sisa)) throw new GalatAturan(`Qty ${nama} melebihi qty yang belum difakturkan (${formatQty(sisa)}).`, `qty_${b.id}`)
        if ((!qty.eq(sisa) || h.data !== b.goodsReceiptLine!.price) && !bolehUbah) throw new GalatAturan(`Qty dan harga ${nama} harus sama dengan penerimaan. Mengubahnya butuh saklar Ubah harga faktur.`, `price_${b.id}`)
      } else if (b.kind === 'biaya_terima' && h.data !== b.goodsReceipt!.extraCost && !bolehUbah) {
        throw new GalatAturan(`Biaya tambahan harus sama dengan penerimaan (${formatRupiah(b.goodsReceipt!.extraCost)}). Mengubahnya butuh saklar Ubah harga faktur.`, `price_${b.id}`)
      }
      if (qty.eq(des(b.qty)) && h.data === b.price) continue
      await tx.purchaseInvoiceLine.update({ where: { id: b.id }, data: { qty, price: h.data } })
      ubah.push({ lineId: b.id, sebelum: { qty: b.qty.toString(), price: b.price.toString() }, sesudah: { qty: qty.toString(), price: h.data.toString() } })
    }
    if (!ubah.length) return 0
    const t = await hitungUlangFaktur(tx, id)
    await tx.purchaseInvoice.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'faktur.baris_ubah',
      docType: JENIS,
      docId: id,
      summary: `Mengubah ${ubah.length} baris ${f.no}, total ${formatRupiah(t.total)}, selisih harga ${formatRupiah(t.selisih)}`,
      before: ubah.map((u) => ({ lineId: u.lineId, ...u.sebelum })),
      after: ubah.map((u) => ({ lineId: u.lineId, ...u.sesudah })),
    })
    return ubah.length
  })
}

export async function hapusBarisFaktur(db: Db, k: Konteks, aktor: Aktor, id: number, idBaris: number) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const f = await muatDraf(tx, id)
    const b = await tx.purchaseInvoiceLine.findFirst({ where: { id: idBaris, purchaseInvoiceId: id } })
    if (!b) throw new GalatAturan('Baris tidak ditemukan.')
    await tx.purchaseInvoiceLine.delete({ where: { id: idBaris } })
    const h = await hitungUlangFaktur(tx, id)
    await catatAudit(tx, k, { action: 'faktur.baris_hapus', docType: JENIS, docId: id, summary: `Menghapus baris ${f.no}, total ${formatRupiah(h.total)}`, before: { lineId: b.id, kind: b.kind, qty: b.qty, price: b.price } })
  })
}

type KepalaFaktur = KepalaBeli & { supplierId: number; supplierInvoiceNo: string; total: bigint; priceDiff: bigint; paidAmount: bigint }

// Persen selisih harga terhadap nilai penerimaan yang difakturkan.
export async function persenSelisih(tx: Tx | Db, id: number) {
  const s = await tx.purchaseInvoiceLine.aggregate({ where: { purchaseInvoiceId: id, kind: { in: ['barang', 'biaya_terima'] } }, _sum: { receiptValue: true, priceDiff: true } })
  const terima = s._sum.receiptValue ?? 0n
  const beda = s._sum.priceDiff ?? 0n
  return { terima, beda, persen: terima > 0n ? new Desimal((beda < 0n ? -beda : beda).toString()).times(100).div(terima.toString()) : new Desimal(0) }
}

async function aturanFaktur(tx: Tx, id: number) {
  const r = await aturanBeli(tx, JENIS)
  if (!r) return false
  const s = await persenSelisih(tx, id)
  if (r.minPct === null) return true
  return s.beda !== 0n && (s.terima === 0n || s.persen.gt(r.minPct))
}

export const KAIT_FAKTUR: KaitBeli<KepalaFaktur> = {
  jenis: JENIS,
  muat: (tx, id) => tx.purchaseInvoice.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.purchaseInvoice.update({ where: { id }, data: dataPelaksana(data) }),
  butuhSetuju: (tx, d) => aturanFaktur(tx, d.id),
  periksaIsi: async (tx, d) => {
    if (!(await tx.purchaseInvoiceLine.count({ where: { purchaseInvoiceId: d.id } }))) throw new GalatAturan('Tambahkan minimal satu baris dulu.')
    const h = await hitungUlangFaktur(tx, d.id)
    if (h.total <= 0n) throw new GalatAturan('Total faktur harus lebih dari 0.')
    await periksaNomorPemasok(tx, d.supplierId, d.supplierInvoiceNo, d.id)
  },
  posting: async (tx, d) => {
    await pemasokAktif(tx, d.supplierId)
    const baris = await tx.purchaseInvoiceLine.findMany({ where: { purchaseInvoiceId: d.id }, orderBy: { id: 'asc' } })
    const grDisentuh = new Set<number>()
    // Kunci baris penerimaan berurutan, lalu periksa ulang sisa yang belum difakturkan.
    for (const b of [...baris].filter((x) => x.goodsReceiptLineId).sort((a, b) => a.goodsReceiptLineId! - b.goodsReceiptLineId!)) {
      await kunciBaris(tx, 'goods_receipt_line', b.goodsReceiptLineId!)
      const g = await tx.goodsReceiptLine.findUniqueOrThrow({ where: { id: b.goodsReceiptLineId! }, include: { goodsReceipt: true, product: true } })
      if (g.goodsReceipt.status !== 'Diposting' || g.goodsReceipt.supplierId !== d.supplierId) throw new GalatAturan(`Penerimaan ${g.goodsReceipt.no} tidak lagi Diposting untuk pemasok ini.`)
      const sisa = sisaFaktur(g)
      if (des(b.qty).gt(sisa)) throw new GalatAturan(`Qty ${g.product.name} melebihi qty ${g.goodsReceipt.no} yang belum difakturkan (${formatQty(sisa)}).`)
      await tx.goodsReceiptLine.update({ where: { id: g.id }, data: { qtyInvoiced: des(g.qtyInvoiced).plus(des(b.qty)) } })
      grDisentuh.add(g.goodsReceiptId)
    }
    for (const b of baris.filter((x) => x.kind === 'biaya_terima')) {
      await kunciBaris(tx, 'goods_receipt', b.goodsReceiptId!)
      const g = await tx.goodsReceipt.findUniqueOrThrow({ where: { id: b.goodsReceiptId! } })
      if (g.status !== 'Diposting' || g.supplierId !== d.supplierId) throw new GalatAturan(`Penerimaan ${g.no} tidak lagi Diposting untuk pemasok ini.`)
      if (await biayaSudahDifakturkan(tx, g.id, d.id)) throw new GalatAturan(`Biaya tambahan ${g.no} sudah tertagih di faktur lain.`)
    }
    for (const id of [...grDisentuh].sort((a, b) => a - b)) await perbaruiProgresFaktur(tx, id)
    const h = await hitungUlangFaktur(tx, d.id)
    await tx.purchaseInvoice.update({ where: { id: d.id }, data: { paidAmount: 0n, payStatus: 'BelumBayar' } })
    return { ringkas: `total ${formatRupiah(h.total)}, selisih harga ${formatRupiah(h.selisih)}`, sesudah: { total: h.total, selisihHarga: h.selisih, penerimaan: grDisentuh.size } }
  },
  batal: async (tx, d, _a, dari) => {
    if (dari !== 'Diposting') return
    if (d.paidAmount > 0n) throw new GalatAturan('Faktur ini sudah dibayar. Batalkan pembayarannya dulu.')
    const baris = await tx.purchaseInvoiceLine.findMany({ where: { purchaseInvoiceId: d.id, goodsReceiptLineId: { not: null } }, orderBy: { goodsReceiptLineId: 'asc' } })
    const grDisentuh = new Set<number>()
    for (const b of baris) {
      await kunciBaris(tx, 'goods_receipt_line', b.goodsReceiptLineId!)
      const g = await tx.goodsReceiptLine.findUniqueOrThrow({ where: { id: b.goodsReceiptLineId! }, include: { goodsReceipt: true } })
      const sisaDifakturkan = des(g.qtyInvoiced).minus(des(b.qty))
      // Retur dari bagian yang sudah difakturkan (nota debit) harus dibatalkan dulu.
      if (sisaDifakturkan.lt(des(g.qtyReturned).minus(des(g.qtyRetUninv)))) throw new GalatAturan(`Penerimaan ${g.goodsReceipt.no} punya retur dari bagian yang sudah difakturkan. Batalkan returnya dulu.`)
      await tx.goodsReceiptLine.update({ where: { id: g.id }, data: { qtyInvoiced: sisaDifakturkan } })
      grDisentuh.add(g.goodsReceiptId)
    }
    for (const id of [...grDisentuh].sort((a, b) => a - b)) await perbaruiProgresFaktur(tx, id)
  },
}

export const ubahStatusFaktur = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiBeli, opsi: { alasan?: string } = {}) => ubahStatusBeli(db, k, aktor, KAIT_FAKTUR, id, aksi, opsi)

export const butuhSetujuFaktur = (db: Db, id: number) => db.$transaction((tx) => aturanFaktur(tx, id))

export const hapusFaktur = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDrafBeli(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.purchaseInvoice.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    await tx.purchaseInvoice.delete({ where: { id } })
    return d
  })

export const muatFaktur = (db: Db, id: number) =>
  db.purchaseInvoice.findUnique({
    where: { id },
    include: {
      supplier: true,
      purchaseInvoiceLines: { include: { goodsReceiptLine: { include: { product: true, unit: true } }, goodsReceipt: { select: { id: true, no: true, extraCost: true } } }, orderBy: { id: 'asc' } },
      purchasePaymentAllocs: { where: { purchasePayment: { status: { not: 'Batal' } } }, include: { purchasePayment: { select: { id: true, no: true, status: true, date: true } } } },
    },
  })

export async function daftarFaktur(db: Db, s: SaringBeli & { bayar?: string }) {
  const { where: dasar, pemasok, hal, per } = saringBeli(s)
  const bayar = s.bayar === 'BelumBayar' || s.bayar === 'Sebagian' || s.bayar === 'Lunas' ? s.bayar : undefined
  const where = { ...dasar, ...(pemasok ? { supplierId: pemasok } : {}), ...(bayar ? { payStatus: bayar as 'BelumBayar' | 'Sebagian' | 'Lunas', status: 'Diposting' as const } : {}) }
  const [baris, total] = await Promise.all([
    db.purchaseInvoice.findMany({ where, include: { supplier: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * per, take: per }),
    db.purchaseInvoice.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: jumlahHal(total) }
}

// Faktur Penjualan B2B (tahap 6A). Satu dokumen sekaligus pengiriman dan tagihan: saat Diposting barang keluar dari
// stok lewat mesin stok dengan harga rata-rata lokasi (HPP), dan faktur menjadi piutang pelanggan. Tidak ada surat jalan
// terpisah (KONTRAK 11). Faktur boleh menarik sisa satu Pesanan Penjualan Disetujui (qty tidak boleh melebihi sisa
// pesanan) atau berdiri sendiri dengan baris yang ditambah langsung. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin } from '../izin-inti'
import { formatRupiah, skemaTanggal, skemaUang } from '../master'
import { ambilNomor } from '../nomor'
import { Desimal, des, formatQty, isianQty, skemaQty } from '../stok/angka'
import { catatGerak } from '../stok/mesin'
import { balikJurnalFakturJual, jurnalFakturJual } from '../akuntansi/dokumen-b2b'
import {
  BATAS_BARIS_BELI,
  DOK_BELI,
  dataPelaksana,
  faktorSatuan,
  hapusDrafBeli,
  idSkema,
  jatuhTempo,
  jumlahHal,
  kunciBaris,
  lokasiAktif,
  nilaiBaris,
  pastikanSalahSatu,
  periksaTanggal,
  skemaBarang,
  skemaTanggalWajib,
  ubahStatusBeli,
  type AksiBeli,
  type Aktor,
  type KaitBeli,
  type KepalaBeli,
} from '../beli/dokumen'
import { perbaruiProgresPesananJual, skemaBarisJual } from './pesanan'
import { hargaKhusus, pelangganAktif, periksaHargaJual, produkJual, saringJual, type SaringJual } from './umum'

const JENIS = 'sales_invoice' as const
const INFO = DOK_BELI[JENIS]
const MENU = INFO.menu

const skemaKepala = {
  locationId: idSkema('lokasi kirim'),
  date: skemaTanggalWajib('Tanggal faktur'),
  dueDate: skemaTanggal('Jatuh tempo'),
  customerRef: z.string().trim().max(40, 'Rujukan pelanggan paling panjang 40 huruf.').default(''),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
}

export const skemaFakturJualBaru = z.object({
  ...skemaKepala,
  customerId: z
    .string()
    .optional()
    .transform((v) => (v && /^\d+$/.test(v) ? Number(v) : null)),
  salesOrderId: z
    .string()
    .optional()
    .transform((v) => (v && /^\d+$/.test(v) ? Number(v) : null)),
})

export const skemaKepalaFakturJual = z.object({ ...skemaKepala, customerId: idSkema('pelanggan') })

function periksaKepala(aktor: Aktor, d: { date: Date; dueDate: Date | null }) {
  periksaTanggal(aktor, d.date)
  if (d.dueDate && d.dueDate.getTime() < d.date.getTime()) throw new GalatAturan('Jatuh tempo tidak boleh sebelum tanggal faktur.', 'dueDate')
}

// Qty pesanan yang belum difakturkan.
export const sisaPesanan = (b: { qty: Desimal | string; qtyInvoiced: Desimal | string }) => des(b.qty).minus(des(b.qtyInvoiced))

export async function hitungUlangFakturJual(tx: Tx, id: number) {
  const baris = await tx.salesInvoiceLine.findMany({ where: { salesInvoiceId: id } })
  let total = 0n
  for (const b of baris) {
    const jumlah = nilaiBaris(b.qty, b.price)
    if (jumlah !== b.lineTotal) await tx.salesInvoiceLine.update({ where: { id: b.id }, data: { lineTotal: jumlah } })
    total += jumlah
  }
  await tx.salesInvoice.update({ where: { id }, data: { subtotal: total, tax: 0n, total } })
  return total
}

export async function buatFakturJual(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaFakturJualBaru.parse(masukan)
  periksaKepala(aktor, d)
  return db.$transaction(async (tx) => {
    let customerId = d.customerId
    let dariSo = ''
    const so = d.salesOrderId ? await tx.salesOrder.findUnique({ where: { id: d.salesOrderId }, include: { salesOrderLines: { orderBy: { id: 'asc' } } } }) : null
    if (d.salesOrderId) {
      if (!so || so.status !== 'Disetujui') throw new GalatAturan('Pesanan penjualan harus berstatus Disetujui untuk difakturkan.', 'salesOrderId')
      if (customerId && customerId !== so.customerId) throw new GalatAturan('Pelanggan faktur harus sama dengan pelanggan pesanan.', 'customerId')
      customerId = so.customerId
      if (d.date.getTime() < so.date.getTime()) throw new GalatAturan('Tanggal faktur tidak boleh sebelum tanggal pesanan.', 'date')
    }
    if (!customerId) throw new GalatAturan('Pilih pelanggan atau pesanan penjualan.', 'customerId')
    const c = await pelangganAktif(tx, customerId)
    const l = await lokasiAktif(tx, d.locationId)
    const no = await ambilNomor(tx, JENIS, INFO.awalan, d.date)
    const dueDate = d.dueDate ?? jatuhTempo(d.date, c.paymentDays)
    const f = await tx.salesInvoice.create({
      data: { customerId: c.id, salesOrderId: so?.id ?? null, locationId: l.id, date: d.date, dueDate, customerRef: d.customerRef || so?.customerRef || '', note: d.note, no, createdBy: aktor.id, updatedBy: aktor.id },
    })
    if (so) {
      let n = 0
      for (const b of so.salesOrderLines) {
        const sisa = sisaPesanan(b)
        if (!sisa.gt(0)) continue
        await tx.salesInvoiceLine.create({ data: { salesInvoiceId: f.id, salesOrderLineId: b.id, productId: b.productId, unitId: b.unitId, factor: b.factor, qty: sisa, price: b.price } })
        n++
      }
      if (!n) throw new GalatAturan('Semua baris pesanan ini sudah difakturkan.', 'salesOrderId')
      await hitungUlangFakturJual(tx, f.id)
      dariSo = ` dari ${so.no} (${n} baris)`
    }
    await catatAudit(tx, k, { action: 'faktur_jual.tambah', docType: JENIS, docId: f.id, summary: `Membuat draf faktur penjualan ${no} untuk ${c.name}${dariSo}`, after: { no, pelanggan: c.name, lokasi: l.name, pesanan: so?.no ?? null, date: d.date, dueDate, customerRef: f.customerRef, note: d.note } })
    return f
  })
}

async function muatDraf(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const f = await tx.salesInvoice.findUnique({ where: { id }, include: { customer: true, location: true } })
  if (!f) throw new GalatAturan('Faktur penjualan tidak ditemukan.')
  if (f.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return f
}

const iso = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null)

export async function ubahKepalaFakturJual(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaFakturJual.parse(masukan)
  periksaKepala(aktor, d)
  return db.$transaction(async (tx) => {
    const f = await muatDraf(tx, id)
    if (d.customerId !== f.customerId && (f.salesOrderId || (await tx.salesInvoiceLine.count({ where: { salesInvoiceId: id } })))) {
      throw new GalatAturan('Pelanggan tidak bisa diganti karena faktur sudah punya baris atau berasal dari pesanan.', 'customerId')
    }
    const c = await pelangganAktif(tx, d.customerId)
    const l = await lokasiAktif(tx, d.locationId)
    const dueDate = d.dueDate ?? jatuhTempo(d.date, c.paymentDays)
    const sebelum = { pelanggan: f.customer.name, lokasi: f.location.name, date: iso(f.date), dueDate: iso(f.dueDate), customerRef: f.customerRef, note: f.note }
    const sesudah = { pelanggan: c.name, lokasi: l.name, date: iso(d.date), dueDate: iso(dueDate), customerRef: d.customerRef, note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.salesInvoice.update({ where: { id }, data: { ...d, dueDate, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'faktur_jual.ubah', docType: JENIS, docId: id, summary: `Mengubah kepala faktur penjualan ${f.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

// Baris langsung hanya untuk faktur tanpa pesanan; faktur dari pesanan memakai baris sisa pesanannya.
export async function tambahBarisFakturJual(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaBarisJual.parse(masukan)
  return db.$transaction(async (tx) => {
    const f = await muatDraf(tx, id)
    if (f.salesOrderId) throw new GalatAturan('Faktur dari pesanan hanya memakai baris pesanannya. Ubah qty atau hapus barisnya.')
    const it = skemaBarang.safeParse(d.item ?? '')
    if (!it.success) throw new GalatAturan('Pilih produk dan satuannya.', 'item')
    const { productId, unitId } = it.data
    if (!d.qty || !d.qty.gt(0)) throw new GalatAturan('Qty wajib diisi.', 'qty')
    const p = await produkJual(tx, productId)
    const faktor = await faktorSatuan(tx, productId, unitId)
    const daftar = await hargaKhusus(tx, f.customerId, productId, unitId)
    const harga = d.price || daftar || 0n
    if (harga <= 0n) throw new GalatAturan(`Isi harga ${p.name}, karena pelanggan ini belum punya harga khusus untuk produk dan satuan itu.`, 'price')
    periksaHargaJual(aktor, p.name, harga, daftar)
    if ((await tx.salesInvoiceLine.count({ where: { salesInvoiceId: id } })) >= BATAS_BARIS_BELI) throw new GalatAturan(`Satu dokumen paling banyak ${BATAS_BARIS_BELI} baris.`)
    const u = await tx.unit.findUniqueOrThrow({ where: { id: unitId } })
    const b = await tx.salesInvoiceLine.create({ data: { salesInvoiceId: id, productId, unitId, factor: faktor, qty: d.qty, price: harga } })
    const total = await hitungUlangFakturJual(tx, id)
    await tx.salesInvoice.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'faktur_jual.baris_tambah',
      docType: JENIS,
      docId: id,
      summary: `Menambah baris ${f.no}: ${formatQty(d.qty)} ${u.symbol} ${p.name} @ ${formatRupiah(harga)}, total ${formatRupiah(total)}`,
      after: { lineId: b.id, produk: p.code, satuan: u.symbol, qty: d.qty, price: harga, hargaKhusus: daftar },
    })
    return b
  })
}

// Harga pembanding baris: harga pesanan untuk baris dari pesanan, harga khusus pelanggan untuk baris langsung.
async function hargaAcuan(tx: Tx, customerId: number, b: { salesOrderLineId: number | null; productId: number; unitId: number; salesOrderLine?: { price: bigint } | null }) {
  if (b.salesOrderLineId) return b.salesOrderLine?.price ?? (await tx.salesOrderLine.findUniqueOrThrow({ where: { id: b.salesOrderLineId } })).price
  return hargaKhusus(tx, customerId, b.productId, b.unitId)
}

// Simpan qty dan harga semua baris (qty_<id>, price_<id>). Qty baris dari pesanan tidak boleh melebihi sisa pesanan.
export async function simpanBarisFakturJual(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const f = await muatDraf(tx, id)
    const baris = await tx.salesInvoiceLine.findMany({ where: { salesInvoiceId: id }, include: { product: true, salesOrderLine: true }, orderBy: { id: 'asc' } })
    const ubah: { lineId: number; produk: string; sebelum: Record<string, string>; sesudah: Record<string, string> }[] = []
    for (const b of baris) {
      const q = skemaQty({ label: `Qty ${b.product.name}` }).safeParse(String(masukan[`qty_${b.id}`] ?? isianQty(b.qty)))
      if (!q.success) throw new GalatAturan(q.error.issues[0].message, `qty_${b.id}`)
      const h = skemaUang({ label: `Harga ${b.product.name}`, max: 1_000_000_000n }).safeParse(String(masukan[`price_${b.id}`] ?? b.price.toString()))
      if (!h.success) throw new GalatAturan(h.error.issues[0].message, `price_${b.id}`)
      if (q.data.eq(des(b.qty)) && h.data === b.price) continue
      if (b.salesOrderLine) {
        const sisa = sisaPesanan(b.salesOrderLine)
        if (q.data.gt(sisa)) throw new GalatAturan(`Qty ${b.product.name} melebihi sisa pesanan yang belum difakturkan (${formatQty(sisa)}).`, `qty_${b.id}`)
      }
      if (h.data !== b.price) periksaHargaJual(aktor, b.product.name, h.data, await hargaAcuan(tx, f.customerId, b), `price_${b.id}`)
      await tx.salesInvoiceLine.update({ where: { id: b.id }, data: { qty: q.data, price: h.data } })
      ubah.push({ lineId: b.id, produk: b.product.code, sebelum: { qty: b.qty.toString(), price: b.price.toString() }, sesudah: { qty: q.data.toString(), price: h.data.toString() } })
    }
    if (!ubah.length) return 0
    const total = await hitungUlangFakturJual(tx, id)
    await tx.salesInvoice.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'faktur_jual.baris_ubah',
      docType: JENIS,
      docId: id,
      summary: `Mengubah qty atau harga ${ubah.length} baris ${f.no}, total ${formatRupiah(total)}`,
      before: ubah.map((u) => ({ lineId: u.lineId, produk: u.produk, ...u.sebelum })),
      after: ubah.map((u) => ({ lineId: u.lineId, produk: u.produk, ...u.sesudah })),
    })
    return ubah.length
  })
}

export async function hapusBarisFakturJual(db: Db, k: Konteks, aktor: Aktor, id: number, idBaris: number) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const f = await muatDraf(tx, id)
    const b = await tx.salesInvoiceLine.findFirst({ where: { id: idBaris, salesInvoiceId: id }, include: { product: true, unit: true } })
    if (!b) throw new GalatAturan('Baris tidak ditemukan.')
    await tx.salesInvoiceLine.delete({ where: { id: idBaris } })
    const total = await hitungUlangFakturJual(tx, id)
    await catatAudit(tx, k, { action: 'faktur_jual.baris_hapus', docType: JENIS, docId: id, summary: `Menghapus baris ${f.no}: ${formatQty(b.qty)} ${b.unit.symbol} ${b.product.name}, total ${formatRupiah(total)}`, before: { lineId: b.id, produk: b.product.code, qty: b.qty, price: b.price } })
  })
}

type KepalaFakturJual = KepalaBeli & { customerId: number; salesOrderId: number | null; locationId: number; total: bigint; paidAmount: bigint }

export const KAIT_FAKTUR_JUAL: KaitBeli<KepalaFakturJual> = {
  jenis: JENIS,
  muat: (tx, id) => tx.salesInvoice.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.salesInvoice.update({ where: { id }, data: dataPelaksana(data) }),
  // approval_rule untuk faktur penjualan belum diisi, jadi pemegang Posting (Owner) langsung memposting.
  butuhSetuju: async () => false,
  periksaIsi: async (tx, d) => {
    const baris = await tx.salesInvoiceLine.findMany({ where: { salesInvoiceId: d.id }, include: { product: true } })
    if (!baris.length) throw new GalatAturan('Tambahkan minimal satu baris dulu.')
    await pelangganAktif(tx, d.customerId)
    for (const b of baris) {
      if (!b.product.active) throw new GalatAturan(`Produk ${b.product.name} sudah nonaktif. Hapus barisnya dulu.`)
      if (b.price <= 0n) throw new GalatAturan(`Isi harga ${b.product.name}.`)
    }
    if ((await hitungUlangFakturJual(tx, d.id)) <= 0n) throw new GalatAturan('Total faktur harus lebih dari 0.')
  },
  posting: async (tx, d, asal) => {
    await lokasiAktif(tx, d.locationId)
    const baris = await tx.salesInvoiceLine.findMany({ where: { salesInvoiceId: d.id }, include: { product: true }, orderBy: { id: 'asc' } })
    // Kunci baris pesanan berurutan, lalu periksa ulang sisa yang belum difakturkan.
    if (d.salesOrderId) {
      const so = await tx.salesOrder.findUniqueOrThrow({ where: { id: d.salesOrderId } })
      if (so.status !== 'Disetujui') throw new GalatAturan(`Pesanan ${so.no} tidak lagi berstatus Disetujui.`)
      for (const b of [...baris].filter((x) => x.salesOrderLineId).sort((a, b) => a.salesOrderLineId! - b.salesOrderLineId!)) {
        await kunciBaris(tx, 'sales_order_line', b.salesOrderLineId!)
        const s = await tx.salesOrderLine.findUniqueOrThrow({ where: { id: b.salesOrderLineId! } })
        const sisa = sisaPesanan(s)
        if (des(b.qty).gt(sisa)) throw new GalatAturan(`Qty ${b.product.name} melebihi sisa pesanan ${so.no} yang belum difakturkan (${formatQty(sisa)}).`)
        await tx.salesOrderLine.update({ where: { id: s.id }, data: { qtyInvoiced: des(s.qtyInvoiced).plus(des(b.qty)) } })
      }
      await perbaruiProgresPesananJual(tx, so.id)
    }
    // Barang keluar dengan harga rata-rata lokasi; HPP baris = nilai keluar mesin.
    const gerak = await catatGerak(
      tx,
      asal,
      baris.map((b) => ({ productId: b.productId, locationId: d.locationId, qty: des(b.qty).times(des(b.factor)).toDecimalPlaces(3, Desimal.ROUND_HALF_UP).neg(), lineId: b.id })),
    )
    let hpp = 0n
    for (const g of gerak) {
      await tx.salesInvoiceLine.update({ where: { id: g.lineId! }, data: { unitCost: g.hargaSatuan, value: -g.nilai } })
      hpp += -g.nilai
    }
    const total = await hitungUlangFakturJual(tx, d.id)
    await tx.salesInvoice.update({ where: { id: d.id }, data: { hpp, paidAmount: 0n, payStatus: 'BelumBayar' } })
    // tahap 6B: jurnal piutang, penjualan B2B, dan HPP di transaksi yang sama (KONTRAK 11 butir 96).
    const j = await jurnalFakturJual(tx, d.id, asal.oleh)
    return { ringkas: `total ${formatRupiah(total)}, HPP ${formatRupiah(hpp)}`, sesudah: { total, hpp, baris: baris.length, jurnal: j?.no ?? null } }
  },
  batal: async (tx, d, _a, dari) => {
    if (dari !== 'Diposting') return
    if (d.paidAmount > 0n) throw new GalatAturan('Faktur ini sudah dibayar sebagian atau penuh. Batalkan penerimaan pelanggannya dulu.')
    const retur = await tx.salesReturn.count({ where: { salesInvoiceId: d.id, status: { not: 'Batal' } } })
    if (retur) throw new GalatAturan('Faktur ini punya retur penjualan. Batalkan atau hapus returnya dulu.')
    const terima = await tx.customerPaymentAlloc.count({ where: { salesInvoiceId: d.id, customerPayment: { status: { in: ['Draft', 'Diajukan'] } } } })
    if (terima) throw new GalatAturan('Faktur ini sudah dialokasikan di draf penerimaan pelanggan. Kosongkan alokasinya dulu.')
    if (d.salesOrderId) {
      const baris = await tx.salesInvoiceLine.findMany({ where: { salesInvoiceId: d.id, salesOrderLineId: { not: null } }, orderBy: { salesOrderLineId: 'asc' } })
      for (const b of baris) {
        await kunciBaris(tx, 'sales_order_line', b.salesOrderLineId!)
        const s = await tx.salesOrderLine.findUniqueOrThrow({ where: { id: b.salesOrderLineId! } })
        await tx.salesOrderLine.update({ where: { id: s.id }, data: { qtyInvoiced: Desimal.max(0, des(s.qtyInvoiced).minus(des(b.qty))) } })
      }
      await perbaruiProgresPesananJual(tx, d.salesOrderId)
    }
  },
  sesudahBalik: async (tx, d, aktor, tanggal) => {
    const b = await balikJurnalFakturJual(tx, d.id, tanggal, aktor.id)
    return { sesudah: { jurnalBalik: b?.no ?? null } }
  },
}

export const ubahStatusFakturJual = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiBeli, opsi: { alasan?: string } = {}) => ubahStatusBeli(db, k, aktor, KAIT_FAKTUR_JUAL, id, aksi, opsi)

export const hapusFakturJual = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDrafBeli(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.salesInvoice.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    await tx.salesInvoice.delete({ where: { id } })
    return d
  })

export const muatFakturJual = (db: Db, id: number) =>
  db.salesInvoice.findUnique({
    where: { id },
    include: {
      customer: true,
      location: true,
      salesOrder: { select: { id: true, no: true } },
      salesInvoiceLines: { include: { product: { include: { baseUnit: true } }, unit: true, salesOrderLine: true }, orderBy: { id: 'asc' } },
      customerPaymentAllocs: { where: { customerPayment: { status: { not: 'Batal' } } }, include: { customerPayment: { select: { id: true, no: true, status: true, date: true } } } },
      salesReturns: { where: { status: { not: 'Batal' } }, select: { id: true, no: true, status: true, total: true } },
    },
  })

export async function daftarFakturJual(db: Db, s: SaringJual & { bayar?: string }) {
  const { where: dasar, hal, per } = saringJual(s)
  const bayar = s.bayar === 'BelumBayar' || s.bayar === 'Sebagian' || s.bayar === 'Lunas' ? s.bayar : undefined
  const where = { ...dasar, ...(bayar ? { payStatus: bayar as 'BelumBayar' | 'Sebagian' | 'Lunas', status: 'Diposting' as const } : {}) }
  const [baris, total] = await Promise.all([
    db.salesInvoice.findMany({ where, include: { customer: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * per, take: per }),
    db.salesInvoice.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: jumlahHal(total) }
}

// Faktur Diposting yang masih punya barang belum diretur, untuk pilihan dokumen asal retur.
export async function fakturBisaDiretur(db: Db) {
  const f = await db.salesInvoice.findMany({ where: { status: 'Diposting' }, include: { customer: true, salesInvoiceLines: { select: { qty: true, qtyReturned: true } } }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 200 })
  return f.filter((x) => x.salesInvoiceLines.some((b) => des(b.qty).gt(des(b.qtyReturned))))
}

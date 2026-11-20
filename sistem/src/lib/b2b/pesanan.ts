// Pesanan Penjualan B2B (tahap 6A). Dokumen rencana untuk satu pelanggan, tanpa efek stok dan jurnal. Barang keluar dan
// piutang muncul lewat Faktur Penjualan yang menarik sisa pesanan. Progres faktur (Belum, Sebagian, Penuh) dari qty
// difakturkan faktur Diposting; pesanan Selesai otomatis saat difakturkan penuh. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin } from '../izin-inti'
import { formatRupiah, skemaTanggal, skemaUang } from '../master'
import { ambilNomor } from '../nomor'
import { des, formatQty, isianQty, skemaQty, skemaQtyOpsional } from '../stok/angka'
import {
  BATAS_BARIS_BELI,
  DOK_BELI,
  aturanBeli,
  faktorSatuan,
  hapusDrafBeli,
  hitungProgres,
  idSkema,
  jumlahHal,
  kunciBaris,
  lokasiAktif,
  nilaiBaris,
  pastikanSalahSatu,
  periksaTanggal,
  skemaBarang,
  skemaTanggalWajib,
  uangOpsional,
  ubahStatusBeli,
  type AksiBeli,
  type Aktor,
  type KaitBeli,
  type KepalaBeli,
} from '../beli/dokumen'
import { hargaKhusus, pelangganAktif, periksaHargaJual, produkJual, saringJual, type SaringJual } from './umum'

const JENIS = 'sales_order' as const
const INFO = DOK_BELI[JENIS]
const MENU = INFO.menu

export const skemaKepalaPesananJual = z.object({
  customerId: idSkema('pelanggan'),
  locationId: idSkema('lokasi kirim'),
  date: skemaTanggalWajib('Tanggal'),
  requiredDate: skemaTanggal('Tanggal kirim'),
  customerRef: z.string().trim().max(40, 'Rujukan pelanggan paling panjang 40 huruf.').default(''),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

export const skemaBarisJual = z.object({
  item: z.string().optional(),
  qty: skemaQtyOpsional({ label: 'Qty' }),
  price: uangOpsional('Harga'),
})

function periksaKepala(aktor: Aktor, d: z.infer<typeof skemaKepalaPesananJual>) {
  periksaTanggal(aktor, d.date)
  if (d.requiredDate && d.requiredDate.getTime() < d.date.getTime()) throw new GalatAturan('Tanggal kirim tidak boleh sebelum tanggal pesanan.', 'requiredDate')
}

// Jumlah kepala. Diskon per baris tidak dipakai (harga diisi bersih) dan PPN tidak dihitung karena Greenbox bukan PKP.
export async function hitungUlangPesananJual(tx: Tx, id: number) {
  const baris = await tx.salesOrderLine.findMany({ where: { salesOrderId: id } })
  const subtotal = baris.reduce((n, b) => n + nilaiBaris(b.qty, b.price), 0n)
  await tx.salesOrder.update({ where: { id }, data: { subtotal, tax: 0n, total: subtotal } })
  return subtotal
}

export async function buatPesananJual(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKepalaPesananJual.parse(masukan)
  periksaKepala(aktor, d)
  return db.$transaction(async (tx) => {
    const c = await pelangganAktif(tx, d.customerId)
    const l = await lokasiAktif(tx, d.locationId)
    const no = await ambilNomor(tx, JENIS, INFO.awalan, d.date)
    const so = await tx.salesOrder.create({ data: { ...d, no, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pesanan_jual.tambah', docType: JENIS, docId: so.id, summary: `Membuat draf pesanan penjualan ${no} untuk ${c.name}`, after: { no, pelanggan: c.name, lokasi: l.name, ...d } })
    return so
  })
}

async function muatDraf(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const so = await tx.salesOrder.findUnique({ where: { id }, include: { customer: true, location: true } })
  if (!so) throw new GalatAturan('Pesanan penjualan tidak ditemukan.')
  if (so.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return so
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

export async function ubahKepalaPesananJual(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaPesananJual.parse(masukan)
  periksaKepala(aktor, d)
  return db.$transaction(async (tx) => {
    const so = await muatDraf(tx, id)
    if (d.customerId !== so.customerId && (await tx.salesOrderLine.count({ where: { salesOrderId: id } }))) {
      throw new GalatAturan('Pelanggan tidak bisa diganti karena baris sudah diisi dengan harga pelanggan ini. Hapus barisnya dulu.', 'customerId')
    }
    const c = await pelangganAktif(tx, d.customerId)
    const l = await lokasiAktif(tx, d.locationId)
    const sebelum = { pelanggan: so.customer.name, lokasi: so.location.name, date: iso(so.date), requiredDate: iso(so.requiredDate), customerRef: so.customerRef, note: so.note }
    const sesudah = { pelanggan: c.name, lokasi: l.name, date: iso(d.date), requiredDate: iso(d.requiredDate), customerRef: d.customerRef, note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.salesOrder.update({ where: { id }, data: { ...d, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pesanan_jual.ubah', docType: JENIS, docId: id, summary: `Mengubah kepala pesanan penjualan ${so.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

export async function tambahBarisPesananJual(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaBarisJual.parse(masukan)
  return db.$transaction(async (tx) => {
    const so = await muatDraf(tx, id)
    const it = skemaBarang.safeParse(d.item ?? '')
    if (!it.success) throw new GalatAturan('Pilih produk dan satuannya.', 'item')
    const { productId, unitId } = it.data
    if (!d.qty || !d.qty.gt(0)) throw new GalatAturan('Qty wajib diisi.', 'qty')
    const p = await produkJual(tx, productId)
    const faktor = await faktorSatuan(tx, productId, unitId)
    const daftar = await hargaKhusus(tx, so.customerId, productId, unitId)
    const harga = d.price || daftar || 0n
    if (harga <= 0n) throw new GalatAturan(`Isi harga ${p.name}, karena pelanggan ini belum punya harga khusus untuk produk dan satuan itu.`, 'price')
    periksaHargaJual(aktor, p.name, harga, daftar)
    if ((await tx.salesOrderLine.count({ where: { salesOrderId: id } })) >= BATAS_BARIS_BELI) throw new GalatAturan(`Satu dokumen paling banyak ${BATAS_BARIS_BELI} baris.`)
    const u = await tx.unit.findUniqueOrThrow({ where: { id: unitId } })
    const b = await tx.salesOrderLine.create({ data: { salesOrderId: id, productId, unitId, qty: d.qty, factor: faktor, price: harga } })
    await hitungUlangPesananJual(tx, id)
    await tx.salesOrder.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'pesanan_jual.baris_tambah',
      docType: JENIS,
      docId: id,
      summary: `Menambah baris ${so.no}: ${formatQty(d.qty)} ${u.symbol} ${p.name} @ ${formatRupiah(harga)}`,
      after: { lineId: b.id, produk: p.code, satuan: u.symbol, qty: d.qty, price: harga, hargaKhusus: daftar },
    })
    return b
  })
}

// Simpan qty dan harga semua baris draf sekaligus (qty_<id>, price_<id>).
export async function simpanBarisPesananJual(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const so = await muatDraf(tx, id)
    const baris = await tx.salesOrderLine.findMany({ where: { salesOrderId: id }, include: { product: true }, orderBy: { id: 'asc' } })
    const ubah: { lineId: number; produk: string; sebelum: Record<string, string>; sesudah: Record<string, string> }[] = []
    for (const b of baris) {
      const q = skemaQty({ label: `Qty ${b.product.name}` }).safeParse(String(masukan[`qty_${b.id}`] ?? isianQty(b.qty)))
      if (!q.success) throw new GalatAturan(q.error.issues[0].message, `qty_${b.id}`)
      const h = skemaUang({ label: `Harga ${b.product.name}`, max: 1_000_000_000n }).safeParse(String(masukan[`price_${b.id}`] ?? b.price.toString()))
      if (!h.success) throw new GalatAturan(h.error.issues[0].message, `price_${b.id}`)
      if (q.data.eq(des(b.qty)) && h.data === b.price) continue
      if (h.data !== b.price) periksaHargaJual(aktor, b.product.name, h.data, await hargaKhusus(tx, so.customerId, b.productId, b.unitId), `price_${b.id}`)
      await tx.salesOrderLine.update({ where: { id: b.id }, data: { qty: q.data, price: h.data } })
      ubah.push({ lineId: b.id, produk: b.product.code, sebelum: { qty: b.qty.toString(), price: b.price.toString() }, sesudah: { qty: q.data.toString(), price: h.data.toString() } })
    }
    if (!ubah.length) return 0
    const total = await hitungUlangPesananJual(tx, id)
    await tx.salesOrder.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'pesanan_jual.baris_ubah',
      docType: JENIS,
      docId: id,
      summary: `Mengubah qty atau harga ${ubah.length} baris ${so.no}, total ${formatRupiah(total)}`,
      before: ubah.map((u) => ({ lineId: u.lineId, produk: u.produk, ...u.sebelum })),
      after: ubah.map((u) => ({ lineId: u.lineId, produk: u.produk, ...u.sesudah })),
    })
    return ubah.length
  })
}

export async function hapusBarisPesananJual(db: Db, k: Konteks, aktor: Aktor, id: number, idBaris: number) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const so = await muatDraf(tx, id)
    const b = await tx.salesOrderLine.findFirst({ where: { id: idBaris, salesOrderId: id }, include: { product: true, unit: true } })
    if (!b) throw new GalatAturan('Baris tidak ditemukan.')
    await tx.salesOrderLine.delete({ where: { id: idBaris } })
    await hitungUlangPesananJual(tx, id)
    await catatAudit(tx, k, { action: 'pesanan_jual.baris_hapus', docType: JENIS, docId: id, summary: `Menghapus baris ${so.no}: ${formatQty(b.qty)} ${b.unit.symbol} ${b.product.name}`, before: { lineId: b.id, produk: b.product.code, qty: b.qty, price: b.price } })
  })
}

type KepalaPesananJual = KepalaBeli & { total: bigint; customerId: number; closeReason: string | null }

async function aturanPesananJual(tx: Tx, total: bigint) {
  const r = await aturanBeli(tx, JENIS)
  if (!r) return false
  return r.minAmount === null || total > r.minAmount
}

// Progres faktur dari qty difakturkan. Pesanan Disetujui yang difakturkan penuh menjadi Selesai; pesanan yang Selesai
// otomatis kembali Disetujui bila qty difakturkan berkurang (faktur dibatalkan).
export async function perbaruiProgresPesananJual(tx: Tx, id: number) {
  const so = await tx.salesOrder.findUniqueOrThrow({ where: { id }, include: { salesOrderLines: true } })
  const progres = hitungProgres(so.salesOrderLines.map((b) => ({ target: b.qty, selesai: b.qtyInvoiced })))
  const data: { invoiceProgress: typeof progres; status?: 'Selesai' | 'Disetujui'; closedAt?: Date | null } = { invoiceProgress: progres }
  if (progres === 'Penuh' && so.status === 'Disetujui') Object.assign(data, { status: 'Selesai', closedAt: new Date() })
  if (progres !== 'Penuh' && so.status === 'Selesai' && !so.closeReason) Object.assign(data, { status: 'Disetujui', closedAt: null })
  await tx.salesOrder.update({ where: { id }, data })
  return data
}

export const KAIT_PESANAN_JUAL: KaitBeli<KepalaPesananJual> = {
  jenis: JENIS,
  muat: (tx, id) => tx.salesOrder.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.salesOrder.update({ where: { id }, data }),
  butuhSetuju: (tx, d) => aturanPesananJual(tx, d.total),
  periksaIsi: async (tx, d) => {
    const baris = await tx.salesOrderLine.findMany({ where: { salesOrderId: d.id }, include: { product: true } })
    if (!baris.length) throw new GalatAturan('Tambahkan minimal satu baris dulu.')
    await pelangganAktif(tx, d.customerId)
    for (const b of baris) {
      if (!b.product.active) throw new GalatAturan(`Produk ${b.product.name} sudah nonaktif. Hapus barisnya dulu.`)
      if (b.price <= 0n) throw new GalatAturan(`Isi harga ${b.product.name}.`)
    }
  },
  setujui: async (_tx, d) => ({ ringkas: `total ${formatRupiah(d.total)}`, sesudah: { total: d.total } }),
  batal: async (tx, d, _a, dari) => {
    if (dari !== 'Disetujui') return
    const f = await tx.salesInvoice.count({ where: { salesOrderId: d.id, status: { not: 'Batal' } } })
    if (f) throw new GalatAturan('Pesanan ini sudah punya faktur penjualan. Batalkan atau hapus fakturnya dulu, atau pakai Tutup sisa.')
  },
}

export const ubahStatusPesananJual = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiBeli, opsi: { alasan?: string } = {}) => ubahStatusBeli(db, k, aktor, KAIT_PESANAN_JUAL, id, aksi, opsi)

export const butuhSetujuPesananJual = (db: Db, total: bigint) => db.$transaction((tx) => aturanPesananJual(tx, total))

export const hapusPesananJual = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDrafBeli(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.salesOrder.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    await tx.salesOrder.delete({ where: { id } })
    return d
  })

export const muatPesananJual = (db: Db, id: number) =>
  db.salesOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      location: true,
      salesOrderLines: { include: { product: { include: { baseUnit: true } }, unit: true }, orderBy: { id: 'asc' } },
      salesInvoices: { orderBy: { id: 'asc' }, select: { id: true, no: true, date: true, status: true } },
    },
  })

export async function daftarPesananJual(db: Db, s: SaringJual) {
  const { where, hal, per } = saringJual(s)
  const [baris, total] = await Promise.all([
    db.salesOrder.findMany({ where, include: { customer: true, _count: { select: { salesOrderLines: true } } }, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * per, take: per }),
    db.salesOrder.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: jumlahHal(total) }
}

// Pesanan Disetujui yang masih punya sisa untuk difakturkan.
export const pesananJualTerbuka = (db: Db) => db.salesOrder.findMany({ where: { status: 'Disetujui' }, include: { customer: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 200 })

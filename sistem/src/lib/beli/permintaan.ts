// Permintaan Pembelian (tahap 4C, RANCANGAN 3.1). Dokumen rencana tanpa efek stok dan jurnal. Qty dipesan bertambah
// saat Pesanan Pembelian yang merujuk barisnya Disetujui; PR Selesai otomatis bila semua baris sudah dipesan penuh,
// atau lewat Tutup sisa dengan alasan. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin } from '../izin-inti'
import { skemaTanggal } from '../master'
import { ambilNomor } from '../nomor'
import { des, formatQty, skemaQty } from '../stok/angka'
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
  pastikanSalahSatu,
  periksaTanggal,
  produkBeli,
  saringBeli,
  skemaBarang,
  skemaTanggalWajib,
  ubahStatusBeli,
  type AksiBeli,
  type Aktor,
  type KaitBeli,
  type KepalaBeli,
  type SaringBeli,
} from './dokumen'

const JENIS = 'purchase_request' as const
const INFO = DOK_BELI[JENIS]
const MENU = INFO.menu

export const skemaKepalaPermintaan = z.object({
  locationId: idSkema('lokasi'),
  date: skemaTanggalWajib('Tanggal'),
  requiredDate: skemaTanggal('Tanggal dibutuhkan'),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

export const skemaBarisPermintaan = z.object({
  item: skemaBarang,
  qty: skemaQty({ label: 'Qty' }),
  note: z.string().trim().max(120, 'Catatan paling panjang 120 huruf.').default(''),
})

function periksaKepala(aktor: Aktor, d: z.infer<typeof skemaKepalaPermintaan>) {
  periksaTanggal(aktor, d.date)
  if (d.requiredDate && d.requiredDate.getTime() < d.date.getTime()) throw new GalatAturan('Tanggal dibutuhkan tidak boleh sebelum tanggal permintaan.', 'requiredDate')
}

export async function buatPermintaan(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKepalaPermintaan.parse(masukan)
  periksaKepala(aktor, d)
  return db.$transaction(async (tx) => {
    const l = await lokasiAktif(tx, d.locationId)
    const no = await ambilNomor(tx, JENIS, INFO.awalan, d.date)
    const pr = await tx.purchaseRequest.create({ data: { ...d, no, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'permintaan.tambah', docType: JENIS, docId: pr.id, summary: `Membuat draf permintaan pembelian ${no} untuk ${l.name}`, after: { no, lokasi: l.name, ...d } })
    return pr
  })
}

async function muatDraf(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const pr = await tx.purchaseRequest.findUnique({ where: { id }, include: { location: true } })
  if (!pr) throw new GalatAturan('Permintaan pembelian tidak ditemukan.')
  if (pr.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return pr
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

export async function ubahKepalaPermintaan(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaPermintaan.parse(masukan)
  periksaKepala(aktor, d)
  return db.$transaction(async (tx) => {
    const pr = await muatDraf(tx, id)
    const l = await lokasiAktif(tx, d.locationId)
    const sebelum = { lokasi: pr.location.name, date: iso(pr.date), requiredDate: iso(pr.requiredDate), note: pr.note }
    const sesudah = { lokasi: l.name, date: iso(d.date), requiredDate: iso(d.requiredDate), note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.purchaseRequest.update({ where: { id }, data: { ...d, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'permintaan.ubah', docType: JENIS, docId: id, summary: `Mengubah kepala permintaan pembelian ${pr.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

export async function tambahBarisPermintaan(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaBarisPermintaan.parse(masukan)
  return db.$transaction(async (tx) => {
    const pr = await muatDraf(tx, id)
    const p = await produkBeli(tx, d.item.productId)
    await faktorSatuan(tx, p.id, d.item.unitId)
    if ((await tx.purchaseRequestLine.count({ where: { purchaseRequestId: id } })) >= BATAS_BARIS_BELI) throw new GalatAturan(`Satu dokumen paling banyak ${BATAS_BARIS_BELI} baris.`)
    const u = await tx.unit.findUniqueOrThrow({ where: { id: d.item.unitId } })
    const b = await tx.purchaseRequestLine.create({ data: { purchaseRequestId: id, productId: p.id, unitId: u.id, qty: d.qty, note: d.note } })
    await tx.purchaseRequest.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'permintaan.baris_tambah',
      docType: JENIS,
      docId: id,
      summary: `Menambah baris ${pr.no}: ${formatQty(d.qty)} ${u.symbol} ${p.name}`,
      after: { lineId: b.id, produk: p.code, satuan: u.symbol, qty: d.qty, note: d.note },
    })
    return b
  })
}

export async function hapusBarisPermintaan(db: Db, k: Konteks, aktor: Aktor, id: number, idBaris: number) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const pr = await muatDraf(tx, id)
    const b = await tx.purchaseRequestLine.findFirst({ where: { id: idBaris, purchaseRequestId: id }, include: { product: true, unit: true } })
    if (!b) throw new GalatAturan('Baris tidak ditemukan.')
    if (await tx.purchaseOrderLine.count({ where: { purchaseRequestLineId: idBaris } })) throw new GalatAturan('Baris ini sudah dirujuk pesanan pembelian.')
    await tx.purchaseRequestLine.delete({ where: { id: idBaris } })
    await catatAudit(tx, k, {
      action: 'permintaan.baris_hapus',
      docType: JENIS,
      docId: id,
      summary: `Menghapus baris ${pr.no}: ${formatQty(b.qty)} ${b.unit.symbol} ${b.product.name}`,
      before: { lineId: b.id, produk: b.product.code, qty: b.qty },
    })
  })
}

// Progres pesan dihitung ulang dari qty_ordered. PR yang Disetujui menjadi Selesai bila semua baris dipesan penuh, dan
// PR yang Selesai otomatis (tanpa alasan tutup) kembali Disetujui bila pesanannya dibatalkan.
export async function perbaruiProgresPermintaan(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const pr = await tx.purchaseRequest.findUniqueOrThrow({ where: { id }, include: { purchaseRequestLines: true } })
  const progres = hitungProgres(pr.purchaseRequestLines.map((b) => ({ target: b.qty, selesai: b.qtyOrdered })))
  const data: { orderProgress: typeof progres; status?: 'Selesai' | 'Disetujui'; closedAt?: Date | null } = { orderProgress: progres }
  if (progres === 'Penuh' && pr.status === 'Disetujui') Object.assign(data, { status: 'Selesai', closedAt: new Date() })
  if (progres !== 'Penuh' && pr.status === 'Selesai' && !pr.closeReason) Object.assign(data, { status: 'Disetujui', closedAt: null })
  await tx.purchaseRequest.update({ where: { id }, data })
  return data
}

export const KAIT_PERMINTAAN: KaitBeli<KepalaBeli> = {
  jenis: JENIS,
  muat: (tx, id) => tx.purchaseRequest.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.purchaseRequest.update({ where: { id }, data }),
  butuhSetuju: async (tx) => !!(await aturanBeli(tx, JENIS)),
  periksaIsi: async (tx, d) => {
    if (!(await tx.purchaseRequestLine.count({ where: { purchaseRequestId: d.id } }))) throw new GalatAturan('Tambahkan minimal satu baris dulu.')
  },
  batal: async (tx, d, _a, dari) => {
    if (dari !== 'Disetujui') return
    const dipesan = await tx.purchaseRequestLine.count({ where: { purchaseRequestId: d.id, qtyOrdered: { gt: 0 } } })
    if (dipesan) throw new GalatAturan('Permintaan ini sudah dipesan lewat pesanan pembelian yang Disetujui. Batalkan pesanannya dulu, atau pakai Tutup sisa.')
  },
}

export const ubahStatusPermintaan = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiBeli, opsi: { alasan?: string } = {}) => ubahStatusBeli(db, k, aktor, KAIT_PERMINTAAN, id, aksi, opsi)

export const hapusPermintaan = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDrafBeli(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.purchaseRequest.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    if (await tx.purchaseOrderLine.count({ where: { purchaseRequestLine: { purchaseRequestId: id } } })) throw new GalatAturan('Permintaan ini sudah dirujuk pesanan pembelian.')
    await tx.purchaseRequest.delete({ where: { id } })
    return d
  })

export const muatPermintaan = (db: Db, id: number) =>
  db.purchaseRequest.findUnique({
    where: { id },
    include: {
      location: true,
      purchaseRequestLines: { include: { product: { include: { baseUnit: true } }, unit: true, purchaseOrderLines: { include: { purchaseOrder: { select: { id: true, no: true, status: true } } } } }, orderBy: { id: 'asc' } },
    },
  })

export async function daftarPermintaan(db: Db, s: SaringBeli) {
  const { where, hal, per } = saringBeli(s)
  const [baris, total] = await Promise.all([
    db.purchaseRequest.findMany({ where, include: { location: true, _count: { select: { purchaseRequestLines: true } } }, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * per, take: per }),
    db.purchaseRequest.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: jumlahHal(total) }
}

// Baris permintaan Disetujui yang masih punya sisa untuk dipesan (pilihan di pesanan pembelian).
export async function barisPermintaanTerbuka(db: Db | Tx) {
  const baris = await db.purchaseRequestLine.findMany({
    where: { purchaseRequest: { status: 'Disetujui' } },
    include: { purchaseRequest: { select: { id: true, no: true } }, product: true, unit: true },
    orderBy: [{ purchaseRequestId: 'asc' }, { id: 'asc' }],
    take: 300,
  })
  return baris.filter((b) => des(b.qty).gt(des(b.qtyOrdered)))
}

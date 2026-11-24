// Pesanan Pembelian (tahap 4C, RANCANGAN 3.2). Dokumen rencana ke satu pemasok, tanpa efek stok dan jurnal. Semua
// pesanan (approval_rule purchase_order dengan min_amount kosong, KONTRAK 11 butir 63) wajib diajukan dan disetujui
// pemegang Setujui (Owner). Progres terima (Belum, Sebagian, Penuh) dari qty diterima penerimaan Diposting. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan, GalatSaklar } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin, saklarNyala } from '../izin-inti'
import { skemaCentang, skemaTanggal, skemaUang, formatRupiah } from '../master'
import { ambilNomor } from '../nomor'
import { Desimal, des, formatQty, isianQty, skemaQty, skemaQtyOpsional, pesanQtyRancu } from '../stok/angka'
import {
  BATAS_BARIS_BELI,
  DOK_BELI,
  uangOpsional,
  aturanBeli,
  faktorSatuan,
  hapusDrafBeli,
  hargaTerakhir,
  hitungProgres,
  idSkema,
  jumlahHal,
  kunciBaris,
  lokasiAktif,
  nilaiBaris,
  pastikanSalahSatu,
  pemasokAktif,
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
import { perbaruiProgresPermintaan } from './permintaan'

const JENIS = 'purchase_order' as const
const INFO = DOK_BELI[JENIS]
const MENU = INFO.menu

export const skemaKepalaPesanan = z.object({
  supplierId: idSkema('pemasok'),
  locationId: idSkema('lokasi terima'),
  date: skemaTanggalWajib('Tanggal'),
  expectedDate: skemaTanggal('Perkiraan tiba'),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

export const skemaBarisPesanan = z.object({
  item: z.string().optional(),
  prLineId: z
    .string()
    .optional()
    .transform((v) => (v && /^\d+$/.test(v) ? Number(v) : null)),
  qty: skemaQtyOpsional({ label: 'Qty' }),
  price: uangOpsional('Harga'),
  isFree: skemaCentang,
})

function periksaKepala(aktor: Aktor, d: z.infer<typeof skemaKepalaPesanan>) {
  periksaTanggal(aktor, d.date)
  if (d.expectedDate && d.expectedDate.getTime() < d.date.getTime()) throw new GalatAturan('Perkiraan tiba tidak boleh sebelum tanggal pesanan.', 'expectedDate')
}

// Jumlah per baris dan kepala. Diskon per baris tidak dipakai (harga diisi bersih) dan PPN tidak dihitung karena
// Greenbox bukan PKP (RANCANGAN 11.2 butir 6).
export async function hitungUlangPesanan(tx: Tx, id: number) {
  const baris = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } })
  const subtotal = baris.reduce((n, b) => n + (b.isFree ? 0n : nilaiBaris(b.qty, b.price)), 0n)
  await tx.purchaseOrder.update({ where: { id }, data: { subtotal, tax: 0n, total: subtotal } })
  return subtotal
}

export async function buatPesanan(db: Db, k: Konteks, aktor: Aktor, masukan: unknown, dariPermintaan?: number) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKepalaPesanan.parse(masukan)
  periksaKepala(aktor, d)
  return db.$transaction(async (tx) => {
    const s = await pemasokAktif(tx, d.supplierId)
    const l = await lokasiAktif(tx, d.locationId)
    const no = await ambilNomor(tx, JENIS, INFO.awalan, d.date)
    const po = await tx.purchaseOrder.create({ data: { ...d, no, createdBy: aktor.id, updatedBy: aktor.id } })
    let dariPr = ''
    if (dariPermintaan) {
      // Baris diambil dari sisa permintaan Disetujui, harga bawaan harga terakhir produk.
      const pr = await tx.purchaseRequest.findUnique({ where: { id: dariPermintaan }, include: { purchaseRequestLines: { include: { product: true }, orderBy: { id: 'asc' } } } })
      if (!pr || pr.status !== 'Disetujui') throw new GalatAturan('Permintaan harus berstatus Disetujui untuk dipesan.')
      let n = 0
      for (const b of pr.purchaseRequestLines) {
        const sisa = des(b.qty).minus(des(b.qtyOrdered))
        if (!sisa.gt(0)) continue
        const faktor = await faktorSatuan(tx, b.productId, b.unitId)
        await tx.purchaseOrderLine.create({
          data: { purchaseOrderId: po.id, purchaseRequestLineId: b.id, productId: b.productId, unitId: b.unitId, qty: sisa, factor: faktor, price: hargaTerakhir(b.product.lastCost, faktor) },
        })
        n++
      }
      if (!n) throw new GalatAturan('Semua baris permintaan ini sudah dipesan.')
      await hitungUlangPesanan(tx, po.id)
      dariPr = ` dari ${pr.no} (${n} baris)`
    }
    await catatAudit(tx, k, {
      action: 'pesanan.tambah',
      docType: JENIS,
      docId: po.id,
      summary: `Membuat draf pesanan pembelian ${no} ke ${s.name}${dariPr}`,
      after: { no, pemasok: s.name, lokasi: l.name, ...d, dariPermintaan: dariPermintaan ?? null },
    })
    return po
  })
}

async function muatDraf(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, location: true } })
  if (!po) throw new GalatAturan('Pesanan pembelian tidak ditemukan.')
  if (po.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return po
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

export async function ubahKepalaPesanan(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaPesanan.parse(masukan)
  periksaKepala(aktor, d)
  return db.$transaction(async (tx) => {
    const po = await muatDraf(tx, id)
    const s = await pemasokAktif(tx, d.supplierId)
    const l = await lokasiAktif(tx, d.locationId)
    const sebelum = { pemasok: po.supplier.name, lokasi: po.location.name, date: iso(po.date), expectedDate: iso(po.expectedDate), note: po.note }
    const sesudah = { pemasok: s.name, lokasi: l.name, date: iso(d.date), expectedDate: iso(d.expectedDate), note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.purchaseOrder.update({ where: { id }, data: { ...d, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pesanan.ubah', docType: JENIS, docId: id, summary: `Mengubah kepala pesanan pembelian ${po.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

// Harga yang berbeda dari harga terakhir butuh saklar beli.ubah_harga_po. Produk yang belum pernah dibeli bebas harga.
export function periksaHargaPesanan(aktor: Aktor, nama: string, harga: bigint, terakhir: bigint, kolom = 'price') {
  if (terakhir > 0n && harga !== terakhir && !saklarNyala(aktor, 'beli.ubah_harga_po')) {
    throw new GalatSaklar('beli.ubah_harga_po', `Harga ${nama} harus sama dengan harga terakhir ${formatRupiah(terakhir)}. Mengubah harga butuh saklar Ubah harga pesanan.`, kolom)
  }
}

// Sisa permintaan yang boleh dipesan baris ini (qty pesanan lain yang sudah Disetujui sudah tercatat di qty_ordered).
function periksaQtyPermintaan(aktor: Aktor, qty: Desimal, pr: { qty: Desimal | string; qtyOrdered: Desimal | string }, nama: string) {
  const sisa = des(pr.qty).minus(des(pr.qtyOrdered))
  if (qty.gt(sisa) && !saklarNyala(aktor, 'beli.ubah_qty_pr')) {
    throw new GalatSaklar('beli.ubah_qty_pr', `Qty ${nama} melebihi sisa permintaan (${formatQty(sisa)}). Melebihi permintaan butuh saklar Ubah qty permintaan.`, 'qty')
  }
}

export async function tambahBarisPesanan(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaBarisPesanan.parse(masukan)
  return db.$transaction(async (tx) => {
    const po = await muatDraf(tx, id)
    let productId: number
    let unitId: number
    let qty = d.qty
    const prLine = d.prLineId ? await tx.purchaseRequestLine.findUnique({ where: { id: d.prLineId }, include: { purchaseRequest: true } }) : null
    if (d.prLineId) {
      if (!prLine || prLine.purchaseRequest.status !== 'Disetujui') throw new GalatAturan('Baris permintaan tidak ditemukan atau permintaannya belum Disetujui.', 'prLineId')
      productId = prLine.productId
      unitId = prLine.unitId
      qty = qty ?? des(prLine.qty).minus(des(prLine.qtyOrdered))
    } else {
      if (!saklarNyala(aktor, 'beli.po_tanpa_pr')) throw new GalatSaklar('beli.po_tanpa_pr', 'Pesanan harus merujuk permintaan pembelian. Membuat pesanan tanpa permintaan butuh saklar Pesanan tanpa permintaan.', 'prLineId')
      const it = skemaBarang.safeParse(d.item ?? '')
      if (!it.success) throw new GalatAturan('Pilih produk dan satuannya.', 'item')
      ;({ productId, unitId } = it.data)
    }
    if (!qty || !qty.gt(0)) throw new GalatAturan('Qty wajib diisi.', 'qty')
    const p = await produkBeli(tx, productId)
    const faktor = await faktorSatuan(tx, productId, unitId)
    const rancu = pesanQtyRancu((masukan as Record<string, unknown>)?.qty, faktor)
    if (rancu) throw new GalatAturan(rancu, 'qty')
    if (prLine) periksaQtyPermintaan(aktor, qty, prLine, p.name)
    const terakhir = hargaTerakhir(p.lastCost, faktor)
    const harga = d.isFree ? 0n : d.price || terakhir
    if (!d.isFree) {
      if (harga <= 0n) throw new GalatAturan('Harga harus lebih dari 0, atau centang barang bonus.', 'price')
      periksaHargaPesanan(aktor, p.name, harga, terakhir)
    }
    if ((await tx.purchaseOrderLine.count({ where: { purchaseOrderId: id } })) >= BATAS_BARIS_BELI) throw new GalatAturan(`Satu dokumen paling banyak ${BATAS_BARIS_BELI} baris.`)
    const u = await tx.unit.findUniqueOrThrow({ where: { id: unitId } })
    const b = await tx.purchaseOrderLine.create({ data: { purchaseOrderId: id, purchaseRequestLineId: prLine?.id ?? null, productId, unitId, qty, factor: faktor, price: harga, isFree: d.isFree } })
    await hitungUlangPesanan(tx, id)
    await tx.purchaseOrder.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'pesanan.baris_tambah',
      docType: JENIS,
      docId: id,
      summary: `Menambah baris ${po.no}: ${formatQty(qty)} ${u.symbol} ${p.name} @ ${formatRupiah(harga)}${d.isFree ? ' (bonus)' : ''}`,
      after: { lineId: b.id, produk: p.code, satuan: u.symbol, qty, price: harga, isFree: d.isFree, prLineId: prLine?.id ?? null },
    })
    return b
  })
}

// Simpan qty dan harga semua baris draf sekaligus (nama isian qty_<id> dan price_<id>).
export async function simpanBarisPesanan(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const po = await muatDraf(tx, id)
    const baris = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id }, include: { product: true, unit: true, purchaseRequestLine: true }, orderBy: { id: 'asc' } })
    const ubah: { lineId: number; produk: string; sebelum: Record<string, string>; sesudah: Record<string, string> }[] = []
    for (const b of baris) {
      const q = skemaQty({ label: `Qty ${b.product.name}` }).safeParse(String(masukan[`qty_${b.id}`] ?? isianQty(b.qty)))
      if (!q.success) throw new GalatAturan(q.error.issues[0].message, `qty_${b.id}`)
      const rancu = pesanQtyRancu(masukan[`qty_${b.id}`], b.factor, `Qty ${b.product.name}`)
      if (rancu) throw new GalatAturan(rancu, `qty_${b.id}`)
      const h = b.isFree ? { success: true as const, data: 0n } : skemaUang({ label: `Harga ${b.product.name}` }).safeParse(String(masukan[`price_${b.id}`] ?? b.price.toString()))
      if (!h.success) throw new GalatAturan(h.error.issues[0].message, `price_${b.id}`)
      if (q.data.eq(des(b.qty)) && h.data === b.price) continue
      if (!b.isFree && h.data !== b.price) periksaHargaPesanan(aktor, b.product.name, h.data, hargaTerakhir(b.product.lastCost, b.factor), `price_${b.id}`)
      if (b.purchaseRequestLine) periksaQtyPermintaan(aktor, q.data, b.purchaseRequestLine, b.product.name)
      await tx.purchaseOrderLine.update({ where: { id: b.id }, data: { qty: q.data, price: h.data } })
      ubah.push({ lineId: b.id, produk: b.product.code, sebelum: { qty: b.qty.toString(), price: b.price.toString() }, sesudah: { qty: q.data.toString(), price: h.data.toString() } })
    }
    if (!ubah.length) return 0
    const total = await hitungUlangPesanan(tx, id)
    await tx.purchaseOrder.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'pesanan.baris_ubah',
      docType: JENIS,
      docId: id,
      summary: `Mengubah qty atau harga ${ubah.length} baris ${po.no}, total ${formatRupiah(total)}`,
      before: ubah.map((u) => ({ lineId: u.lineId, produk: u.produk, ...u.sebelum })),
      after: ubah.map((u) => ({ lineId: u.lineId, produk: u.produk, ...u.sesudah })),
    })
    return ubah.length
  })
}

export async function hapusBarisPesanan(db: Db, k: Konteks, aktor: Aktor, id: number, idBaris: number) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const po = await muatDraf(tx, id)
    const b = await tx.purchaseOrderLine.findFirst({ where: { id: idBaris, purchaseOrderId: id }, include: { product: true, unit: true } })
    if (!b) throw new GalatAturan('Baris tidak ditemukan.')
    await tx.purchaseOrderLine.delete({ where: { id: idBaris } })
    await hitungUlangPesanan(tx, id)
    await catatAudit(tx, k, {
      action: 'pesanan.baris_hapus',
      docType: JENIS,
      docId: id,
      summary: `Menghapus baris ${po.no}: ${formatQty(b.qty)} ${b.unit.symbol} ${b.product.name}`,
      before: { lineId: b.id, produk: b.product.code, qty: b.qty, price: b.price },
    })
  })
}

type KepalaPesanan = KepalaBeli & { total: bigint; supplierId: number; closeReason: string | null }

async function aturanPesanan(tx: Tx, total: bigint) {
  const r = await aturanBeli(tx, JENIS)
  if (!r) return false
  return r.minAmount === null || total > r.minAmount
}

// Progres terima dari qty diterima. Pesanan Disetujui yang diterima penuh menjadi Selesai bila saklar
// beli.po_selesai_otomatis aktor menyala; pesanan Selesai otomatis kembali Disetujui bila qty diterima berkurang.
export async function perbaruiProgresPesanan(tx: Tx, id: number, aktor: Aktor) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { purchaseOrderLines: true } })
  const progres = hitungProgres(po.purchaseOrderLines.map((b) => ({ target: b.qty, selesai: b.qtyReceived })))
  const data: { receiveProgress: typeof progres; status?: 'Selesai' | 'Disetujui'; closedAt?: Date | null } = { receiveProgress: progres }
  if (progres === 'Penuh' && po.status === 'Disetujui' && saklarNyala(aktor, 'beli.po_selesai_otomatis')) Object.assign(data, { status: 'Selesai', closedAt: new Date() })
  if (progres !== 'Penuh' && po.status === 'Selesai' && !po.closeReason) Object.assign(data, { status: 'Disetujui', closedAt: null })
  await tx.purchaseOrder.update({ where: { id }, data })
  return data
}

export const KAIT_PESANAN: KaitBeli<KepalaPesanan> = {
  jenis: JENIS,
  muat: (tx, id) => tx.purchaseOrder.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.purchaseOrder.update({ where: { id }, data }),
  butuhSetuju: (tx, d) => aturanPesanan(tx, d.total),
  periksaIsi: async (tx, d, aktor) => {
    const baris = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: d.id }, include: { product: true, purchaseRequestLine: { include: { purchaseRequest: true } } } })
    if (!baris.length) throw new GalatAturan('Tambahkan minimal satu baris dulu.')
    await pemasokAktif(tx, d.supplierId)
    for (const b of baris) {
      if (!b.product.active) throw new GalatAturan(`Produk ${b.product.name} sudah nonaktif. Hapus barisnya dulu.`)
      if (!b.isFree && b.price <= 0n) throw new GalatAturan(`Isi harga ${b.product.name}, atau tandai sebagai barang bonus.`)
      if (!b.purchaseRequestLine && !saklarNyala(aktor, 'beli.po_tanpa_pr')) throw new GalatSaklar('beli.po_tanpa_pr', `Baris ${b.product.name} tidak merujuk permintaan. Pesanan tanpa permintaan butuh saklar Pesanan tanpa permintaan.`)
    }
  },
  setujui: async (tx, d, aktor) => {
    // Qty dipesan di permintaan bertambah saat pesanan Disetujui (RANCANGAN 3.1).
    const baris = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: d.id, purchaseRequestLineId: { not: null } }, include: { product: true }, orderBy: { purchaseRequestLineId: 'asc' } })
    const prDisentuh = new Set<number>()
    for (const b of baris) {
      await kunciBaris(tx, 'purchase_request_line', b.purchaseRequestLineId!)
      const pr = await tx.purchaseRequestLine.findUniqueOrThrow({ where: { id: b.purchaseRequestLineId! }, include: { purchaseRequest: true } })
      if (pr.purchaseRequest.status !== 'Disetujui') throw new GalatAturan(`Permintaan ${pr.purchaseRequest.no} sudah tidak berstatus Disetujui.`)
      periksaQtyPermintaan(aktor, des(b.qty), pr, b.product.name)
      await tx.purchaseRequestLine.update({ where: { id: pr.id }, data: { qtyOrdered: des(pr.qtyOrdered).plus(des(b.qty)) } })
      prDisentuh.add(pr.purchaseRequestId)
    }
    for (const id of [...prDisentuh].sort((a, b) => a - b)) await perbaruiProgresPermintaan(tx, id)
    return { ringkas: `total ${formatRupiah(d.total)}`, sesudah: { total: d.total } }
  },
  batal: async (tx, d, _a, dari) => {
    if (dari !== 'Disetujui') return
    const terima = await tx.goodsReceipt.count({ where: { purchaseOrderId: d.id, status: 'Diposting' } })
    if (terima) throw new GalatAturan('Pesanan ini sudah punya penerimaan barang yang Diposting. Batalkan penerimaannya dulu, atau pakai Tutup sisa.')
    const baris = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: d.id, purchaseRequestLineId: { not: null } }, orderBy: { purchaseRequestLineId: 'asc' } })
    const prDisentuh = new Set<number>()
    for (const b of baris) {
      await kunciBaris(tx, 'purchase_request_line', b.purchaseRequestLineId!)
      const pr = await tx.purchaseRequestLine.findUniqueOrThrow({ where: { id: b.purchaseRequestLineId! } })
      await tx.purchaseRequestLine.update({ where: { id: pr.id }, data: { qtyOrdered: Desimal.max(0, des(pr.qtyOrdered).minus(des(b.qty))) } })
      prDisentuh.add(pr.purchaseRequestId)
    }
    for (const id of [...prDisentuh].sort((a, b) => a - b)) await perbaruiProgresPermintaan(tx, id)
  },
  tutup: async (_tx, _d, aktor) => {
    if (!saklarNyala(aktor, 'beli.tutup_po')) throw new GalatSaklar('beli.tutup_po', 'Menutup sisa pesanan butuh saklar Tutup pesanan.')
  },
}

export const ubahStatusPesanan = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiBeli, opsi: { alasan?: string } = {}) => ubahStatusBeli(db, k, aktor, KAIT_PESANAN, id, aksi, opsi)

export const butuhSetujuPesanan = (db: Db, total: bigint) => db.$transaction((tx) => aturanPesanan(tx, total))

export const hapusPesanan = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDrafBeli(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.purchaseOrder.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    if (await tx.goodsReceipt.count({ where: { purchaseOrderId: id } })) throw new GalatAturan('Pesanan ini sudah punya penerimaan barang.')
    await tx.purchaseOrder.delete({ where: { id } })
    return d
  })

export const muatPesanan = (db: Db, id: number) =>
  db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      location: true,
      purchaseOrderLines: { include: { product: { include: { baseUnit: true } }, unit: true, purchaseRequestLine: { include: { purchaseRequest: { select: { id: true, no: true } } } } }, orderBy: { id: 'asc' } },
      goodsReceipts: { orderBy: { id: 'asc' }, select: { id: true, no: true, date: true, status: true } },
    },
  })

export async function daftarPesanan(db: Db, s: SaringBeli) {
  const { where: dasar, pemasok, hal, per } = saringBeli(s)
  const where = { ...dasar, ...(pemasok ? { supplierId: pemasok } : {}) }
  const [baris, total] = await Promise.all([
    db.purchaseOrder.findMany({ where, include: { supplier: true, location: true, _count: { select: { purchaseOrderLines: true } } }, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * per, take: per }),
    db.purchaseOrder.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: jumlahHal(total) }
}

export const pesananTerbuka = (db: Db) =>
  db.purchaseOrder.findMany({ where: { status: 'Disetujui' }, include: { supplier: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 200 })

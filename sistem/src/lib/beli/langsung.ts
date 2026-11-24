// Pembelian Langsung (tahap 4C, RANCANGAN 3.6, setara Simple Purchase ESB). Satu dokumen untuk terima barang sekaligus
// mencatat beli, tunai atau kredit. Stok masuk saat Diposting lewat mesin stok dengan hargaBeli. Tunai langsung Lunas
// (dibayar dari kas atau rekening bank); kredit menjadi hutang yang dibayar lewat Pembayaran Pembelian. Baris "hanya
// biaya" (tidak distok) butuh saklar beli.langsung_biaya. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, DbAtauTx, Tx } from '../db'
import { batasSaklar, pastikanIzin, saklarNyala } from '../izin-inti'
import { formatRupiah, skemaTanggal } from '../master'
import { ambilNomor } from '../nomor'
import { Desimal, des, formatQty, skemaQty } from '../stok/angka'
import { catatGerak } from '../stok/mesin'
import {
  BATAS_BARIS_BELI,
  DOK_BELI,
  aturanBeli,
  uangOpsional,
  dataPelaksana,
  bagiBiaya,
  faktorSatuan,
  hapusDrafBeli,
  hargaTerakhir,
  idSkema,
  jatuhTempo,
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

const JENIS = 'direct_purchase' as const
const INFO = DOK_BELI[JENIS]
const MENU = INFO.menu

export const CARA_BAYAR = { tunai: 'Tunai', kredit: 'Kredit' } as const

export const skemaKepalaLangsung = z.object({
  supplierId: idSkema('pemasok'),
  locationId: idSkema('lokasi'),
  date: skemaTanggalWajib('Tanggal'),
  payMode: z.enum(['tunai', 'kredit'], { message: 'Pilih tunai atau kredit.' }),
  // "kas" atau id rekening bank. Hanya dipakai untuk tunai.
  sumber: z.string().regex(/^(kas|\d+)$/, 'Pilih kas atau rekening bank.').default('kas'),
  supplierInvoiceNo: z.string().trim().max(40, 'Nomor nota paling panjang 40 huruf.').default(''),
  dueDate: skemaTanggal('Jatuh tempo'),
  extraCost: uangOpsional('Biaya tambahan'),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

export const skemaBarisLangsung = z.object({
  // Kosong: baris biaya bila keterangan diisi tanpa produk.
  jenis: z.enum(['barang', 'biaya']).optional(),
  item: z.string().optional(),
  qty: z.string().optional(),
  price: uangOpsional('Harga'),
  amount: uangOpsional('Jumlah'),
  description: z.string().trim().max(120, 'Keterangan paling panjang 120 huruf.').default(''),
})

function periksaCaraBayar(aktor: Aktor, cara: string) {
  if (cara === 'tunai' && !saklarNyala(aktor, 'beli.langsung_tunai')) throw new GalatAturan('Pembelian langsung tunai butuh saklar Pembelian langsung tunai.', 'payMode')
  if (cara === 'kredit' && !saklarNyala(aktor, 'beli.langsung_kredit')) throw new GalatAturan('Pembelian langsung kredit butuh saklar Pembelian langsung kredit.', 'payMode')
}

async function rekeningSumber(tx: Tx, sumber: string, payMode: string) {
  if (payMode !== 'tunai' || sumber === 'kas') return null
  const r = await tx.bankAccount.findUnique({ where: { id: Number(sumber) } })
  if (!r || !r.active) throw new GalatAturan('Rekening bank tidak ditemukan atau nonaktif.', 'sumber')
  return r.id
}

function kepalaData(aktor: Aktor, d: z.infer<typeof skemaKepalaLangsung>) {
  periksaTanggal(aktor, d.date)
  periksaCaraBayar(aktor, d.payMode)
  if (d.dueDate && d.dueDate.getTime() < d.date.getTime()) throw new GalatAturan('Jatuh tempo tidak boleh sebelum tanggal pembelian.', 'dueDate')
  const isi: Partial<typeof d> = { ...d }
  delete isi.sumber
  return isi as Omit<typeof d, 'sumber'>
}

export async function buatLangsung(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKepalaLangsung.parse(masukan)
  const isi = kepalaData(aktor, d)
  return db.$transaction(async (tx) => {
    const s = await pemasokAktif(tx, d.supplierId)
    const l = await lokasiAktif(tx, d.locationId)
    const bankAccountId = await rekeningSumber(tx, d.sumber, d.payMode)
    const dueDate = d.payMode === 'kredit' ? (d.dueDate ?? jatuhTempo(d.date, s.creditDays)) : null
    const no = await ambilNomor(tx, JENIS, INFO.awalan, d.date)
    const bl = await tx.directPurchase.create({ data: { ...isi, dueDate, bankAccountId, no, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'beli_langsung.tambah',
      docType: JENIS,
      docId: bl.id,
      summary: `Membuat draf pembelian langsung ${no} (${CARA_BAYAR[d.payMode].toLowerCase()}) dari ${s.name} di ${l.name}`,
      after: { no, pemasok: s.name, lokasi: l.name, ...isi, dueDate, bankAccountId },
    })
    return bl
  })
}

async function muatDraf(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const bl = await tx.directPurchase.findUnique({ where: { id }, include: { supplier: true, location: true } })
  if (!bl) throw new GalatAturan('Pembelian langsung tidak ditemukan.')
  if (bl.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return bl
}

export async function ubahKepalaLangsung(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaLangsung.parse(masukan)
  const isi = kepalaData(aktor, d)
  return db.$transaction(async (tx) => {
    const bl = await muatDraf(tx, id)
    const s = await pemasokAktif(tx, d.supplierId)
    const l = await lokasiAktif(tx, d.locationId)
    const bankAccountId = await rekeningSumber(tx, d.sumber, d.payMode)
    const dueDate = d.payMode === 'kredit' ? (d.dueDate ?? jatuhTempo(d.date, s.creditDays)) : null
    const iso = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null)
    const sebelum = { pemasok: bl.supplier.name, lokasi: bl.location.name, date: iso(bl.date), payMode: bl.payMode, bankAccountId: bl.bankAccountId, supplierInvoiceNo: bl.supplierInvoiceNo, dueDate: iso(bl.dueDate), extraCost: bl.extraCost.toString(), note: bl.note }
    const sesudah = { pemasok: s.name, lokasi: l.name, date: iso(d.date), payMode: d.payMode, bankAccountId, supplierInvoiceNo: d.supplierInvoiceNo, dueDate: iso(dueDate), extraCost: d.extraCost.toString(), note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.directPurchase.update({ where: { id }, data: { ...isi, dueDate, bankAccountId, updatedBy: aktor.id } })
    await hitungUlangLangsung(tx, id)
    await catatAudit(tx, k, { action: 'beli_langsung.ubah', docType: JENIS, docId: id, summary: `Mengubah kepala pembelian langsung ${bl.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

// Harga yang berbeda dari harga terakhir lebih dari batas saklar beli.ubah_harga_langsung (persen, bawaan 20) butuh
// saklar itu menyala. Produk yang belum pernah dibeli bebas harga.
export function periksaHargaLangsung(aktor: Aktor, nama: string, harga: bigint, terakhir: bigint) {
  if (terakhir <= 0n || saklarNyala(aktor, 'beli.ubah_harga_langsung')) return
  const batas = batasSaklar(aktor, 'beli.ubah_harga_langsung') ?? 20
  const beda = new Desimal((harga - terakhir).toString()).abs().times(100).div(terakhir.toString())
  if (beda.gt(batas)) throw new GalatAturan(`Harga ${nama} berbeda ${beda.toFixed(0)}% dari harga terakhir ${formatRupiah(terakhir)}, melebihi batas ${batas}%. Butuh saklar Ubah harga pembelian langsung.`, 'price')
}

export async function hitungUlangLangsung(tx: Tx, id: number) {
  const bl = await tx.directPurchase.findUniqueOrThrow({ where: { id }, include: { directPurchaseLines: true } })
  let subtotal = 0n
  for (const b of bl.directPurchaseLines) {
    const jumlah = b.productId ? nilaiBaris(b.qty, b.price) : b.price
    if (jumlah !== b.lineTotal) await tx.directPurchaseLine.update({ where: { id: b.id }, data: { lineTotal: jumlah } })
    subtotal += jumlah
  }
  const total = subtotal + bl.extraCost
  await tx.directPurchase.update({ where: { id }, data: { subtotal, tax: 0n, total } })
  return { subtotal, total }
}

export async function tambahBarisLangsung(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaBarisLangsung.parse(masukan)
  return db.$transaction(async (tx) => {
    const bl = await muatDraf(tx, id)
    if ((await tx.directPurchaseLine.count({ where: { directPurchaseId: id } })) >= BATAS_BARIS_BELI) throw new GalatAturan(`Satu dokumen paling banyak ${BATAS_BARIS_BELI} baris.`)
    let ringkas: string
    let after: Record<string, unknown>
    const jenis = d.jenis ?? (!d.item && d.description ? 'biaya' : 'barang')
    if (jenis === 'biaya') {
      if (!saklarNyala(aktor, 'beli.langsung_biaya')) throw new GalatAturan('Baris hanya biaya butuh saklar Baris hanya biaya.', 'jenis')
      if (d.description.length < 3) throw new GalatAturan('Keterangan biaya minimal 3 huruf.', 'description')
      const jumlah = d.amount || d.price
      if (jumlah <= 0n) throw new GalatAturan('Jumlah biaya harus lebih dari 0.', 'amount')
      const b = await tx.directPurchaseLine.create({ data: { directPurchaseId: id, description: d.description, qty: 1, price: jumlah } })
      ringkas = `biaya ${d.description} ${formatRupiah(jumlah)}`
      after = { lineId: b.id, jenis: 'biaya', description: d.description, price: jumlah }
    } else {
      const it = skemaBarang.safeParse(d.item ?? '')
      if (!it.success) throw new GalatAturan('Pilih produk dan satuannya.', 'item')
      const q = skemaQty({ label: 'Qty' }).safeParse(d.qty ?? '')
      if (!q.success) throw new GalatAturan(q.error.issues[0].message, 'qty')
      const p = await produkBeli(tx, it.data.productId)
      const faktor = await faktorSatuan(tx, p.id, it.data.unitId)
      const terakhir = hargaTerakhir(p.lastCost, faktor)
      const harga = d.price || terakhir
      if (harga <= 0n) throw new GalatAturan('Harga harus lebih dari 0.', 'price')
      periksaHargaLangsung(aktor, p.name, harga, terakhir)
      const u = await tx.unit.findUniqueOrThrow({ where: { id: it.data.unitId } })
      const b = await tx.directPurchaseLine.create({ data: { directPurchaseId: id, productId: p.id, unitId: u.id, qty: q.data, factor: faktor, price: harga } })
      ringkas = `${formatQty(q.data)} ${u.symbol} ${p.name} @ ${formatRupiah(harga)}`
      after = { lineId: b.id, jenis: 'barang', produk: p.code, satuan: u.symbol, qty: q.data, price: harga }
    }
    const t = await hitungUlangLangsung(tx, id)
    await tx.directPurchase.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'beli_langsung.baris_tambah', docType: JENIS, docId: id, summary: `Menambah baris ${bl.no}: ${ringkas}, total ${formatRupiah(t.total)}`, after })
  })
}

export async function hapusBarisLangsung(db: Db, k: Konteks, aktor: Aktor, id: number, idBaris: number) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const bl = await muatDraf(tx, id)
    const b = await tx.directPurchaseLine.findFirst({ where: { id: idBaris, directPurchaseId: id }, include: { product: true } })
    if (!b) throw new GalatAturan('Baris tidak ditemukan.')
    await tx.directPurchaseLine.delete({ where: { id: idBaris } })
    const t = await hitungUlangLangsung(tx, id)
    await catatAudit(tx, k, {
      action: 'beli_langsung.baris_hapus',
      docType: JENIS,
      docId: id,
      summary: `Menghapus baris ${bl.no}: ${b.product?.name ?? b.description}, total ${formatRupiah(t.total)}`,
      before: { lineId: b.id, produk: b.product?.code ?? null, description: b.description, qty: b.qty, price: b.price },
    })
  })
}

// Total dokumen dari barisnya tanpa menulis apa pun (dipakai aturan persetujuan dan tampilan).
export async function totalLangsung(db: DbAtauTx, id: number) {
  const bl = await db.directPurchase.findUniqueOrThrow({ where: { id }, include: { directPurchaseLines: true } })
  return bl.directPurchaseLines.reduce((n, b) => n + (b.productId ? nilaiBaris(b.qty, b.price) : b.price), 0n) + bl.extraCost
}

// Temuan audit B-2, keputusan pemilik (KONTRAK 11 butir 132): Pembelian Langsung tunai dengan total di atas batas
// approval_rule direct_purchase (bawaan Rp 1.000.000) wajib diajukan dan disetujui Owner. Kredit tidak, karena
// pembayarannya sudah wajib Owner. Di bawah atau sama dengan batas, Admin memposting sendiri.
export async function butuhSetujuLangsung(db: DbAtauTx, d: { id: number; payMode: string }) {
  if (d.payMode !== 'tunai') return false
  const r = await aturanBeli(db, JENIS)
  if (!r) return false
  return r.minAmount === null || (await totalLangsung(db, d.id)) > r.minAmount
}

type KepalaLangsung = KepalaBeli & { supplierId: number; locationId: number; payMode: string; bankAccountId: number | null; extraCost: bigint; paidAmount: bigint }

export const KAIT_LANGSUNG: KaitBeli<KepalaLangsung> = {
  jenis: JENIS,
  muat: (tx, id) => tx.directPurchase.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.directPurchase.update({ where: { id }, data: dataPelaksana(data) }),
  butuhSetuju: (tx, d) => butuhSetujuLangsung(tx, d),
  periksaIsi: async (tx, d, aktor) => {
    const baris = await tx.directPurchaseLine.findMany({ where: { directPurchaseId: d.id }, include: { product: true } })
    if (!baris.length) throw new GalatAturan('Tambahkan minimal satu baris dulu.')
    periksaCaraBayar(aktor, d.payMode)
    if (baris.some((b) => !b.productId) && !saklarNyala(aktor, 'beli.langsung_biaya')) throw new GalatAturan('Dokumen ini punya baris hanya biaya, yang butuh saklar Baris hanya biaya.')
    for (const b of baris) if (b.product && !b.product.active) throw new GalatAturan(`Produk ${b.product.name} sudah nonaktif. Hapus barisnya dulu.`)
  },
  posting: async (tx, d, asal) => {
    await pemasokAktif(tx, d.supplierId)
    await lokasiAktif(tx, d.locationId)
    if (d.payMode === 'tunai' && d.bankAccountId) {
      const r = await tx.bankAccount.findUnique({ where: { id: d.bankAccountId } })
      if (!r || !r.active) throw new GalatAturan('Rekening pembayar sudah nonaktif. Pilih kas atau rekening lain.')
    }
    const t = await hitungUlangLangsung(tx, d.id)
    if (t.total <= 0n) throw new GalatAturan('Total pembelian harus lebih dari 0.')
    const baris = await tx.directPurchaseLine.findMany({ where: { directPurchaseId: d.id, productId: { not: null } }, orderBy: { id: 'asc' } })
    // Biaya tambahan dibagi ke baris barang menurut nilainya dan masuk ke nilai persediaan (RANCANGAN 3.3 dan 3.6).
    const biaya = bagiBiaya(baris.length ? d.extraCost : 0n, baris.map((b) => b.lineTotal))
    const nilai = baris.map((b, i) => b.lineTotal + biaya[i])
    const hasil = baris.length
      ? await catatGerak(
          tx,
          asal,
          baris.map((b, i) => ({ productId: b.productId!, locationId: d.locationId, qty: des(b.qty).times(des(b.factor)).toDecimalPlaces(3, Desimal.ROUND_HALF_UP), nilai: nilai[i], lineId: b.id })),
          { hargaBeli: true },
        )
      : []
    for (const [i, h] of hasil.entries()) await tx.directPurchaseLine.update({ where: { id: baris[i].id }, data: { unitCost: h.hargaSatuan, extraAlloc: biaya[i], value: nilai[i] } })
    const tunai = d.payMode === 'tunai'
    await tx.directPurchase.update({ where: { id: d.id }, data: tunai ? { paidAmount: t.total, payStatus: 'Lunas' } : { paidAmount: 0n, payStatus: 'BelumBayar' } })
    return {
      ringkas: `${tunai ? 'tunai' : 'kredit'}, ${hasil.length} baris barang, total ${formatRupiah(t.total)}`,
      sesudah: { caraBayar: d.payMode, barisBarang: hasil.length, total: t.total, statusBayar: tunai ? 'Lunas' : 'BelumBayar' },
    }
  },
  batal: async (tx, d, _a, dari) => {
    if (dari !== 'Diposting') return
    if (d.payMode === 'kredit' && d.paidAmount > 0n) throw new GalatAturan('Pembelian kredit ini sudah dibayar. Batalkan pembayarannya dulu.')
    if (await tx.directPurchaseLine.count({ where: { directPurchaseId: d.id, qtyReturned: { gt: 0 } } })) throw new GalatAturan('Pembelian ini sudah diretur. Batalkan returnya dulu.')
  },
}

export const ubahStatusLangsung = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiBeli, opsi: { alasan?: string } = {}) => ubahStatusBeli(db, k, aktor, KAIT_LANGSUNG, id, aksi, opsi)

export const hapusLangsung = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDrafBeli(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.directPurchase.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    await tx.directPurchase.delete({ where: { id } })
    return d
  })

export const muatLangsung = (db: Db, id: number) =>
  db.directPurchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      location: true,
      directPurchaseLines: { include: { product: { include: { baseUnit: true } }, unit: true }, orderBy: { id: 'asc' } },
      purchaseReturns: { where: { status: { not: 'Batal' } }, select: { id: true, no: true, status: true } },
      purchasePaymentAllocs: { where: { purchasePayment: { status: { not: 'Batal' } } }, include: { purchasePayment: { select: { id: true, no: true, status: true } } } },
    },
  })

export async function daftarLangsung(db: Db, s: SaringBeli & { cara?: string }) {
  const { where: dasar, pemasok, hal, per } = saringBeli(s)
  const cara = s.cara === 'tunai' || s.cara === 'kredit' ? s.cara : undefined
  const where = { ...dasar, ...(pemasok ? { supplierId: pemasok } : {}), ...(cara ? { payMode: cara } : {}) }
  const [baris, total] = await Promise.all([
    db.directPurchase.findMany({ where, include: { supplier: true, location: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * per, take: per }),
    db.directPurchase.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: jumlahHal(total) }
}

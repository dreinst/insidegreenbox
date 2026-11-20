// Jurnal dokumen pembelian (tahap 5C, KONTRAK 11 butir 71 dan contoh 14.2). Dipanggil dari ubahStatusBeli di transaksi
// yang sama dengan posting atau pembatalan dokumennya, dan dari skrip bentuk ulang untuk dokumen lama. Nilai persediaan
// selalu dibaca dari stock_ledger dokumen itu. Bila nilai gerak balik berbeda dari gerak asal (KONTRAK 11 butir 32),
// bedanya masuk Selisih Harga Pembelian, supaya BDBF dan Hutang Usaha tetap persis. Tanpa impor Next.
import { GalatAturan } from '../aksi'
import type { DbAtauTx, Tx } from '../db'
import { des, keRupiah } from '../stok/angka'
import { ledgerDok } from './dokumen'
import { buatJurnal, buatJurnalBalik, dk, jurnalMaju, type BarisJurnal, type HasilJurnal, type KunciAkun } from './jurnal'
import { kunciBank, kunciPersediaan } from './pemetaan'

export const DOK_BELI_JURNAL = ['goods_receipt', 'purchase_invoice', 'purchase_return', 'direct_purchase', 'purchase_payment'] as const
export type JenisBeliJurnal = (typeof DOK_BELI_JURNAL)[number]

// Akun kas atau bank pembayar: rekening (bank.<id> lalu bank) atau Kas Besar.
export const kunciKasBank = (bankAccountId: number | null): KunciAkun => (bankAccountId ? kunciBank(bankAccountId) : 'kas_besar')

// Baris persediaan dari gerak stok dokumen, dan nilai bersihnya (plus masuk, minus keluar).
async function persediaan(tx: DbAtauTx, docType: string, docId: number, balik: boolean, memo: string) {
  const gerak = await ledgerDok(tx, docType, docId, balik)
  const baris: BarisJurnal[] = []
  let bersih = 0n
  for (const g of gerak) {
    const v = BigInt(g.value)
    if (v === 0n) continue
    baris.push(dk(kunciPersediaan(g.location_id), v, memo))
    bersih += v
  }
  return { baris, bersih }
}

// Penutup jurnal: sisa yang membuat seimbang masuk Selisih Harga Pembelian.
function tutupSelisih(baris: BarisJurnal[], memo: string) {
  const net = baris.reduce((n, b) => n + (b.debit ?? 0n) - (b.kredit ?? 0n), 0n)
  if (net !== 0n) baris.push(dk('selisih_harga_beli', -net, memo))
  return baris
}

const kepala = (docType: JenisBeliJurnal, d: { id: number; no: string }, tanggal: Date, memo: string, oleh: number | null) => ({ docType, docId: d.id, docNo: d.no, tanggal, memo, oleh })

// Dokumen lama yang belum punya jurnal maju dibentukkan dulu sebelum dibalik (sama dengan modul lain).
async function pastikanMaju(tx: Tx, jenis: JenisBeliJurnal, id: number, oleh: number | null) {
  if (!(await jurnalMaju(tx, jenis, id))) await JURNAL_BELI[jenis](tx, id, oleh)
}

async function isiBalik(tx: Tx, tabel: string, id: number, h: HasilJurnal | null) {
  if (h) await tx.$executeRawUnsafe(`UPDATE "${tabel}" SET reversal_journal_id = $1 WHERE id = $2`, h.id, id)
  return h
}

// --- Penerimaan Barang: debit Persediaan (nilai gerak), kredit BDBF sebesar subtotal + biaya tambahan ---
export async function jurnalPenerimaan(tx: Tx, id: number, oleh: number | null) {
  const gr = await tx.goodsReceipt.findUniqueOrThrow({ where: { id } })
  const memo = `Penerimaan ${gr.no}`
  const p = await persediaan(tx, 'goods_receipt', id, false, memo)
  const baris = [...p.baris, { akun: 'grni', kredit: gr.subtotal + gr.extraCost, memo, supplierId: gr.supplierId }]
  return buatJurnal(tx, kepala('goods_receipt', gr, gr.date, memo, oleh), tutupSelisih(baris, memo))
}

export async function balikJurnalPenerimaan(tx: Tx, id: number, tanggal: Date, oleh: number | null) {
  const gr = await tx.goodsReceipt.findUniqueOrThrow({ where: { id } })
  await pastikanMaju(tx, 'goods_receipt', id, oleh)
  const memo = `Batal penerimaan ${gr.no}`
  const p = await persediaan(tx, 'goods_receipt', id, true, memo)
  const baris = [...p.baris, { akun: 'grni', debit: gr.subtotal + gr.extraCost, memo, supplierId: gr.supplierId }]
  return isiBalik(tx, 'goods_receipt', id, await buatJurnalBalik(tx, kepala('goods_receipt', gr, tanggal, memo, oleh), tutupSelisih(baris, memo)))
}

// --- Faktur Pembelian: debit BDBF (nilai terima yang difakturkan), debit beban baris jasa, selisih harga, kredit Hutang ---
export async function jurnalFaktur(tx: Tx, id: number, oleh: number | null) {
  const f = await tx.purchaseInvoice.findUniqueOrThrow({ where: { id }, include: { purchaseInvoiceLines: true } })
  const memo = `Faktur ${f.no} (${f.supplierInvoiceNo})`
  let terima = 0n
  let selisih = 0n
  let jasa = 0n
  for (const b of f.purchaseInvoiceLines) {
    if (b.kind === 'jasa') jasa += b.lineTotal
    else {
      terima += b.receiptValue
      selisih += b.priceDiff
    }
  }
  if (terima + selisih + jasa !== f.total) throw new GalatAturan(`Total faktur ${f.no} tidak sama dengan jumlah barisnya. Simpan ulang barisnya.`)
  return buatJurnal(tx, kepala('purchase_invoice', f, f.date, memo, oleh), [
    { akun: 'grni', debit: terima, memo, supplierId: f.supplierId },
    dk('beban_beli', jasa, memo),
    dk('selisih_harga_beli', selisih, memo),
    { akun: 'hutang_usaha', kredit: f.total, memo, supplierId: f.supplierId },
  ])
}

export async function balikJurnalFaktur(tx: Tx, id: number, tanggal: Date, oleh: number | null) {
  const f = await tx.purchaseInvoice.findUniqueOrThrow({ where: { id } })
  await pastikanMaju(tx, 'purchase_invoice', id, oleh)
  return isiBalik(tx, 'purchase_invoice', id, await buatJurnalBalik(tx, kepala('purchase_invoice', f, tanggal, `Batal faktur ${f.no}`, oleh)))
}

// Nilai BDBF yang ditutup retur dari bagian penerimaan yang belum difakturkan: qty itu x harga terima.
export const bdbfRetur = (qtyBelumFaktur: Parameters<typeof des>[0], hargaTerima: bigint) => keRupiah(des(qtyBelumFaktur).times(des(hargaTerima)))

async function muatRetur(tx: DbAtauTx, id: number) {
  const r = await tx.purchaseReturn.findUniqueOrThrow({ where: { id }, include: { purchaseReturnLines: { include: { goodsReceiptLine: { select: { price: true } } } } } })
  const bdbf = r.goodsReceiptId ? r.purchaseReturnLines.reduce((n, b) => n + bdbfRetur(b.qtyUninvoiced, b.goodsReceiptLine?.price ?? 0n), 0n) : 0n
  return { r, bdbf }
}

// --- Retur Pembelian: kredit Persediaan (nilai keluar), debit BDBF (bagian belum difakturkan) dan Hutang (nota debit) ---
export async function jurnalRetur(tx: Tx, id: number, oleh: number | null) {
  const { r, bdbf } = await muatRetur(tx, id)
  const memo = `Retur pembelian ${r.no}`
  const p = await persediaan(tx, 'purchase_return', id, false, memo)
  const baris: BarisJurnal[] = [
    ...p.baris,
    { akun: 'grni', debit: bdbf, memo, supplierId: r.supplierId },
    { akun: 'hutang_usaha', debit: r.debitNoteAmount, memo, supplierId: r.supplierId },
  ]
  return buatJurnal(tx, kepala('purchase_return', r, r.date, memo, oleh), tutupSelisih(baris, memo))
}

export async function balikJurnalRetur(tx: Tx, id: number, tanggal: Date, oleh: number | null) {
  const { r, bdbf } = await muatRetur(tx, id)
  await pastikanMaju(tx, 'purchase_return', id, oleh)
  const memo = `Batal retur pembelian ${r.no}`
  const p = await persediaan(tx, 'purchase_return', id, true, memo)
  const baris: BarisJurnal[] = [
    ...p.baris,
    { akun: 'grni', kredit: bdbf, memo, supplierId: r.supplierId },
    { akun: 'hutang_usaha', kredit: r.debitNoteAmount, memo, supplierId: r.supplierId },
  ]
  return isiBalik(tx, 'purchase_return', id, await buatJurnalBalik(tx, kepala('purchase_return', r, tanggal, memo, oleh), tutupSelisih(baris, memo)))
}

// --- Pembelian Langsung: debit Persediaan (gerak) dan beban (sisa: baris hanya biaya), kredit Kas/Bank atau Hutang ---
function lawanLangsung(dl: { payMode: string; bankAccountId: number | null; supplierId: number }) {
  return dl.payMode === 'tunai' ? { akun: kunciKasBank(dl.bankAccountId), supplierId: null, bankAccountId: dl.bankAccountId } : { akun: 'hutang_usaha', supplierId: dl.supplierId, bankAccountId: null }
}

export async function jurnalLangsung(tx: Tx, id: number, oleh: number | null) {
  const dl = await tx.directPurchase.findUniqueOrThrow({ where: { id } })
  const memo = `Pembelian langsung ${dl.no}${dl.supplierInvoiceNo ? ` (${dl.supplierInvoiceNo})` : ''}`
  const p = await persediaan(tx, 'direct_purchase', id, false, memo)
  if (p.bersih > dl.total) throw new GalatAturan(`Nilai persediaan ${dl.no} melebihi totalnya.`)
  return buatJurnal(tx, kepala('direct_purchase', dl, dl.date, memo, oleh), [...p.baris, dk('beban_beli', dl.total - p.bersih, memo), { ...lawanLangsung(dl), kredit: dl.total, memo }])
}

export async function balikJurnalLangsung(tx: Tx, id: number, tanggal: Date, oleh: number | null) {
  const dl = await tx.directPurchase.findUniqueOrThrow({ where: { id } })
  await pastikanMaju(tx, 'direct_purchase', id, oleh)
  const memo = `Batal pembelian langsung ${dl.no}`
  const maju = await persediaan(tx, 'direct_purchase', id, false, memo)
  const p = await persediaan(tx, 'direct_purchase', id, true, memo)
  const baris: BarisJurnal[] = [...p.baris, { akun: 'beban_beli', kredit: dl.total - maju.bersih, memo }, { ...lawanLangsung(dl), debit: dl.total, memo }]
  return isiBalik(tx, 'direct_purchase', id, await buatJurnalBalik(tx, kepala('direct_purchase', dl, tanggal, memo, oleh), tutupSelisih(baris, memo)))
}

// --- Pembayaran Pembelian: debit Hutang (alokasi tagihan), kredit Hutang (nota debit dipakai), kredit Kas/Bank ---
export async function jurnalPembayaran(tx: Tx, id: number, oleh: number | null) {
  const b = await tx.purchasePayment.findUniqueOrThrow({ where: { id }, include: { purchasePaymentAllocs: true } })
  const memo = `Bayar ${b.no}`
  const tagihan = b.purchasePaymentAllocs.filter((a) => !a.purchaseReturnId).reduce((n, a) => n + a.amount, 0n)
  const nota = b.purchasePaymentAllocs.filter((a) => a.purchaseReturnId).reduce((n, a) => n + a.amount, 0n)
  return buatJurnal(tx, kepala('purchase_payment', b, b.date, memo, oleh), [
    { akun: 'hutang_usaha', debit: tagihan, memo, supplierId: b.supplierId },
    { akun: 'hutang_usaha', kredit: nota, memo, supplierId: b.supplierId },
    { akun: kunciKasBank(b.bankAccountId), kredit: b.amount, memo, bankAccountId: b.bankAccountId },
  ])
}

export async function balikJurnalPembayaran(tx: Tx, id: number, tanggal: Date, oleh: number | null) {
  const b = await tx.purchasePayment.findUniqueOrThrow({ where: { id } })
  await pastikanMaju(tx, 'purchase_payment', id, oleh)
  return isiBalik(tx, 'purchase_payment', id, await buatJurnalBalik(tx, kepala('purchase_payment', b, tanggal, `Batal pembayaran ${b.no}`, oleh)))
}

export const JURNAL_BELI: Record<JenisBeliJurnal, (tx: Tx, id: number, oleh: number | null) => Promise<HasilJurnal | null>> = {
  goods_receipt: jurnalPenerimaan,
  purchase_invoice: jurnalFaktur,
  purchase_return: jurnalRetur,
  direct_purchase: jurnalLangsung,
  purchase_payment: jurnalPembayaran,
}

export const BALIK_JURNAL_BELI: Record<JenisBeliJurnal, (tx: Tx, id: number, tanggal: Date, oleh: number | null) => Promise<HasilJurnal | null>> = {
  goods_receipt: balikJurnalPenerimaan,
  purchase_invoice: balikJurnalFaktur,
  purchase_return: balikJurnalRetur,
  direct_purchase: balikJurnalLangsung,
  purchase_payment: balikJurnalPembayaran,
}

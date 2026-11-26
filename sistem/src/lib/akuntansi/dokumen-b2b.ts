// Jurnal otomatis dokumen penjualan B2B (tahap 6B, KONTRAK 11 butir 96 dan 14.3). Dipanggil di transaksi yang sama dengan
// posting atau pembatalan dokumennya lewat kait di src/lib/b2b, dan dipakai skrip bentuk ulang untuk dokumen yang
// diposting sebelum jurnal B2B ada. Nilai persediaan dibaca dari stock_ledger dokumen itu, jadi persediaan buku tetap
// sama dengan stok. Piutang Usaha memakai pemetaan piutang_usaha dan setiap barisnya membawa customer_id, sehingga
// saldonya sama dengan halaman Piutang Pelanggan. Tanpa impor Next.
import type { DbAtauTx, Tx } from '../db'
import { barisDariGerak } from './dokumen'
import { buatJurnal, buatJurnalBalik, dk, jurnalMaju, pastikanPeriodeTerbuka, type BarisJurnal, type HasilJurnal } from './jurnal'
import { kunciBank } from './pemetaan'

const PIUTANG = 'piutang_usaha'

const piutang = (customerId: number, nilai: bigint, memo: string): BarisJurnal => (nilai >= 0n ? { akun: PIUTANG, debit: nilai, customerId, memo } : { akun: PIUTANG, kredit: -nilai, customerId, memo })

// Kebalikan baris non stok (debit jadi kredit).
const dibalik = (baris: BarisJurnal[]) => baris.map((b) => ({ ...b, debit: b.kredit, kredit: b.debit }))

// --- Faktur Penjualan: debit Piutang Usaha sebesar total, kredit Penjualan B2B sebesar subtotal; HPP dari gerak keluar ---

async function barisFaktur(tx: DbAtauTx, id: number, memo: string) {
  const f = await tx.salesInvoice.findUniqueOrThrow({ where: { id }, select: { no: true, date: true, customerId: true, subtotal: true, tax: true, total: true } })
  // PPN keluaran tidak dipakai selama tidak PKP (RANCANGAN 11.2 butir 6), jadi tax selalu 0 dan total = subtotal.
  return { f, baris: [piutang(f.customerId, f.total, memo), dk('penjualan_b2b', -f.subtotal, memo)] }
}

export async function jurnalFakturJual(tx: Tx, id: number, oleh: number | null): Promise<HasilJurnal | null> {
  const no = (await tx.salesInvoice.findUniqueOrThrow({ where: { id }, select: { no: true } })).no
  const memo = `Faktur penjualan ${no}`
  const { f, baris } = await barisFaktur(tx, id, memo)
  baris.push(...(await barisDariGerak(tx, 'sales_invoice', id, { lawan: 'hpp', memo })))
  return buatJurnal(tx, { docType: 'sales_invoice', docId: id, docNo: f.no, tanggal: f.date, memo, oleh }, baris)
}

// Pembatalan faktur Diposting: pendapatan dan piutang dibalik persis, HPP dibalik dari gerak balik stok.
export async function balikJurnalFakturJual(tx: Tx, id: number, tanggal: Date, oleh: number | null) {
  const f = await tx.salesInvoice.findUniqueOrThrow({ where: { id }, select: { no: true, date: true } })
  await pastikanPeriodeTerbuka(tx, f.date, `Pembatalan ${f.no}`)
  if (!(await jurnalMaju(tx, 'sales_invoice', id))) await jurnalFakturJual(tx, id, oleh)
  const memo = `Batal faktur penjualan ${f.no}`
  const { baris } = await barisFaktur(tx, id, memo)
  const isi = [...dibalik(baris), ...(await barisDariGerak(tx, 'sales_invoice', id, { lawan: 'hpp', balik: true, memo }))]
  const b = await buatJurnalBalik(tx, { docType: 'sales_invoice', docId: id, docNo: f.no, tanggal, memo, oleh }, isi)
  if (b) await tx.salesInvoice.update({ where: { id }, data: { reversalJournalId: b.id } })
  return b
}

// --- Penerimaan Pelanggan: debit Kas Besar atau Bank sebesar uang masuk, debit Piutang Usaha sebesar nota kredit yang
// dipakai (saling hapus dengan kredit retur), kredit Piutang Usaha sebesar alokasi faktur ---

export async function jurnalTerimaPelanggan(tx: Tx, id: number, oleh: number | null): Promise<HasilJurnal | null> {
  const t = await tx.customerPayment.findUniqueOrThrow({ where: { id }, include: { customerPaymentAllocs: true } })
  const memo = `Penerimaan pelanggan ${t.no}`
  const tagihan = t.customerPaymentAllocs.filter((a) => a.salesInvoiceId).reduce((n, a) => n + a.amount, 0n)
  const kredit = t.customerPaymentAllocs.filter((a) => a.salesReturnId).reduce((n, a) => n + a.amount, 0n)
  const tujuan = t.bankAccountId ? kunciBank(t.bankAccountId) : 'kas_besar'
  return buatJurnal(tx, { docType: 'customer_payment', docId: id, docNo: t.no, tanggal: t.date, memo, oleh }, [
    dk(tujuan, t.amount, memo),
    piutang(t.customerId, kredit, memo),
    piutang(t.customerId, -tagihan, memo),
  ])
}

export async function balikJurnalTerimaPelanggan(tx: Tx, id: number, tanggal: Date, oleh: number | null) {
  const t = await tx.customerPayment.findUniqueOrThrow({ where: { id }, select: { no: true } })
  if (!(await jurnalMaju(tx, 'customer_payment', id))) await jurnalTerimaPelanggan(tx, id, oleh)
  const b = await buatJurnalBalik(tx, { docType: 'customer_payment', docId: id, docNo: t.no, tanggal, memo: `Batal penerimaan pelanggan ${t.no}`, oleh })
  if (b) await tx.customerPayment.update({ where: { id }, data: { reversalJournalId: b.id } })
  return b
}

// --- Retur Penjualan: debit Retur Penjualan, kredit Piutang Usaha sebesar nota kredit; persediaan masuk lawan HPP ---

async function barisRetur(tx: DbAtauTx, id: number, memo: string) {
  const r = await tx.salesReturn.findUniqueOrThrow({ where: { id }, select: { no: true, date: true, customerId: true, total: true } })
  return { r, baris: [dk('retur_penjualan', r.total, memo), piutang(r.customerId, -r.total, memo)] }
}

export async function jurnalReturJual(tx: Tx, id: number, oleh: number | null): Promise<HasilJurnal | null> {
  const no = (await tx.salesReturn.findUniqueOrThrow({ where: { id }, select: { no: true } })).no
  const memo = `Retur penjualan ${no}`
  const { r, baris } = await barisRetur(tx, id, memo)
  baris.push(...(await barisDariGerak(tx, 'sales_return', id, { lawan: 'hpp', memo })))
  return buatJurnal(tx, { docType: 'sales_return', docId: id, docNo: r.no, tanggal: r.date, memo, oleh }, baris)
}

export async function balikJurnalReturJual(tx: Tx, id: number, tanggal: Date, oleh: number | null) {
  const r = await tx.salesReturn.findUniqueOrThrow({ where: { id }, select: { no: true, date: true } })
  await pastikanPeriodeTerbuka(tx, r.date, `Pembatalan ${r.no}`)
  if (!(await jurnalMaju(tx, 'sales_return', id))) await jurnalReturJual(tx, id, oleh)
  const memo = `Batal retur penjualan ${r.no}`
  const { baris } = await barisRetur(tx, id, memo)
  const isi = [...dibalik(baris), ...(await barisDariGerak(tx, 'sales_return', id, { lawan: 'hpp', balik: true, memo }))]
  const b = await buatJurnalBalik(tx, { docType: 'sales_return', docId: id, docNo: r.no, tanggal, memo, oleh }, isi)
  if (b) await tx.salesReturn.update({ where: { id }, data: { reversalJournalId: b.id } })
  return b
}

// --- Pencocokan piutang: saldo akun piutang_usaha di buku besar lawan halaman Piutang Pelanggan ---

export async function saldoPiutangBuku(db: DbAtauTx) {
  const [r] = await db.$queryRaw<{ saldo: bigint | null }[]>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0)::bigint AS saldo
    FROM journal_line l JOIN journal j ON j.id = l.journal_id
    WHERE j.posted_at IS NOT NULL AND l.account_id IN (SELECT account_id FROM account_mapping WHERE key = ${PIUTANG})`
  return BigInt(r?.saldo ?? 0)
}

// Saldo piutang per pelanggan di buku (baris jurnal ber-customer_id), untuk pencocokan per pelanggan.
export async function piutangBukuPerPelanggan(db: DbAtauTx) {
  const baris = await db.$queryRaw<{ customer_id: number; saldo: bigint }[]>`
    SELECT l.customer_id, SUM(l.debit - l.credit)::bigint AS saldo
    FROM journal_line l JOIN journal j ON j.id = l.journal_id
    WHERE j.posted_at IS NOT NULL AND l.customer_id IS NOT NULL AND l.account_id IN (SELECT account_id FROM account_mapping WHERE key = ${PIUTANG})
    GROUP BY 1`
  return new Map(baris.map((b) => [b.customer_id, BigInt(b.saldo)]))
}

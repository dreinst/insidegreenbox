// Bentuk ulang jurnal penjualan B2B (tahap 6B) untuk dokumen yang diposting sebelum jurnal B2B disambungkan, dan
// pencocokan Piutang Usaha di buku dengan halaman Piutang Pelanggan. Dipanggil dari bentukUlangJurnal. Tanpa impor Next.
import { Prisma } from '@/generated/prisma/client'
import { piutangPelanggan } from '../b2b/piutang'
import { hutangPemasok } from '../beli/hutang'
import type { Db, Tx } from '../db'
import { balikJurnalFakturJual, balikJurnalReturJual, balikJurnalTerimaPelanggan, jurnalFakturJual, jurnalReturJual, jurnalTerimaPelanggan, piutangBukuPerPelanggan, saldoPiutangBuku } from './dokumen-b2b'
import { tanggalJurnal, type HasilJurnal } from './jurnal'

// Jenis dokumen B2B yang menggerakkan stok; jurnalnya dibentuk modul ini, jadi tidak dilaporkan "belum didukung".
export const DOK_B2B_STOK = ['sales_invoice', 'sales_return']

type Jalan = (kelompok: string, dok: string, f: (tx: Tx) => Promise<HasilJurnal | null>) => Promise<void>
type Fungsi = { maju: (tx: Tx, id: number, oleh: number | null) => Promise<HasilJurnal | null>; balik: (tx: Tx, id: number, tanggal: Date, oleh: number | null) => Promise<HasilJurnal | null> }

const DOK: [string, string, Fungsi][] = [
  ['sales_invoice', 'faktur_jual', { maju: jurnalFakturJual, balik: balikJurnalFakturJual }],
  ['sales_return', 'retur_jual', { maju: jurnalReturJual, balik: balikJurnalReturJual }],
  ['customer_payment', 'terima_pelanggan', { maju: jurnalTerimaPelanggan, balik: balikJurnalTerimaPelanggan }],
]

const belum = (jenis: string, balik: boolean) =>
  Prisma.sql`NOT EXISTS (SELECT 1 FROM journal j WHERE j.source_type = ${jenis} AND j.source_id = x.id AND ${balik ? Prisma.sql`j.reversal_of_id IS NOT NULL` : Prisma.sql`j.reversal_of_id IS NULL`})`

export async function bentukUlangB2b(db: Db, jalan: Jalan, oleh: number | null) {
  // Jurnal maju untuk semua dokumen yang pernah Diposting (termasuk yang sudah Batal), lalu jurnal balik pembatalannya.
  for (const [tabel, kelompok, f] of DOK) {
    for (const { id } of await db.$queryRaw<{ id: number }[]>`SELECT x.id FROM ${Prisma.raw(`"${tabel}"`)} x WHERE x.posted_at IS NOT NULL AND ${belum(tabel, false)} ORDER BY x.date, x.id`)
      await jalan(kelompok, `${tabel}#${id}`, (tx) => f.maju(tx, id, oleh))
  }
  for (const [tabel, kelompok, f] of DOK) {
    for (const { id, cancelled_at } of await db.$queryRaw<{ id: number; cancelled_at: Date }[]>`
      SELECT x.id, x.cancelled_at FROM ${Prisma.raw(`"${tabel}"`)} x
      WHERE x.status = 'Batal' AND x.posted_at IS NOT NULL AND x.cancelled_at IS NOT NULL AND NOT ${belum(tabel, false)} AND ${belum(tabel, true)} ORDER BY x.id`)
      await jalan(`${kelompok}_batal`, `${tabel}#${id}`, (tx) => f.balik(tx, id, tanggalJurnal(cancelled_at), oleh))
  }
}

// Piutang Usaha di buku (semua akun yang dipetakan ke piutang_usaha) lawan saldo halaman Piutang Pelanggan (sisa faktur
// Diposting dikurangi nota kredit yang belum terpakai), total dan per pelanggan.
export async function cocokkanPiutang(db: Db) {
  const [buku, perBuku, halaman] = await Promise.all([saldoPiutangBuku(db), piutangBukuPerPelanggan(db), piutangPelanggan(db)])
  const selisih: { customerId: number; pelanggan: string; buku: bigint; halaman: bigint }[] = []
  const dilihat = new Set<number>()
  for (const p of halaman.perPelanggan) {
    dilihat.add(p.customerId)
    const b = perBuku.get(p.customerId) ?? 0n
    if (b !== p.saldo) selisih.push({ customerId: p.customerId, pelanggan: p.pelanggan, buku: b, halaman: p.saldo })
  }
  for (const [id, b] of perBuku) if (!dilihat.has(id) && b !== 0n) selisih.push({ customerId: id, pelanggan: `#${id}`, buku: b, halaman: 0n })
  // Baris Piutang Usaha tanpa pelanggan (misalnya kas atau memorial lama ke akun piutang) tidak pernah cocok per
  // pelanggan, jadi disebut terpisah (audit C-11).
  const tanpaPelanggan = buku - [...perBuku.values()].reduce((n, b) => n + b, 0n)
  return { buku, halaman: halaman.total, cocok: buku === halaman.total && !selisih.length && tanpaPelanggan === 0n, selisih, tanpaPelanggan }
}

// Hutang Usaha di buku (kredit - debit semua akun yang dipetakan ke hutang_usaha) lawan saldo halaman Hutang Pemasok,
// total dan per pemasok, plus baris tanpa pemasok (audit C-11).
export async function cocokkanHutang(db: Db) {
  const [[t], per, halaman] = await Promise.all([
    db.$queryRaw<{ saldo: bigint | null }[]>`
      SELECT COALESCE(SUM(l.credit - l.debit), 0)::bigint AS saldo FROM journal_line l JOIN journal j ON j.id = l.journal_id
      WHERE j.posted_at IS NOT NULL AND l.account_id IN (SELECT account_id FROM account_mapping WHERE key = 'hutang_usaha')`,
    db.$queryRaw<{ supplier_id: number; saldo: bigint }[]>`
      SELECT l.supplier_id, SUM(l.credit - l.debit)::bigint AS saldo FROM journal_line l JOIN journal j ON j.id = l.journal_id
      WHERE j.posted_at IS NOT NULL AND l.supplier_id IS NOT NULL AND l.account_id IN (SELECT account_id FROM account_mapping WHERE key = 'hutang_usaha')
      GROUP BY 1`,
    hutangPemasok(db),
  ])
  const buku = BigInt(t?.saldo ?? 0)
  const perBuku = new Map(per.map((b) => [b.supplier_id, BigInt(b.saldo)]))
  const selisih: { supplierId: number; pemasok: string; buku: bigint; halaman: bigint }[] = []
  const dilihat = new Set<number>()
  for (const p of halaman.perPemasok) {
    dilihat.add(p.supplierId)
    const b = perBuku.get(p.supplierId) ?? 0n
    if (b !== p.saldo) selisih.push({ supplierId: p.supplierId, pemasok: p.pemasok, buku: b, halaman: p.saldo })
  }
  for (const [id, b] of perBuku) if (!dilihat.has(id) && b !== 0n) selisih.push({ supplierId: id, pemasok: `#${id}`, buku: b, halaman: 0n })
  const tanpaPemasok = buku - [...perBuku.values()].reduce((n, b) => n + b, 0n)
  return { buku, halaman: halaman.total, cocok: buku === halaman.total && !selisih.length && tanpaPemasok === 0n, selisih, tanpaPemasok }
}

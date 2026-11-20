// Bentuk ulang jurnal untuk dokumen lama yang sudah berlaku tetapi belum punya jurnal (janji KONTRAK 11 butir 14, 36,
// 43, 57, dan 71 untuk dokumen pembelian sejak tahap 5C). Idempoten: dokumen yang sudah punya jurnal dilewati. Setiap dokumen di transaksinya sendiri, jadi satu
// dokumen yang gagal (misalnya periodenya sudah ditutup) tidak menggagalkan yang lain. Tanpa impor Next.
import { Prisma } from '@/generated/prisma/client'
import { GalatAturan } from '../aksi'
import type { Db, Tx } from '../db'
import {
  DOK_STOK_JURNAL,
  balikJurnalDokStok,
  balikJurnalPenjualan,
  balikJurnalSetoran,
  jurnalDokStok,
  jurnalKasLaci,
  jurnalPenjualan,
  jurnalSelisihShift,
  jurnalSetoran,
  jurnalTutupPerintah,
  type JenisStokJurnal,
} from './dokumen'
import { BALIK_JURNAL_BELI, DOK_BELI_JURNAL, JURNAL_BELI } from './beli'
import { tanggalJurnal, type HasilJurnal } from './jurnal'
import { cocokkanPersediaan } from './laporan'
import { pasangBawaanAkuntansi } from './pemetaan'

export type Rekap = { dibuat: number; kosong: number; gagal: { dok: string; pesan: string }[] }
export type HasilBentukUlang = { per: Record<string, Rekap>; belumDidukung: { docType: string; dokumen: number }[]; persediaan: Awaited<ReturnType<typeof cocokkanPersediaan>>; pemetaanBaru: number }

const BELUM = (jenis: string, balik = false) =>
  Prisma.sql`NOT EXISTS (SELECT 1 FROM journal j WHERE j.source_type = ${jenis} AND j.source_id = x.id AND ${balik ? Prisma.sql`j.reversal_of_id IS NOT NULL` : Prisma.sql`j.reversal_of_id IS NULL`})`
const ADA_MAJU = (jenis: string) => Prisma.sql`EXISTS (SELECT 1 FROM journal j WHERE j.source_type = ${jenis} AND j.source_id = x.id AND j.reversal_of_id IS NULL)`

export async function bentukUlangJurnal(db: Db, opsi: { oleh?: number | null; log?: (s: string) => void } = {}): Promise<HasilBentukUlang> {
  const oleh = opsi.oleh ?? null
  const per: Record<string, Rekap> = {}
  const jalan = async (kelompok: string, dok: string, f: (tx: Tx) => Promise<HasilJurnal | null>) => {
    const r = (per[kelompok] ??= { dibuat: 0, kosong: 0, gagal: [] })
    try {
      const h = await db.$transaction(f, { timeout: 30_000 })
      if (h) r.dibuat++
      else r.kosong++
    } catch (e) {
      r.gagal.push({ dok, pesan: e instanceof GalatAturan ? e.message : e instanceof Error ? e.message.slice(0, 200) : String(e) })
    }
  }
  const pemetaanBaru = await pasangBawaanAkuntansi(db)

  // Penjualan (semua status), lalu jurnal balik penjualan void.
  for (const { id } of await db.$queryRaw<{ id: number }[]>`SELECT x.id FROM sale x WHERE ${BELUM('sale')} ORDER BY x.id`) await jalan('penjualan', `sale#${id}`, (tx) => jurnalPenjualan(tx, id, oleh))
  for (const { id, void_at } of await db.$queryRaw<{ id: number; void_at: Date }[]>`
    SELECT x.id, x.void_at FROM sale x WHERE x.status = 'Void' AND x.void_at IS NOT NULL AND ${ADA_MAJU('sale')} AND ${BELUM('sale', true)} ORDER BY x.id`)
    await jalan('void', `sale#${id}`, (tx) => balikJurnalPenjualan(tx, id, tanggalJurnal(void_at), oleh))

  // Selisih kas shift dan kas laci.
  for (const { id } of await db.$queryRaw<{ id: number }[]>`SELECT x.id FROM shift x WHERE x.closed_at IS NOT NULL AND COALESCE(x.cash_diff, 0) <> 0 AND ${BELUM('shift')} ORDER BY x.id`)
    await jalan('selisih_kas', `shift#${id}`, (tx) => jurnalSelisihShift(tx, id, oleh))
  for (const { id } of await db.$queryRaw<{ id: number }[]>`SELECT x.id FROM shift_cash_move x WHERE ${BELUM('shift_cash_move')} ORDER BY x.id`) await jalan('kas_laci', `shift_cash_move#${id}`, (tx) => jurnalKasLaci(tx, id, oleh))

  // Setoran yang pernah Diposting, lalu jurnal balik setoran yang dibatalkan sesudah Diposting.
  for (const { id } of await db.$queryRaw<{ id: number }[]>`SELECT x.id FROM pos_settlement x WHERE x.posted_at IS NOT NULL AND ${BELUM('pos_settlement')} ORDER BY x.id`)
    await jalan('setoran', `pos_settlement#${id}`, (tx) => jurnalSetoran(tx, id, oleh))
  for (const { id, cancelled_at } of await db.$queryRaw<{ id: number; cancelled_at: Date }[]>`
    SELECT x.id, x.cancelled_at FROM pos_settlement x WHERE x.status = 'Batal' AND x.posted_at IS NOT NULL AND x.cancelled_at IS NOT NULL AND ${ADA_MAJU('pos_settlement')} AND ${BELUM('pos_settlement', true)} ORDER BY x.id`)
    await jalan('setoran_batal', `pos_settlement#${id}`, (tx) => balikJurnalSetoran(tx, id, tanggalJurnal(cancelled_at), oleh))

  // Dokumen stok dari ledger: gerak asal, lalu gerak balik (tanggal gerak balik = hari pembatalan).
  const jenisStok = Prisma.join(DOK_STOK_JURNAL.map((j) => Prisma.sql`${j}`))
  for (const { doc_type, id } of await db.$queryRaw<{ doc_type: JenisStokJurnal; id: number }[]>`
    SELECT DISTINCT g.doc_type, g.doc_id AS id FROM stock_ledger g
    WHERE g.doc_type IN (${jenisStok}) AND NOT g.is_reversal
      AND NOT EXISTS (SELECT 1 FROM journal j WHERE j.source_type = g.doc_type AND j.source_id = g.doc_id AND j.reversal_of_id IS NULL)
    ORDER BY 1, 2`)
    await jalan(doc_type, `${doc_type}#${id}`, (tx) => jurnalDokStok(tx, doc_type, id, oleh))
  for (const { doc_type, id, tanggal } of await db.$queryRaw<{ doc_type: JenisStokJurnal; id: number; tanggal: Date }[]>`
    SELECT g.doc_type, g.doc_id AS id, min(g.date) AS tanggal FROM stock_ledger g
    WHERE g.doc_type IN (${jenisStok}) AND g.is_reversal
      AND EXISTS (SELECT 1 FROM journal j WHERE j.source_type = g.doc_type AND j.source_id = g.doc_id AND j.reversal_of_id IS NULL)
      AND NOT EXISTS (SELECT 1 FROM journal j WHERE j.source_type = g.doc_type AND j.source_id = g.doc_id AND j.reversal_of_id IS NOT NULL)
    GROUP BY 1, 2 ORDER BY 1, 2`)
    await jalan(`${doc_type}_batal`, `${doc_type}#${id}`, (tx) => balikJurnalDokStok(tx, doc_type, id, tanggal, oleh))

  // Perintah produksi yang ditutup manual dengan sisa barang dalam proses.
  for (const { id } of await db.$queryRaw<{ id: number }[]>`SELECT x.id FROM production_order x WHERE x.closed_at IS NOT NULL AND x.wip_writeoff <> 0 AND ${BELUM('production_order')} ORDER BY x.id`)
    await jalan('tutup_perintah', `production_order#${id}`, (tx) => jurnalTutupPerintah(tx, id, oleh))

  // tahap 5C: dokumen pembelian yang pernah Diposting (posted_at terisi), lalu jurnal balik yang dibatalkan sesudahnya
  // (bertanggal hari pembatalan). Urutan jenis mengikuti alur: penerimaan, faktur, retur, pembelian langsung, pembayaran.
  for (const jenis of DOK_BELI_JURNAL) {
    const tabel = Prisma.raw(`"${jenis}"`)
    for (const { id } of await db.$queryRaw<{ id: number }[]>`SELECT x.id FROM ${tabel} x WHERE x.posted_at IS NOT NULL AND ${BELUM(jenis)} ORDER BY x.date, x.id`)
      await jalan(jenis, `${jenis}#${id}`, (tx) => JURNAL_BELI[jenis](tx, id, oleh))
  }
  for (const jenis of DOK_BELI_JURNAL) {
    const tabel = Prisma.raw(`"${jenis}"`)
    for (const { id, cancelled_at } of await db.$queryRaw<{ id: number; cancelled_at: Date }[]>`
      SELECT x.id, x.cancelled_at FROM ${tabel} x WHERE x.status = 'Batal' AND x.posted_at IS NOT NULL AND x.cancelled_at IS NOT NULL AND ${ADA_MAJU(jenis)} AND ${BELUM(jenis, true)} ORDER BY x.id`)
      await jalan(`${jenis}_batal`, `${jenis}#${id}`, (tx) => BALIK_JURNAL_BELI[jenis](tx, id, tanggalJurnal(cancelled_at), oleh))
  }

  // Gerak stok dari dokumen yang jurnalnya belum disambungkan.
  const jenisBeli = Prisma.join(DOK_BELI_JURNAL.map((j) => Prisma.sql`${j}`))
  const belumDidukung = (
    await db.$queryRaw<{ doc_type: string; n: bigint }[]>`
      SELECT doc_type, COUNT(DISTINCT doc_id)::bigint AS n FROM stock_ledger WHERE doc_type NOT IN (${jenisStok}, ${jenisBeli}, 'sale') GROUP BY 1 ORDER BY 1`
  ).map((b) => ({ docType: b.doc_type, dokumen: Number(b.n) }))
  const persediaan = await cocokkanPersediaan(db)
  opsi.log?.(`Selesai: ${Object.entries(per).map(([k, r]) => `${k} ${r.dibuat}`).join(', ') || 'tidak ada yang perlu dibentuk'}`)
  return { per, belumDidukung, persediaan, pemetaanBaru }
}

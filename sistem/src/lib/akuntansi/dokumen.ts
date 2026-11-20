// Jurnal otomatis dari dokumen sumber (KONTRAK 14.3). Setiap fungsi dipanggil di transaksi yang sama dengan posting
// atau pembatalan dokumennya, dan juga dipakai skrip bentuk ulang untuk dokumen lama. Nilai persediaan selalu dibaca
// dari stock_ledger dokumen itu, sehingga saldo akun persediaan sama dengan nilai stock_balance. Tanpa impor Next.
import { GalatAturan } from '../aksi'
import type { DbAtauTx, Tx } from '../db'
import { buatJurnal, buatJurnalBalik, dk, jurnalMaju, pastikanPeriodeTerbuka, tanggalJurnal, type BarisJurnal, type HasilJurnal, type KunciAkun } from './jurnal'
import { kunciAlasan, kunciBank, kunciKliring, kunciPersediaan, pembacaAkun } from './pemetaan'

// Jenis dokumen stok yang jurnalnya dibentuk dari stock_ledger (nama tabel, sama dengan doc_type ledger).
export const DOK_STOK_JURNAL = ['stock_adjustment', 'stock_opname', 'stock_transfer', 'material_issue', 'production_result', 'quick_production'] as const
export type JenisStokJurnal = (typeof DOK_STOK_JURNAL)[number]

const NAMA_DOK: Record<string, string> = {
  sale: 'Penjualan',
  shift: 'Selisih kas shift',
  shift_cash_move: 'Kas laci',
  pos_settlement: 'Setoran POS',
  stock_adjustment: 'Penyesuaian stok',
  stock_opname: 'Stock opname',
  stock_transfer: 'Pindah stok',
  material_issue: 'Pengeluaran bahan',
  production_result: 'Hasil produksi',
  quick_production: 'Produksi cepat',
  production_order: 'Tutup perintah produksi',
  memorial: 'Jurnal memorial',
  // tahap 6B
  sales_invoice: 'Faktur penjualan',
  customer_payment: 'Penerimaan pelanggan',
  sales_return: 'Retur penjualan',
}
export const namaSumber = (t: string) => NAMA_DOK[t] ?? t

type BarisLedger = { location_id: number; line_id: number | null; value: bigint }

const ledgerDok = (tx: DbAtauTx, docType: string, docId: number, balik: boolean) =>
  tx.$queryRaw<BarisLedger[]>`SELECT location_id, line_id, value FROM stock_ledger WHERE doc_type = ${docType} AND doc_id = ${docId} AND is_reversal = ${balik} ORDER BY id`

// Baris persediaan dari gerak stok: setiap gerak mendebit (masuk) atau mengkredit (keluar) akun persediaan lokasinya,
// dan lawannya ke akun yang ditentukan per gerak. Lawan null berarti tidak ada lawan per gerak (dipakai bila lawannya
// adalah sisa seluruh dokumen, misalnya produksi cepat dan pindah stok).
function barisPersediaan(gerak: BarisLedger[], lawan: ((g: BarisLedger) => KunciAkun) | null, memo: string): BarisJurnal[] {
  const hasil: BarisJurnal[] = []
  for (const g of gerak) {
    const v = BigInt(g.value)
    if (v === 0n) continue
    hasil.push(dk(kunciPersediaan(g.location_id), v, memo))
    if (lawan) hasil.push(dk(lawan(g), -v, memo))
  }
  return hasil
}

// Untuk modul lain (misalnya pembelian): baris jurnal persediaan dari gerak stok sebuah dokumen, dengan satu lawan untuk
// semua gerak atau lawan per baris dokumen (line_id). balik: pakai gerak balik (pembatalan). Contoh di KONTRAK 14.2.
export async function barisDariGerak(tx: DbAtauTx, docType: string, docId: number, opsi: { lawan: KunciAkun | ((lineId: number | null) => KunciAkun); balik?: boolean; memo?: string }) {
  const gerak = await ledgerDok(tx, docType, docId, opsi.balik ?? false)
  const lawan = opsi.lawan
  return barisPersediaan(gerak, (g) => (typeof lawan === 'function' ? lawan(g.line_id) : lawan), opsi.memo ?? '')
}

// Lawan gerak stok per jenis dokumen (KONTRAK 11 butir 36 dan 57).
async function lawanStok(tx: DbAtauTx, jenis: JenisStokJurnal, docId: number): Promise<{ lawan: ((g: BarisLedger) => KunciAkun) | null; sisa: KunciAkun | null }> {
  if (jenis === 'stock_adjustment' || jenis === 'stock_opname') {
    const baris =
      jenis === 'stock_adjustment'
        ? await tx.stockAdjustmentLine.findMany({ where: { stockAdjustmentId: docId }, select: { id: true, reason: { select: { id: true, code: true } } } })
        : await tx.stockOpnameLine.findMany({ where: { stockOpnameId: docId }, select: { id: true, reason: { select: { id: true, code: true } } } })
    const alasan = new Map(baris.map((b) => [b.id, b.reason]))
    return { lawan: (g) => kunciAlasan(g.line_id ? (alasan.get(g.line_id) ?? null) : null), sisa: null }
  }
  if (jenis === 'material_issue' || jenis === 'production_result') return { lawan: () => 'bdp', sisa: null }
  // Produksi cepat: bahan keluar dan hasil masuk tetap tampil bruto; sisanya (biaya tambahan) ke Biaya Produksi
  // Dibebankan. Pindah stok: tanpa lawan, dan tanpa jurnal bila akun persediaan asal dan tujuan sama.
  if (jenis === 'quick_production') return { lawan: null, sisa: 'biaya_produksi' }
  return { lawan: null, sisa: null }
}

async function barisStok(tx: DbAtauTx, jenis: JenisStokJurnal, docId: number, balik: boolean, memo: string) {
  const gerak = await ledgerDok(tx, jenis, docId, balik)
  const { lawan, sisa } = await lawanStok(tx, jenis, docId)
  const baris = barisPersediaan(gerak, lawan, memo)
  if (sisa) {
    const bersih = gerak.reduce((n, g) => n + BigInt(g.value), 0n)
    if (bersih !== 0n) baris.push(dk(sisa, -bersih, memo))
  }
  return baris
}

// Kepala dokumen stok: nomor dan tanggal dokumen.
async function kepalaStok(tx: DbAtauTx, jenis: JenisStokJurnal, id: number): Promise<{ no: string; date: Date } | null> {
  const pilih = { select: { no: true, date: true }, where: { id } }
  switch (jenis) {
    case 'stock_adjustment':
      return tx.stockAdjustment.findUnique(pilih)
    case 'stock_opname':
      return tx.stockOpname.findUnique(pilih)
    case 'stock_transfer':
      return tx.stockTransfer.findUnique(pilih)
    case 'material_issue':
      return tx.materialIssue.findUnique(pilih)
    case 'production_result':
      return tx.productionResult.findUnique(pilih)
    case 'quick_production':
      return tx.quickProduction.findUnique(pilih)
  }
}

// Pindah stok antar lokasi yang akun persediaannya sama tidak dijurnal: semua akun bernilai bersih 0.
async function semuaNetNol(tx: DbAtauTx, baris: BarisJurnal[]) {
  const akun = pembacaAkun(tx)
  const net = new Map<number, bigint>()
  for (const b of baris) {
    const a = await akun(b.akun)
    net.set(a.id, (net.get(a.id) ?? 0n) + (b.debit ?? 0n) - (b.kredit ?? 0n))
  }
  return [...net.values()].every((v) => v === 0n)
}

// Jurnal posting dokumen stok. Dipanggil sesudah gerak stok ditulis.
export async function jurnalDokStok(tx: Tx, jenis: JenisStokJurnal, id: number, oleh: number | null): Promise<HasilJurnal | null> {
  const d = await kepalaStok(tx, jenis, id)
  if (!d) throw new GalatAturan('Dokumen stok tidak ditemukan.')
  await pastikanPeriodeTerbuka(tx, d.date)
  const memo = `${namaSumber(jenis)} ${d.no}`
  const baris = await barisStok(tx, jenis, id, false, memo)
  if (jenis === 'stock_transfer' && (await semuaNetNol(tx, baris))) return null
  return buatJurnal(tx, { docType: jenis, docId: id, docNo: d.no, tanggal: d.date, memo, oleh }, baris)
}

// Jurnal balik pembatalan dokumen stok Diposting. Dipanggil sesudah balikDokumen. Barisnya dibentuk dari gerak balik
// (nilainya bisa sedikit berbeda dari gerak asal, KONTRAK 11 butir 32), jadi akun persediaan tetap sama dengan stok.
// Dokumen lama yang belum punya jurnal maju dibentukkan dulu jurnal majunya.
export async function balikJurnalDokStok(tx: Tx, jenis: JenisStokJurnal, id: number, tanggal: Date, oleh: number | null) {
  const d = await kepalaStok(tx, jenis, id)
  if (!d) throw new GalatAturan('Dokumen stok tidak ditemukan.')
  await pastikanPeriodeTerbuka(tx, d.date, `Pembatalan ${d.no}`)
  await pastikanPeriodeTerbuka(tx, tanggal, `Pembatalan ${d.no}`)
  if (!(await jurnalMaju(tx, jenis, id))) await jurnalDokStok(tx, jenis, id, oleh)
  const memo = `Batal ${namaSumber(jenis).toLowerCase()} ${d.no}`
  const baris = await barisStok(tx, jenis, id, true, memo)
  const balik = await buatJurnalBalik(tx, { docType: jenis, docId: id, docNo: d.no, tanggal, memo, oleh }, baris)
  if (balik) await tx.$executeRawUnsafe(`UPDATE "${jenis}" SET reversal_journal_id = $1 WHERE id = $2`, balik.id, id)
  return balik
}

// --- Penjualan kasir (RANCANGAN 6.1) ---

async function barisPendapatan(tx: DbAtauTx, saleId: number, memo: string) {
  const s = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { salePayments: { include: { paymentMethod: { select: { kind: true } } } } } })
  const baris: BarisJurnal[] = []
  for (const p of s.salePayments) baris.push(dk(p.paymentMethod.kind === 'tunai' ? 'kas_laci' : kunciKliring(p.paymentMethodId), p.amount, memo))
  baris.push(dk('potongan_penjualan', s.disc, memo), dk('penjualan', -s.sub, memo), dk('pendapatan_service', -s.svc, memo), dk('pajak_pb1', -s.tax, memo))
  return { s, baris }
}

// Jurnal penjualan: debit Kas Laci atau Piutang Kliring per metode dan Potongan Penjualan, kredit Penjualan,
// Pendapatan Service, dan Pajak PB1; ditambah debit HPP kredit Persediaan dari gerak stok penjualan itu.
export async function jurnalPenjualan(tx: Tx, saleId: number, oleh: number | null) {
  const { s, baris } = await barisPendapatan(tx, saleId, '')
  const memo = `Penjualan ${s.no}`
  for (const b of baris) b.memo = memo
  baris.push(...barisPersediaan(await ledgerDok(tx, 'sale', saleId, false), () => 'hpp', memo))
  return buatJurnal(tx, { docType: 'sale', docId: saleId, docNo: s.no, tanggal: tanggalJurnal(s.at), memo, oleh }, baris)
}

// Void: pendapatan dibalik persis, HPP dibalik dari gerak balik stok, bertanggal hari void.
export async function balikJurnalPenjualan(tx: Tx, saleId: number, tanggal: Date, oleh: number | null) {
  const s = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, select: { no: true } })
  if (!(await jurnalMaju(tx, 'sale', saleId))) await jurnalPenjualan(tx, saleId, oleh)
  const memo = `Void ${s.no}`
  const { baris } = await barisPendapatan(tx, saleId, memo)
  const balik: BarisJurnal[] = baris.map((b) => ({ ...b, debit: b.kredit, kredit: b.debit }))
  balik.push(...barisPersediaan(await ledgerDok(tx, 'sale', saleId, true), () => 'hpp', memo))
  return buatJurnalBalik(tx, { docType: 'sale', docId: saleId, docNo: s.no, tanggal, memo, oleh }, balik)
}

// --- Shift kasir ---

// Selisih kas saat tutup shift (RANCANGAN 6.1): kurang = debit Selisih Kas, kredit Kas Laci; lebih sebaliknya.
export async function jurnalSelisihShift(tx: Tx, shiftId: number, oleh: number | null) {
  const s = await tx.shift.findUniqueOrThrow({ where: { id: shiftId }, select: { id: true, closedAt: true, cashDiff: true } })
  if (!s.closedAt || !s.cashDiff) return null
  const memo = `Selisih kas tutup shift #${s.id}`
  return buatJurnal(tx, { docType: 'shift', docId: s.id, docNo: `Shift #${s.id}`, tanggal: tanggalJurnal(s.closedAt), memo, oleh }, [dk('kas_laci', s.cashDiff, memo), dk('selisih_kas', -s.cashDiff, memo)])
}

// Kas masuk dan keluar laci di luar penjualan, supaya saldo Kas Laci kembali 0 sesudah semua shift disetor.
export async function jurnalKasLaci(tx: Tx, moveId: number, oleh: number | null) {
  const m = await tx.shiftCashMove.findUniqueOrThrow({ where: { id: moveId } })
  const masuk = m.kind === 'masuk'
  const memo = `Kas ${masuk ? 'masuk' : 'keluar'} laci shift #${m.shiftId}: ${m.reason}`
  const nilai = masuk ? m.amount : -m.amount
  return buatJurnal(tx, { docType: 'shift_cash_move', docId: m.id, docNo: `Shift #${m.shiftId}`, tanggal: tanggalJurnal(m.at), memo, oleh }, [
    dk('kas_laci', nilai, memo),
    dk(masuk ? 'laci_masuk' : 'laci_keluar', -nilai, memo),
  ])
}

// --- Setoran POS (RANCANGAN 6.2) ---

// Tunai: debit Kas Besar atau Bank, kredit Kas Laci. Non tunai: debit Bank dan Beban MDR, kredit Piutang Kliring.
// Sisa (dana kurang atau lebih di luar MDR) ke Selisih Kas.
export async function jurnalSetoran(tx: Tx, id: number, oleh: number | null) {
  const st = await tx.posSettlement.findUniqueOrThrow({ where: { id }, include: { paymentMethod: { select: { id: true, kind: true } } } })
  const tunai = st.paymentMethod.kind === 'tunai'
  const tujuan: KunciAkun = st.bankAccountId ? kunciBank(st.bankAccountId) : tunai ? 'kas_besar' : 'bank'
  const sumber: KunciAkun = tunai ? 'kas_laci' : kunciKliring(st.paymentMethod.id)
  const memo = `Setoran ${st.no}`
  const sisa = st.expectedTotal - st.actualTotal - st.mdrFee
  return buatJurnal(tx, { docType: 'pos_settlement', docId: id, docNo: st.no, tanggal: st.date, memo, oleh }, [
    dk(tujuan, st.actualTotal, memo),
    dk('beban_mdr', st.mdrFee, memo),
    dk('selisih_kas', sisa, memo),
    dk(sumber, -st.expectedTotal, memo),
  ])
}

export async function balikJurnalSetoran(tx: Tx, id: number, tanggal: Date, oleh: number | null) {
  const st = await tx.posSettlement.findUniqueOrThrow({ where: { id }, select: { no: true } })
  if (!(await jurnalMaju(tx, 'pos_settlement', id))) await jurnalSetoran(tx, id, oleh)
  const balik = await buatJurnalBalik(tx, { docType: 'pos_settlement', docId: id, docNo: st.no, tanggal, memo: `Batal setoran ${st.no}`, oleh })
  if (balik) await tx.posSettlement.update({ where: { id }, data: { reversalJournalId: balik.id } })
  return balik
}

// --- Perintah produksi ditutup manual: sisa barang dalam proses ke Selisih Produksi (KONTRAK 11 butir 57) ---
export async function jurnalTutupPerintah(tx: Tx, id: number, oleh: number | null) {
  const po = await tx.productionOrder.findUniqueOrThrow({ where: { id }, select: { no: true, closedAt: true, wipWriteOff: true } })
  if (!po.closedAt || po.wipWriteOff === 0n) return null
  const memo = `Tutup perintah produksi ${po.no}, sisa barang dalam proses dibuang`
  return buatJurnal(tx, { docType: 'production_order', docId: id, docNo: po.no, tanggal: tanggalJurnal(po.closedAt), memo, oleh }, [dk('selisih_produksi', po.wipWriteOff, memo), dk('bdp', -po.wipWriteOff, memo)])
}

// Alamat halaman dokumen sumber jurnal, untuk tautan di Jurnal Umum dan Buku Besar. Dokumen pembelian ditambahkan di
// sini saat jurnalnya disambungkan.
const JALUR_SUMBER: Record<string, string> = {
  sale: '/transaksi',
  shift: '/shift',
  pos_settlement: '/setoran',
  stock_adjustment: '/penyesuaian',
  stock_opname: '/opname',
  stock_transfer: '/pindah-stok',
  material_issue: '/pengeluaran-bahan',
  production_result: '/hasil-produksi',
  quick_production: '/produksi-cepat',
  production_order: '/perintah-produksi',
  memorial: '/jurnal',
  // tahap 6B
  sales_invoice: '/faktur-jual',
  customer_payment: '/terima-pelanggan',
  sales_return: '/retur-jual',
}

export function tautanSumber(sourceType: string, sourceId: number | null, docNo = '') {
  if (sourceType === 'shift_cash_move') {
    const m = /#(\d+)$/.exec(docNo)
    return m ? `/shift/${m[1]}` : null
  }
  const jalur = JALUR_SUMBER[sourceType]
  return jalur && sourceId ? `${jalur}/${sourceId}` : null
}

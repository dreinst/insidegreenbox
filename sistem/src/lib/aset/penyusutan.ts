// Penyusutan aset tetap (tahap 6B, RANCANGAN 11.2 butir 12: garis lurus bulanan, tanpa penyusutan fiskal). Satu
// dokumen per bulan untuk semua aset Aktif, dibuat dengan "Hitung penyusutan bulan X" (izin aset.penyusutan Tambah dan
// Posting) dan langsung berjurnal: debit beban penyusutan, kredit akumulasi penyusutan per aset. Bulan yang sudah punya
// dokumen Diposting ditolak, begitu juga periode tertutup, bulan yang belum tiba, dan bulan sebelum dokumen terakhir.
//
// Jadwal: bulan pertama adalah bulan tanggal perolehan. Akumulasi terjadwal sampai bulan ke-k = floor(D x min(k, n) / n)
// dengan D = nilai perolehan - nilai sisa dan n = umur manfaat. Penyusutan bulan itu = terjadwal - akumulasi yang sudah
// dicatat, jadi pembulatan tersebar rata, jumlahnya tepat D di bulan ke-n, aset yang sudah habis disusutkan tidak ikut,
// dan bulan yang terlewat (misalnya aset diaktifkan belakangan) terkejar di dokumen berikutnya. Tanpa impor Next.
import { GalatAturan } from '../aksi'
import { buatJurnal, buatJurnalBalik, dk, namaPeriode, pastikanPeriodeTerbuka, type BarisJurnal } from '../akuntansi/jurnal'
import { catatAudit, type Konteks } from '../audit'
import { kunciBaris, type Aktor } from '../beli/dokumen'
import type { Db, DbAtauTx, Tx } from '../db'
import { pastikanIzin, saklarNyala } from '../izin-inti'
import { formatRupiah, PER_HALAMAN, sesuaiHalaman } from '../master'
import { ambilNomor } from '../nomor'
import { hariIni } from '../stok/dokumen'

export const MENU_SUSUT = 'aset.penyusutan'

const POLA_BULAN = /^(\d{4})-(0[1-9]|1[0-2])$/

export const bulanIni = (sekarang = new Date()) => hariIni(sekarang).toISOString().slice(0, 7)
const indeksBulan = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1
export const geserBulan = (ym: string, n: number) => {
  const i = indeksBulan(ym) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}
// Hari terakhir bulan sebagai Date UTC tengah malam (bentuk kolom date).
export const akhirBulan = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0))

type DataSusut = { cost: bigint; salvage: bigint; usefulMonths: number; acquiredDate: Date; accumDepreciation: bigint }

// Akumulasi terjadwal sampai akhir bulan ym.
export function akumulasiTerjadwal(a: Omit<DataSusut, 'accumDepreciation'>, ym: string) {
  const k = indeksBulan(ym) - indeksBulan(a.acquiredDate.toISOString().slice(0, 7)) + 1
  if (k <= 0) return 0n
  const n = BigInt(a.usefulMonths)
  const d = a.cost - a.salvage
  return (d * BigInt(Math.min(k, a.usefulMonths))) / n
}

// Penyusutan bulan ym untuk satu aset (0 bila belum mulai, sudah habis, atau sudah tercatat).
export function penyusutanBulan(a: DataSusut, ym: string) {
  const v = akumulasiTerjadwal(a, ym) - a.accumDepreciation
  return v > 0n ? v : 0n
}

// Tanggal jurnal: akhir bulan, atau hari ini bila bulan berjalan.
export const tanggalSusut = (ym: string, sekarang = new Date()) => {
  const akhir = akhirBulan(ym)
  const hari = hariIni(sekarang)
  return akhir.getTime() > hari.getTime() ? hari : akhir
}

export type UsulanSusut = { id: number; code: string; name: string; cost: bigint; accum: bigint; amount: bigint; accumAfter: bigint; bookAfter: bigint; accumAccountId: number | null; expenseAccountId: number | null }

// Aset Aktif yang disusutkan bulan ym beserta nilainya, tanpa menulis apa pun (pratinjau halaman dan isi dokumen).
export async function usulanPenyusutan(db: DbAtauTx, ym: string, kunci = false): Promise<UsulanSusut[]> {
  const akhir = akhirBulan(ym)
  if (kunci) await db.$queryRaw`SELECT id FROM fixed_asset WHERE status = 'aktif' AND acquired_date <= ${akhir}::date ORDER BY id FOR UPDATE`
  const aset = await db.fixedAsset.findMany({ where: { status: 'aktif', acquiredDate: { lte: akhir } }, orderBy: { id: 'asc' } })
  const hasil: UsulanSusut[] = []
  for (const a of aset) {
    const amount = penyusutanBulan(a, ym)
    if (amount <= 0n) continue
    const accumAfter = a.accumDepreciation + amount
    hasil.push({ id: a.id, code: a.code, name: a.name, cost: a.cost, accum: a.accumDepreciation, amount, accumAfter, bookAfter: a.cost - accumAfter, accumAccountId: a.accumAccountId, expenseAccountId: a.expenseAccountId })
  }
  return hasil
}

export const runTerakhir = (db: DbAtauTx) => db.assetDepreciationRun.findFirst({ where: { status: 'Diposting' }, orderBy: { yearMonth: 'desc' } })

// Bulan yang ditawarkan tombol: bulan sesudah dokumen terakhir, paling jauh bulan ini.
export async function bulanBerikut(db: DbAtauTx, sekarang = new Date()) {
  const akhir = await runTerakhir(db)
  const kini = bulanIni(sekarang)
  if (!akhir) return kini
  const lanjut = geserBulan(akhir.yearMonth, 1)
  return indeksBulan(lanjut) > indeksBulan(kini) ? null : lanjut
}

export async function hitungPenyusutan(db: Db, k: Konteks, aktor: Aktor, masukan: { bulan?: unknown }) {
  pastikanIzin(aktor, MENU_SUSUT, 'T')
  pastikanIzin(aktor, MENU_SUSUT, 'P')
  const ym = String(masukan.bulan ?? '').trim()
  if (!POLA_BULAN.test(ym)) throw new GalatAturan('Pilih bulan penyusutan.', 'bulan')
  const sekarang = new Date()
  if (indeksBulan(ym) > indeksBulan(bulanIni(sekarang))) throw new GalatAturan(`Penyusutan ${namaPeriode(ym)} belum bisa dihitung karena bulannya belum tiba.`, 'bulan')
  return db.$transaction(
    async (tx) => {
      // Satu hitungan penyusutan pada satu waktu, supaya dua klik bersamaan tidak membuat dua dokumen.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('penyusutan_aset'))`
      const ada = await tx.assetDepreciationRun.findFirst({ where: { status: 'Diposting', yearMonth: ym } })
      if (ada) throw new GalatAturan(`Penyusutan ${namaPeriode(ym)} sudah dihitung di ${ada.no}. Batalkan dokumen itu dulu bila perlu dihitung ulang.`, 'bulan')
      const lebihBaru = await tx.assetDepreciationRun.findFirst({ where: { status: 'Diposting', yearMonth: { gt: ym } }, orderBy: { yearMonth: 'desc' } })
      if (lebihBaru) throw new GalatAturan(`Penyusutan ${namaPeriode(lebihBaru.yearMonth)} sudah dihitung, jadi bulan sebelumnya tidak bisa dihitung lagi. Selisihnya ikut terkejar di bulan berikutnya.`, 'bulan')
      const tanggal = tanggalSusut(ym, sekarang)
      const periodId = await pastikanPeriodeTerbuka(tx, tanggal, `Penyusutan ${namaPeriode(ym)}`)
      const usulan = await usulanPenyusutan(tx, ym, true)
      if (!usulan.length) throw new GalatAturan(`Tidak ada aset Aktif yang perlu disusutkan di ${namaPeriode(ym)}.`, 'bulan')
      const total = usulan.reduce((n, u) => n + u.amount, 0n)
      const no = await ambilNomor(tx, 'asset_depreciation_run', 'PY', tanggal)
      const run = await tx.assetDepreciationRun.create({ data: { no, yearMonth: ym, date: tanggal, total, assetCount: usulan.length, status: 'Diposting', postedBy: aktor.id, postedAt: sekarang, createdBy: aktor.id } })
      const memo = `Penyusutan ${namaPeriode(ym)} ${no}`
      const baris: BarisJurnal[] = []
      for (const u of usulan) {
        if (!u.accumAccountId || !u.expenseAccountId) throw new GalatAturan(`Aset ${u.code} belum punya akun penyusutan. Batalkan lalu aktifkan ulang asetnya.`)
        baris.push(dk(u.expenseAccountId, u.amount, memo), dk(u.accumAccountId, -u.amount, memo))
        await tx.assetDepreciation.create({ data: { fixedAssetId: u.id, periodId, runId: run.id, amount: u.amount, accumAfter: u.accumAfter, postedBy: aktor.id, postedAt: sekarang } })
        await tx.fixedAsset.update({ where: { id: u.id }, data: { accumDepreciation: u.accumAfter, bookValue: u.bookAfter, updatedBy: aktor.id } })
      }
      const j = await buatJurnal(tx, { docType: 'asset_depreciation_run', docId: run.id, docNo: no, tanggal, memo, oleh: aktor.id }, baris)
      await catatAudit(tx, k, {
        action: 'penyusutan.hitung',
        docType: 'asset_depreciation_run',
        docId: run.id,
        summary: `Menghitung dan memposting penyusutan ${namaPeriode(ym)} ${no}: ${usulan.length} aset, total ${formatRupiah(total)}`,
        after: { no, bulan: ym, total, aset: usulan.length, jurnal: j?.no ?? null, rincian: usulan.slice(0, 20).map((u) => ({ aset: u.code, nilai: u.amount, akumulasi: u.accumAfter })) },
      })
      return run
    },
    { timeout: 30_000 },
  )
}

// Pembatalan hanya untuk dokumen penyusutan terakhir yang Diposting, supaya akumulasi tetap berurutan. Butuh izin
// Posting, saklar dok.batal_posting, dan alasan; jurnal dibalik persis bertanggal hari ini.
export async function batalPenyusutan(db: Db, k: Konteks, aktor: Aktor, id: number, alasan: string) {
  pastikanIzin(aktor, MENU_SUSUT, 'P')
  const teks = alasan.trim()
  if (!saklarNyala(aktor, 'dok.batal_posting')) throw new GalatAturan('Membatalkan penyusutan butuh saklar Batalkan dokumen diposting.')
  if (teks.length < 5) throw new GalatAturan('Tulis alasan pembatalan, minimal 5 huruf.', 'alasan')
  if (teks.length > 300) throw new GalatAturan('Alasan paling panjang 300 huruf.', 'alasan')
  return db.$transaction(async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('penyusutan_aset'))`
    await kunciBaris(tx, 'asset_depreciation_run', id)
    const run = await tx.assetDepreciationRun.findUnique({ where: { id }, include: { assetDepreciations: { include: { fixedAsset: true }, orderBy: { fixedAssetId: 'asc' } } } })
    if (!run) throw new GalatAturan('Dokumen penyusutan tidak ditemukan.')
    if (run.status !== 'Diposting') throw new GalatAturan('Dokumen penyusutan ini sudah dibatalkan.')
    const akhir = await runTerakhir(tx)
    if (akhir && akhir.id !== run.id) throw new GalatAturan(`Hanya penyusutan terakhir (${akhir.no}, ${namaPeriode(akhir.yearMonth)}) yang bisa dibatalkan.`)
    for (const b of run.assetDepreciations) {
      await kunciBaris(tx, 'fixed_asset', b.fixedAssetId)
      const a = await tx.fixedAsset.findUniqueOrThrow({ where: { id: b.fixedAssetId } })
      if (a.status !== 'aktif') throw new GalatAturan(`Aset ${a.code} sudah ${a.status === 'dilepas' ? 'dilepas' : 'tidak aktif'}. Batalkan pelepasannya dulu.`)
      const accum = a.accumDepreciation - b.amount
      await tx.fixedAsset.update({ where: { id: a.id }, data: { accumDepreciation: accum, bookValue: a.cost - accum, updatedBy: aktor.id } })
    }
    const sekarang = new Date()
    const j = await buatJurnalBalik(tx, { docType: 'asset_depreciation_run', docId: run.id, docNo: run.no, tanggal: hariIni(sekarang), memo: `Batal penyusutan ${namaPeriode(run.yearMonth)} ${run.no}`, oleh: aktor.id })
    await tx.assetDepreciationRun.update({ where: { id }, data: { status: 'Batal', cancelledBy: aktor.id, cancelledAt: sekarang, cancelReason: teks, reversalJournalId: j?.id ?? null } })
    await catatAudit(tx, k, {
      action: 'penyusutan.batal',
      docType: 'asset_depreciation_run',
      docId: id,
      summary: `Membatalkan penyusutan ${namaPeriode(run.yearMonth)} ${run.no}, ${run.assetCount} aset dikembalikan. Alasan: ${teks}`,
      before: { status: run.status },
      after: { status: 'Batal', jurnalBalik: j?.no ?? null },
    })
    return j
  })
}

export async function daftarPenyusutan(db: Db, s: { hal?: string }) {
  const hal = sesuaiHalaman(s.hal)
  const [baris, total] = await Promise.all([
    db.assetDepreciationRun.findMany({ orderBy: [{ yearMonth: 'desc' }, { id: 'desc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.assetDepreciationRun.count(),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

export const muatPenyusutan = (db: DbAtauTx, id: number) =>
  db.assetDepreciationRun.findUnique({ where: { id }, include: { assetDepreciations: { include: { fixedAsset: { select: { id: true, code: true, name: true, cost: true, status: true } } }, orderBy: { fixedAssetId: 'asc' } } } })

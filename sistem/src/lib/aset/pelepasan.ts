// Pelepasan atau penjualan aset tetap (tahap 6B), izin aset.penyusutan (Owner L T H P, Admin tanpa akses). Dokumen
// pelaksana: Draft lalu Diposting; Diposting bisa dibatalkan dengan jurnal balik. Saat Diposting: nilai buku = nilai
// perolehan - akumulasi penyusutan, laba atau rugi = hasil penjualan - nilai buku, dan jurnalnya debit Kas Besar atau
// rekening (hasil penjualan), debit akumulasi penyusutan, kredit aset tetap (nilai perolehan), dan sisanya ke Laba atau
// Rugi Pelepasan Aset. Aset menjadi Dilepas dan tidak disusutkan lagi. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { buatJurnal, buatJurnalBalik, dk, namaPeriode } from '../akuntansi/jurnal'
import { kunciBank } from '../akuntansi/pemetaan'
import { catatAudit, selisih, type Konteks } from '../audit'
import { idSkema, kunciBaris, skemaTanggalWajib, type Aktor } from '../beli/dokumen'
import type { Db, DbAtauTx, Tx } from '../db'
import { pastikanIzin, saklarNyala } from '../izin-inti'
import { formatRupiah, PER_HALAMAN, sesuaiHalaman, skemaUang } from '../master'
import { ambilNomor } from '../nomor'
import { transisiSah } from '../status'
import { hariIni, periksaTanggal } from '../stok/dokumen'
import { MENU_SUSUT } from './penyusutan'

const JENIS = 'asset_disposal'

const kepala = {
  date: skemaTanggalWajib('Tanggal pelepasan'),
  proceeds: z.string().default('').pipe(skemaUang({ label: 'Hasil penjualan', min: 0n, max: 100_000_000_000n, wajib: false })),
  tujuan: z.string().regex(/^(kas|\d+)$/, 'Pilih kas atau rekening bank.').default('kas'),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
}
export const skemaPelepasanBaru = z.object({ fixedAssetId: idSkema('aset'), ...kepala })
export const skemaKepalaPelepasan = z.object(kepala)

async function rekening(tx: DbAtauTx, tujuan: string) {
  if (tujuan === 'kas') return null
  const r = await tx.bankAccount.findUnique({ where: { id: Number(tujuan) } })
  if (!r || !r.active) throw new GalatAturan('Rekening bank tidak ditemukan atau nonaktif.', 'tujuan')
  return r.id
}

async function asetBolehDilepas(tx: Tx, id: number, kecuali?: number) {
  await kunciBaris(tx, 'fixed_asset', id)
  const a = await tx.fixedAsset.findUnique({ where: { id } })
  if (!a || a.status !== 'aktif') throw new GalatAturan('Aset harus berstatus Aktif untuk dilepas.', 'fixedAssetId')
  const lain = await tx.assetDisposal.findFirst({ where: { fixedAssetId: id, status: { not: 'Batal' }, ...(kecuali ? { NOT: { id: kecuali } } : {}) } })
  if (lain) throw new GalatAturan(`Aset ini sudah punya dokumen pelepasan ${lain.no}.`, 'fixedAssetId')
  return a
}

function periksaKepala(aktor: Aktor, a: { acquiredDate: Date }, d: { date: Date }) {
  periksaTanggal(aktor, d.date)
  if (d.date.getTime() < a.acquiredDate.getTime()) throw new GalatAturan('Tanggal pelepasan tidak boleh sebelum tanggal perolehan aset.', 'date')
}

export async function buatPelepasan(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU_SUSUT, 'T')
  const d = skemaPelepasanBaru.parse(masukan)
  return db.$transaction(async (tx) => {
    const a = await asetBolehDilepas(tx, d.fixedAssetId)
    periksaKepala(aktor, a, d)
    const bankAccountId = await rekening(tx, d.tujuan)
    const no = await ambilNomor(tx, JENIS, 'LA', d.date)
    const x = await tx.assetDisposal.create({ data: { fixedAssetId: a.id, no, date: d.date, proceeds: d.proceeds, bankAccountId, note: d.note, status: 'Draft', createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pelepasan.tambah', docType: JENIS, docId: x.id, summary: `Membuat draf pelepasan ${no} untuk aset ${a.code} ${a.name}, hasil ${formatRupiah(d.proceeds)}`, after: { no, aset: a.code, date: d.date, proceeds: d.proceeds, tujuan: bankAccountId ?? 'kas', note: d.note } })
    return x
  })
}

async function muatTerkunci(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const x = await tx.assetDisposal.findUnique({ where: { id }, include: { fixedAsset: true } })
  if (!x) throw new GalatAturan('Dokumen pelepasan tidak ditemukan.')
  return x
}

export async function ubahPelepasan(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU_SUSUT, 'T')
  const d = skemaKepalaPelepasan.parse(masukan)
  return db.$transaction(async (tx) => {
    const x = await muatTerkunci(tx, id)
    if (x.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
    periksaKepala(aktor, x.fixedAsset, d)
    const bankAccountId = await rekening(tx, d.tujuan)
    const beda = selisih({ date: x.date, proceeds: x.proceeds, bankAccountId: x.bankAccountId, note: x.note }, { date: d.date, proceeds: d.proceeds, bankAccountId, note: d.note })
    if (!beda.berubah.length) return 0
    await tx.assetDisposal.update({ where: { id }, data: { date: d.date, proceeds: d.proceeds, bankAccountId, note: d.note, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pelepasan.ubah', docType: JENIS, docId: id, summary: `Mengubah draf pelepasan ${x.no}`, before: beda.sebelum, after: beda.sesudah })
    return beda.berubah.length
  })
}

export async function hapusPelepasan(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU_SUSUT, 'H')
  return db.$transaction(async (tx) => {
    const x = await muatTerkunci(tx, id)
    if (x.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa dihapus.')
    await tx.assetDisposal.delete({ where: { id } })
    await catatAudit(tx, k, { action: 'pelepasan.hapus', docType: JENIS, docId: id, summary: `Menghapus draf pelepasan ${x.no}`, before: { no: x.no, aset: x.fixedAsset.code } })
  })
}

// Nilai pelepasan dari angka aset saat ini. laba > 0 berarti laba, < 0 rugi.
export const hitungPelepasan = (a: { cost: bigint; accumDepreciation: bigint }, proceeds: bigint) => {
  const buku = a.cost - a.accumDepreciation
  return { buku, labaRugi: proceeds - buku }
}

export async function postingPelepasan(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU_SUSUT, 'P')
  return db.$transaction(async (tx) => {
    const x = await muatTerkunci(tx, id)
    if (!transisiSah('pelaksana', x.status, 'Diposting')) throw new GalatAturan(`Pelepasan berstatus ${x.status} tidak bisa diposting.`)
    const a = await asetBolehDilepas(tx, x.fixedAssetId, x.id)
    periksaKepala(aktor, a, x)
    if (x.bankAccountId) await rekening(tx, String(x.bankAccountId))
    if (!a.assetAccountId || !a.accumAccountId) throw new GalatAturan(`Aset ${a.code} belum punya akun aset. Batalkan lalu aktifkan ulang asetnya.`)
    // Penyusutan yang sudah dicatat untuk bulan sesudah tanggal pelepasan membuat nilai buku salah.
    const susutAkhir = await tx.assetDepreciation.findFirst({ where: { fixedAssetId: a.id, run: { status: 'Diposting' } }, include: { run: true }, orderBy: { run: { yearMonth: 'desc' } } })
    if (susutAkhir && susutAkhir.run.yearMonth > x.date.toISOString().slice(0, 7)) {
      throw new GalatAturan(`Aset ini sudah disusutkan sampai ${namaPeriode(susutAkhir.run.yearMonth)}. Tanggal pelepasan tidak boleh sebelum bulan itu.`, 'date')
    }
    const { buku, labaRugi } = hitungPelepasan(a, x.proceeds)
    const memo = `Pelepasan aset ${a.code} ${a.name} ${x.no}`
    const tujuan = x.bankAccountId ? kunciBank(x.bankAccountId) : 'kas_besar'
    const j = await buatJurnal(tx, { docType: JENIS, docId: x.id, docNo: x.no, tanggal: x.date, memo, oleh: aktor.id }, [
      dk(tujuan, x.proceeds, memo),
      dk(a.accumAccountId, a.accumDepreciation, memo),
      dk(a.assetAccountId, -a.cost, memo),
      labaRugi >= 0n ? dk('laba_lepas_aset', -labaRugi, memo) : dk('rugi_lepas_aset', -labaRugi, memo),
    ])
    const sekarang = new Date()
    await tx.assetDisposal.update({ where: { id }, data: { status: 'Diposting', cost: a.cost, accumDepreciation: a.accumDepreciation, bookValue: buku, gainLoss: labaRugi, postedBy: aktor.id, postedAt: sekarang, updatedBy: aktor.id } })
    await tx.fixedAsset.update({ where: { id: a.id }, data: { status: 'dilepas', bookValue: 0n, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'pelepasan.posting',
      docType: JENIS,
      docId: id,
      summary: `Memposting pelepasan ${x.no} aset ${a.code}: nilai buku ${formatRupiah(buku)}, hasil ${formatRupiah(x.proceeds)}, ${labaRugi >= 0n ? 'laba' : 'rugi'} ${formatRupiah(labaRugi < 0n ? -labaRugi : labaRugi)}`,
      before: { status: x.status },
      after: { status: 'Diposting', nilaiBuku: buku, hasil: x.proceeds, labaRugi, jurnal: j?.no ?? null },
    })
    return j
  })
}

export async function batalPelepasan(db: Db, k: Konteks, aktor: Aktor, id: number, alasan: string) {
  pastikanIzin(aktor, MENU_SUSUT, 'P')
  const teks = alasan.trim()
  return db.$transaction(async (tx) => {
    const x = await muatTerkunci(tx, id)
    if (x.status !== 'Diposting') throw new GalatAturan('Hanya pelepasan Diposting yang dibatalkan. Draf cukup dihapus.')
    if (!saklarNyala(aktor, 'dok.batal_posting')) throw new GalatAturan('Membatalkan dokumen yang sudah Diposting butuh saklar Batalkan dokumen diposting.')
    if (teks.length < 5) throw new GalatAturan('Tulis alasan pembatalan, minimal 5 huruf.', 'alasan')
    if (teks.length > 300) throw new GalatAturan('Alasan paling panjang 300 huruf.', 'alasan')
    await kunciBaris(tx, 'fixed_asset', x.fixedAssetId)
    const a = await tx.fixedAsset.findUniqueOrThrow({ where: { id: x.fixedAssetId } })
    const sekarang = new Date()
    const j = await buatJurnalBalik(tx, { docType: JENIS, docId: id, docNo: x.no, tanggal: hariIni(sekarang), memo: `Batal pelepasan ${x.no}`, oleh: aktor.id })
    await tx.assetDisposal.update({ where: { id }, data: { status: 'Batal', cancelledBy: aktor.id, cancelledAt: sekarang, cancelReason: teks, reversalJournalId: j?.id ?? null, updatedBy: aktor.id } })
    await tx.fixedAsset.update({ where: { id: a.id }, data: { status: 'aktif', bookValue: a.cost - a.accumDepreciation, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pelepasan.batal', docType: JENIS, docId: id, summary: `Membatalkan pelepasan ${x.no}; aset ${a.code} kembali Aktif. Alasan: ${teks}`, before: { status: x.status }, after: { status: 'Batal', jurnalBalik: j?.no ?? null } })
    return j
  })
}

export async function daftarPelepasan(db: Db, s: { status?: string; hal?: string }) {
  const hal = sesuaiHalaman(s.hal)
  const where = s.status === 'Draft' || s.status === 'Diposting' || s.status === 'Batal' ? { status: s.status as 'Draft' | 'Diposting' | 'Batal' } : {}
  const [baris, total] = await Promise.all([
    db.assetDisposal.findMany({ where, include: { fixedAsset: { select: { code: true, name: true, cost: true, accumDepreciation: true } } }, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.assetDisposal.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

export const muatPelepasan = (db: DbAtauTx, id: number) => db.assetDisposal.findUnique({ where: { id }, include: { fixedAsset: { include: { category: true } } } })

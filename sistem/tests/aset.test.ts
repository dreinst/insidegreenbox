// Aset tetap tahap 6B: kategori dan pemetaan akun per kategori, aktivasi dengan jurnal perolehan, penyusutan garis lurus
// bulanan (bulan pertama, nilai sisa, pembulatan, tidak ganda, aset habis disusutkan, periode tertutup, urutan bulan,
// pembatalan), pelepasan dengan laba dan dengan rugi, dan izin.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import { aktifkanAset, batalkanAset, hapusAset, tambahAset, ubahAset } from '../src/lib/aset/aset'
import { tambahKategoriAset } from '../src/lib/aset/kategori'
import { batalPelepasan, buatPelepasan, postingPelepasan } from '../src/lib/aset/pelepasan'
import { akumulasiTerjadwal, batalPenyusutan, bulanBerikut, bulanIni, geserBulan, hitungPenyusutan, penyusutanBulan } from '../src/lib/aset/penyusutan'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { hariIni } from '../src/lib/stok/dokumen'
import { buatAktor, k, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let peralatan = 0
let mesin = 0
let asetA = 0
let asetB = 0

const M0 = geserBulan(bulanIni(), -3)
const M = (n: number) => geserBulan(M0, n)
// Bulan berjalan memakai tanggal hari ini supaya tes tidak bergantung pada tanggal menjalankannya.
const hariIniIso = () => hariIni().toISOString().slice(0, 10)
const tgl = (ym: string, hari = 15) => `${ym}-${String(hari).padStart(2, '0')}`

const galat = async (f: () => Promise<unknown>, pesan?: RegExp) => {
  await assert.rejects(f, (e: unknown) => {
    assert.ok(e instanceof GalatAturan, `harus GalatAturan, dapat ${String(e)}`)
    if (pesan) assert.match(e.message, pesan)
    return true
  })
}
const ditolak = (f: () => Promise<unknown>) => assert.rejects(f, (e: unknown) => e instanceof GalatIzin)

async function barisJurnal(docType: string, docId: number, balik = false) {
  const j = await db.journal.findFirstOrThrow({ where: { sourceType: docType, sourceId: docId, reversalOfId: balik ? { not: null } : null }, include: { journalLines: { include: { account: true } } } })
  return { j, isi: j.journalLines.map((l) => `${l.account.code} ${l.debit > 0n ? 'D' : 'K'} ${l.debit > 0n ? l.debit : l.credit}`).sort() }
}
const run = (ym: string) => db.assetDepreciationRun.findFirstOrThrow({ where: { yearMonth: ym, status: 'Diposting' }, include: { assetDepreciations: true } })
const aset = (id: number) => db.fixedAsset.findUniqueOrThrow({ where: { id } })

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('aset'))
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
})
after(() => hapus())

describe('jadwal garis lurus', () => {
  test('bulan pertama = bulan perolehan, pembulatan tersebar, berhenti di nilai sisa', () => {
    const a = { cost: 1_000_000n, salvage: 100_000n, usefulMonths: 3, acquiredDate: new Date('2026-01-31T00:00:00Z') }
    assert.equal(akumulasiTerjadwal(a, '2025-12'), 0n)
    assert.equal(akumulasiTerjadwal(a, '2026-01'), 300_000n)
    assert.equal(akumulasiTerjadwal(a, '2026-03'), 900_000n)
    assert.equal(akumulasiTerjadwal(a, '2027-01'), 900_000n)
    const b = { cost: 1_000_000n, salvage: 0n, usefulMonths: 3, acquiredDate: new Date('2026-01-01T00:00:00Z') }
    const bulan = ['2026-01', '2026-02', '2026-03', '2026-04']
    let akum = 0n
    const nilai = bulan.map((ym) => {
      const v = penyusutanBulan({ ...b, accumDepreciation: akum }, ym)
      akum += v
      return v
    })
    assert.deepEqual(nilai, [333_333n, 333_333n, 333_334n, 0n])
    // Bulan yang terlewat terkejar di bulan berikutnya.
    assert.equal(penyusutanBulan({ ...b, accumDepreciation: 0n }, '2026-02'), 666_666n)
  })
})

describe('kategori dan aktivasi', () => {
  test('kategori hanya untuk Owner; aset draf diaktifkan Owner dengan jurnal perolehan dari kas', async () => {
    await ditolak(() => tambahKategoriAset(db, k(admin), admin, { code: 'PRL', name: 'Peralatan', usefulMonths: '48' }))
    peralatan = (await tambahKategoriAset(db, k(owner), owner, { code: 'prl', name: 'Peralatan dapur', usefulMonths: '48' })).id
    mesin = (await tambahKategoriAset(db, k(owner), owner, { code: 'MSN', name: 'Mesin kopi', usefulMonths: '60' })).id
    await galat(() => tambahKategoriAset(db, k(owner), owner, { code: 'LAIN', name: 'mesin KOPI', usefulMonths: '60' }), /Nama kategori sudah dipakai/)
    // Kategori mesin memakai beban penyusutan sendiri lewat pemetaan per kategori.
    const lain = await db.account.findUniqueOrThrow({ where: { code: '6-1900' } })
    await db.accountMapping.create({ data: { key: `beban_penyusutan.${mesin}`, accountId: lain.id } })

    await ditolak(() => tambahAset(db, k(admin), admin, { name: 'Kulkas', categoryId: String(peralatan), acquiredDate: tgl(M0), cost: '1000000', sumber: 'kas' }))
    await galat(() => tambahAset(db, k(owner), owner, { name: 'Kulkas', categoryId: String(peralatan), acquiredDate: tgl(M0), cost: '1000000', salvage: '1000000', sumber: 'kas' }), /Nilai sisa harus lebih kecil/)
    const a = await tambahAset(db, k(owner), owner, { name: 'Mesin espresso', categoryId: String(mesin), acquiredDate: tgl(M0), cost: '10.000.000', salvage: '1000000', usefulMonths: '12', sumber: 'kas' })
    asetA = a.id
    assert.match(a.code, /^AT-\d{4}-\d{4}$/)
    assert.equal(a.status, 'draft')
    const b = await tambahAset(db, k(owner), owner, { name: 'Blender', categoryId: String(peralatan), acquiredDate: tgl(M(1), 3), cost: '1000000', usefulMonths: '2', sumber: 'kas' })
    asetB = b.id
    // Umur kosong memakai umur bawaan kategori.
    const c = await tambahAset(db, k(owner), owner, { name: 'Rak', categoryId: String(peralatan), acquiredDate: tgl(M0), cost: '500000', sumber: 'kas' })
    assert.equal(c.usefulMonths, 48)

    await ditolak(() => aktifkanAset(db, k(admin), admin, asetA))
    const j = await aktifkanAset(db, k(owner), owner, asetA)
    assert.ok(j)
    const { isi } = await barisJurnal('fixed_asset', asetA)
    assert.deepEqual(isi, ['1-1200 K 10000000', '1-2100 D 10000000'])
    const sesudah = await aset(asetA)
    assert.equal(sesudah.status, 'aktif')
    assert.equal(sesudah.bookValue, 10_000_000n)
    assert.equal((await db.account.findUniqueOrThrow({ where: { id: sesudah.expenseAccountId! } })).code, '6-1900', 'akun beban dari pemetaan kategori')
    assert.equal((await db.account.findUniqueOrThrow({ where: { id: sesudah.accumAccountId! } })).code, '1-2900', 'akumulasi jatuh ke kunci umum')
    await aktifkanAset(db, k(owner), owner, asetB)
    // Aset Aktif hanya boleh diubah nama, lokasi, dan catatannya.
    assert.equal(await ubahAset(db, k(owner), owner, asetA, { name: 'Mesin espresso 2 grup', note: 'Bar depan', cost: '1' }), 2)
    assert.equal((await aset(asetA)).cost, 10_000_000n)
    // Draf c tetap draf dan tidak pernah disusutkan; lalu dihapus.
    await hapusAset(db, k(owner), owner, c.id)
    const audit = await db.auditLog.findMany({ where: { docType: 'fixed_asset', docId: String(asetA) }, select: { action: true, afterJson: true } })
    assert.deepEqual(audit.map((x) => x.action).sort(), ['aset.aktifkan', 'aset.tambah', 'aset.ubah'])
    assert.equal((audit.find((x) => x.action === 'aset.aktifkan')!.afterJson as { jurnal: string }).jurnal, j!.no)
  })
})

describe('penyusutan bulanan', () => {
  test('sebelum bulan pertama tidak ada aset; periode tertutup ditolak; satu dokumen per bulan', async () => {
    await ditolak(() => hitungPenyusutan(db, k(admin), admin, { bulan: M0 }))
    await galat(() => hitungPenyusutan(db, k(owner), owner, { bulan: M(-1) }), /Tidak ada aset Aktif/)
    await db.fiscalPeriod.upsert({ where: { yearMonth: M0 }, create: { yearMonth: M0, status: 'Ditutup', closedAt: new Date() }, update: { status: 'Ditutup' } })
    await galat(() => hitungPenyusutan(db, k(owner), owner, { bulan: M0 }), /sudah ditutup/)
    assert.equal(await db.assetDepreciationRun.count(), 0)
    await db.fiscalPeriod.update({ where: { yearMonth: M0 }, data: { status: 'Terbuka' } })

    const r = await hitungPenyusutan(db, k(owner), owner, { bulan: M0 })
    assert.match(r.no, /^PY-/)
    assert.equal(r.total, 750_000n, '(10 juta - 1 juta) / 12')
    assert.equal(r.assetCount, 1, 'Blender baru mulai bulan berikutnya')
    assert.equal(r.date.toISOString().slice(0, 10), new Date(Date.UTC(Number(M0.slice(0, 4)), Number(M0.slice(5)), 0)).toISOString().slice(0, 10), 'tanggal = akhir bulan')
    const { isi } = await barisJurnal('asset_depreciation_run', r.id)
    assert.deepEqual(isi, ['1-2900 K 750000', '6-1900 D 750000'])
    await galat(() => hitungPenyusutan(db, k(owner), owner, { bulan: M0 }), /sudah dihitung/)
    assert.equal(await bulanBerikut(db), M(1))
  })

  test('aset kedua ikut mulai bulan perolehannya, lalu berhenti saat habis disusutkan', async () => {
    const r1 = await hitungPenyusutan(db, k(owner), owner, { bulan: M(1) })
    assert.equal(r1.total, 1_250_000n)
    await galat(() => hitungPenyusutan(db, k(owner), owner, { bulan: M0 }), /sudah dihitung/)
    const r2 = await hitungPenyusutan(db, k(owner), owner, { bulan: M(2) })
    assert.equal(r2.total, 1_250_000n)
    const b = await aset(asetB)
    assert.equal(b.accumDepreciation, 1_000_000n)
    assert.equal(b.bookValue, 0n, 'habis sampai nilai sisa 0')
    const r3 = await hitungPenyusutan(db, k(owner), owner, { bulan: M(3) })
    assert.equal(r3.assetCount, 1, 'aset yang sudah habis disusutkan tidak ikut')
    assert.equal(r3.total, 750_000n)
    assert.equal(r3.date.getTime(), hariIni().getTime(), 'bulan berjalan: tanggal jurnal hari ini, bukan akhir bulan')
    await galat(() => hitungPenyusutan(db, k(owner), owner, { bulan: M(4) }), /belum tiba/)
    assert.equal(await bulanBerikut(db), null)
    const a = await aset(asetA)
    assert.equal(a.accumDepreciation, 3_000_000n)
    assert.equal(a.bookValue, 7_000_000n)
  })

  test('hanya dokumen terakhir yang bisa dibatalkan; sesudah dibatalkan bulan itu bisa dihitung lagi', async () => {
    const lama = await run(M(2))
    await galat(() => batalPenyusutan(db, k(owner), owner, lama.id, 'Salah hitung'), /Hanya penyusutan terakhir/)
    const akhir = await run(M(3))
    await galat(() => batalPenyusutan(db, k(owner), owner, akhir.id, 'x'), /minimal 5 huruf/)
    await batalPenyusutan(db, k(owner), owner, akhir.id, 'Umur manfaat salah')
    const { isi } = await barisJurnal('asset_depreciation_run', akhir.id, true)
    assert.deepEqual(isi, ['1-2900 D 750000', '6-1900 K 750000'])
    assert.equal((await aset(asetA)).accumDepreciation, 2_250_000n)
    const ulang = await hitungPenyusutan(db, k(owner), owner, { bulan: M(3) })
    assert.equal(ulang.total, 750_000n)
    assert.equal((await aset(asetA)).accumDepreciation, 3_000_000n)
    const audit = await db.auditLog.findMany({ where: { docType: 'asset_depreciation_run' }, select: { action: true } })
    assert.equal(audit.filter((x) => x.action === 'penyusutan.hitung').length, 5)
    assert.equal(audit.filter((x) => x.action === 'penyusutan.batal').length, 1)
  })
})

describe('pelepasan aset', () => {
  test('dijual di atas nilai buku: laba; tanggal sebelum penyusutan terakhir ditolak; batal mengembalikan aset', async () => {
    await galat(() => batalkanAset(db, k(owner), owner, asetA, 'Salah input aset'), /sudah disusutkan/)
    await ditolak(() => buatPelepasan(db, k(admin), admin, { fixedAssetId: String(asetA), date: hariIniIso(), proceeds: '8000000' }))
    const awal = await buatPelepasan(db, k(owner), owner, { fixedAssetId: String(asetA), date: tgl(M(2), 1), proceeds: '8000000' })
    await galat(() => postingPelepasan(db, k(owner), owner, awal.id), /sudah disusutkan sampai/)
    await galat(() => buatPelepasan(db, k(owner), owner, { fixedAssetId: String(asetA), date: hariIniIso(), proceeds: '1' }), /sudah punya dokumen pelepasan/)
    await db.assetDisposal.update({ where: { id: awal.id }, data: { date: new Date(`${hariIniIso()}T00:00:00Z`) } })
    await postingPelepasan(db, k(owner), owner, awal.id)
    const x = await db.assetDisposal.findUniqueOrThrow({ where: { id: awal.id } })
    assert.equal(x.bookValue, 7_000_000n)
    assert.equal(x.gainLoss, 1_000_000n)
    const { isi } = await barisJurnal('asset_disposal', x.id)
    assert.deepEqual(isi, ['1-1200 D 8000000', '1-2100 K 10000000', '1-2900 D 3000000', '4-9100 K 1000000'].sort())
    assert.equal((await aset(asetA)).status, 'dilepas')
    // Penyusutan yang memuat aset yang sudah dilepas tidak bisa dibatalkan.
    await galat(async () => batalPenyusutan(db, k(owner), owner, (await run(M(3))).id, 'Coba batalkan'), /sudah dilepas/)
    await batalPelepasan(db, k(owner), owner, x.id, 'Pembeli batal membeli')
    const balik = await barisJurnal('asset_disposal', x.id, true)
    assert.deepEqual(balik.isi, ['1-1200 K 8000000', '1-2100 D 10000000', '1-2900 K 3000000', '4-9100 D 1000000'].sort())
    const a = await aset(asetA)
    assert.equal(a.status, 'aktif')
    assert.equal(a.bookValue, 7_000_000n)
  })

  test('dijual di bawah nilai buku: rugi, uang ke rekening bank', async () => {
    const rek = await db.bankAccount.create({ data: { bankName: 'BCA', accountNo: '123', holderName: 'Greenbox' } })
    const d = await tambahAset(db, k(owner), owner, { name: 'Oven', categoryId: String(peralatan), acquiredDate: hariIniIso(), cost: '2000000', sumber: String(rek.id) })
    await aktifkanAset(db, k(owner), owner, d.id)
    assert.deepEqual((await barisJurnal('fixed_asset', d.id)).isi, ['1-1310 K 2000000', '1-2100 D 2000000'])
    const x = await buatPelepasan(db, k(owner), owner, { fixedAssetId: String(d.id), date: hariIniIso(), proceeds: '1500000', tujuan: String(rek.id) })
    await postingPelepasan(db, k(owner), owner, x.id)
    const sesudah = await db.assetDisposal.findUniqueOrThrow({ where: { id: x.id } })
    assert.equal(sesudah.gainLoss, -500_000n)
    assert.deepEqual((await barisJurnal('asset_disposal', x.id)).isi, ['1-1310 D 1500000', '1-2100 K 2000000', '6-1800 D 500000'].sort())
    // Aset yang dilepas tidak ikut penyusutan bulan berikutnya dan tidak bisa dibatalkan.
    await galat(() => batalkanAset(db, k(owner), owner, d.id, 'Salah input aset'), /Hanya aset Aktif/)
  })

  test('aset Aktif tanpa penyusutan bisa dibatalkan dengan jurnal balik', async () => {
    const e = await tambahAset(db, k(owner), owner, { name: 'Meja', categoryId: String(peralatan), acquiredDate: hariIniIso(), cost: '750000', sumber: 'kas' })
    await aktifkanAset(db, k(owner), owner, e.id)
    await ditolak(() => batalkanAset(db, k(admin), admin, e.id, 'Salah input aset'))
    await batalkanAset(db, k(owner), owner, e.id, 'Salah input aset')
    assert.deepEqual((await barisJurnal('fixed_asset', e.id, true)).isi, ['1-1200 D 750000', '1-2100 K 750000'])
    assert.equal((await aset(e.id)).status, 'batal')
  })
})

// Tahap 5C: impor mutasi CSV (KlikBCA dan umum) yang idempoten, rekonsiliasi per rekening per periode, saran
// pencocokan, cocok manual, transaksi kas dari baris mutasi, posting hanya bila selisih 0, kunci baris jurnal yang sudah
// dicocokkan, pembatalan, saldo awal bersambung, dan akses Admin ditolak.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { GalatAturan, GalatIzin } from '../src/lib/aksi'
import type { Db } from '../src/lib/db'
import type { Pengguna } from '../src/lib/izin-inti'
import { buatKas, buatPindah, tambahBarisKas, ubahStatusKas } from '../src/lib/kas'
import { CONTOH_FORMAT, uraiMutasi } from '../src/lib/mutasi-csv'
import {
  batalRekonsiliasi,
  buatRekonsiliasi,
  cocokkan,
  hitungRekonsiliasi,
  imporMutasi,
  kasDariBarisMutasi,
  lepasCocok,
  postingRekonsiliasi,
  rincianRekonsiliasi,
  saranCocok,
  terapkanSaran,
  ubahKepalaRekonsiliasi,
} from '../src/lib/rekonsiliasi'
import { tambahRekening } from '../src/lib/rekening'
import { tanggalIso } from '../src/lib/waktu'
import { buatAktor, k, siapkanDbUji } from './db-uji'

let db: Db
let hapus: () => Promise<void>
let owner: Pengguna
let admin: Pengguna
let rekening = 0
let rk = 0
let kasPln = 0
let kasLama = 0
let noPindah = ''
const akun: Record<string, number> = {}
const hari = (n: number) => tanggalIso(new Date(Date.now() + n * 86_400_000))
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const galat = async (f: () => Promise<unknown>, pesan?: RegExp) => {
  await assert.rejects(f, (e: unknown) => {
    assert.ok(e instanceof GalatAturan, `harus GalatAturan, dapat ${String(e)}`)
    if (pesan) assert.match(e.message, pesan)
    return true
  })
}
const ditolak = (f: () => Promise<unknown>) => assert.rejects(f, (e: unknown) => e instanceof GalatIzin)

async function kasPosting(kind: 'masuk' | 'keluar', tanggal: string, accountId: number, jumlah: string, pihak = '') {
  const c = await buatKas(db, k(owner), owner, { kind, date: tanggal, sumber: String(rekening), partyName: pihak })
  await tambahBarisKas(db, k(owner), owner, c.id, { accountId: String(accountId), amount: jumlah })
  await ubahStatusKas(db, k(owner), owner, c.id, 'ajukan')
  if (kind === 'keluar') await ubahStatusKas(db, k(owner), owner, c.id, 'setujui')
  await ubahStatusKas(db, k(owner), owner, c.id, 'posting')
  return c
}

const csvUmum = () =>
  [
    'Tanggal,Keterangan,Referensi,Debit,Kredit,Saldo',
    `${dmy(hari(-3))},SETORAN DARI KAS BESAR,${noPindah},,"5.000.000","15.000.000"`,
    `${dmy(hari(-1))},TRSF E-BANKING DB PLN,,"750.000",,"14.250.000"`,
    `${dmy(hari(-1))},BIAYA ADM,,"15.000",,"14.235.000"`,
    `${dmy(hari(-1))},TRSF DB TOKO LAMA,,"99.000",,"14.136.000"`,
  ].join('\r\n')

before(async () => {
  ;({ db, hapus } = await siapkanDbUji('rekon'))
  owner = await buatAktor(db, 'owner', 'owner1')
  admin = await buatAktor(db, 'admin', 'admin1')
  rekening = (await tambahRekening(db, k(owner), owner, { bankName: 'BCA', accountNo: '7770001234', holderName: 'Greenbox' })).id
  for (const a of await db.account.findMany()) akun[a.code] = a.id
  // Saldo awal rekening di buku (modal), dan pembayaran lama yang baru cair di periode ini.
  await kasPosting('masuk', hari(-10), akun['3-1000'], '10.000.000', 'Modal awal')
  kasLama = (await kasPosting('keluar', hari(-9), akun['6-1900'], '99.000', 'Toko lama')).id
  const p = await buatPindah(db, k(owner), owner, { date: hari(-3), sumber: 'kas', tujuan: String(rekening), amount: '5.000.000' })
  await ubahStatusKas(db, k(owner), owner, p.id, 'ajukan')
  await ubahStatusKas(db, k(owner), owner, p.id, 'setujui')
  await ubahStatusKas(db, k(owner), owner, p.id, 'posting')
  noPindah = p.no
  kasPln = (await kasPosting('keluar', hari(-2), akun['6-1600'], '750.000', 'PLN')).id
})
after(() => hapus())

describe('pengurai CSV', () => {
  test('format KlikBCA: tanggal tanpa tahun, DB/CR, baris PEND dan kaki saldo dilewati', () => {
    const teks = [
      'Informasi Rekening - Mutasi Rekening',
      "No. rekening : ,'7770001234",
      'Periode : ,01/11/2026 - 20/11/2026',
      '',
      'Tanggal Transaksi,Keterangan,Cabang,Jumlah,,Saldo',
      `'03/11,TRSF E-BANKING CR 0311/FTSCY/WS95051 SETORAN,'0000,"5,000,000.00",CR,"15,000,000.00"`,
      `'04/11,"BIAYA ADM, BULANAN",'0000,"15,000.00",DB,"14,985,000.00"`,
      `PEND,TRSF E-BANKING DB,'0000,"1,000.00",DB,`,
      'Saldo Awal : ,,,"10,000,000.00"',
      'Saldo Akhir : ,,,"14,985,000.00"',
    ].join('\n')
    const h = uraiMutasi(teks, { ...CONTOH_FORMAT.klikbca.pemetaan, tahun: 2026 })
    assert.equal(h.baris.length, 2)
    assert.equal(h.baris[0].credit, 5_000_000n)
    assert.equal(h.baris[0].balance, 15_000_000n)
    assert.equal(h.baris[0].date.toISOString().slice(0, 10), '2026-11-03')
    assert.equal(h.baris[1].debit, 15_000n)
    assert.equal(h.baris[1].description, 'BIAYA ADM, BULANAN')
    assert.ok(h.lewat.some((x) => x.nomorBaris === 8), 'baris PEND dilewati')
  })

  test('C-8: angka yang pemisah ribuannya tidak tiga angka ditolak, bukan dibaca 100 kali; kutip tunggal pengapit dibuang', () => {
    const teks = ['Tanggal,Keterangan,Referensi,Debit,Kredit,Saldo', `01/11/2026,'BIAYA ADM',,10000.60,,`, '01/11/2026,ADM,,"10.000,60",,', '01/11/2026,ADM,,1.5,,'].join('\n')
    const h = uraiMutasi(teks, CONTOH_FORMAT.umum.pemetaan)
    assert.deepEqual(h.baris.map((b) => b.debit), [10_001n])
    assert.deepEqual(h.lewat.map((x) => x.nomorBaris), [2, 4])
    assert.match(h.lewat[0].alasan, /tidak sesuai format angka 1\.234\.567,89/)
    const titik = uraiMutasi(`01/11/2026,'BIAYA ADM',,"1,234.50",,\n01/11/2026,X,,"10000,60",,`, { ...CONTOH_FORMAT.umum.pemetaan, lewati: 0, angka: 'titik' })
    assert.deepEqual(titik.baris.map((b) => [b.description, b.debit]), [['BIAYA ADM', 1_235n]])
    assert.equal(titik.lewat.length, 1)
  })

  test('baris kembar di satu berkas tetap dua baris, sidiknya stabil', () => {
    const teks = 'Tanggal,Keterangan,Referensi,Debit,Kredit,Saldo\n01/11/2026,ADM,,1.000,,\n01/11/2026,ADM,,1.000,,\n'
    const a = uraiMutasi(teks, CONTOH_FORMAT.umum.pemetaan)
    const b = uraiMutasi(teks, CONTOH_FORMAT.umum.pemetaan)
    assert.equal(a.baris.length, 2)
    assert.notEqual(a.baris[0].dedupKey, a.baris[1].dedupKey)
    assert.deepEqual(
      a.baris.map((x) => x.dedupKey),
      b.baris.map((x) => x.dedupKey),
    )
  })
})

describe('impor mutasi', () => {
  test('Admin ditolak; impor kedua berkas yang sama tidak menambah baris', async () => {
    await ditolak(() => imporMutasi(db, k(admin), admin, rekening, csvUmum(), CONTOH_FORMAT.umum.pemetaan))
    const a = await imporMutasi(db, k(owner), owner, rekening, csvUmum(), CONTOH_FORMAT.umum.pemetaan, 'mutasi.csv')
    assert.equal(a.baru, 4)
    const b = await imporMutasi(db, k(owner), owner, rekening, csvUmum(), CONTOH_FORMAT.umum.pemetaan, 'mutasi.csv')
    assert.equal(b.baru, 0)
    assert.equal(b.sudahAda, 4)
    assert.equal(await db.bankStatementLine.count({ where: { bankAccountId: rekening } }), 4)
    assert.equal(await db.auditLog.count({ where: { action: 'mutasi.impor' } }), 2)
  })
})

describe('rekonsiliasi', () => {
  test('dibuat dengan saldo awal; Admin ditolak; satu draf per rekening', async () => {
    await ditolak(() => buatRekonsiliasi(db, k(admin), admin, { bankAccountId: String(rekening), periodFrom: hari(-3), periodTo: hari(-1), stmtOpening: '10.000.000' }))
    await galat(() => buatRekonsiliasi(db, k(owner), owner, { bankAccountId: String(rekening), periodFrom: hari(-3), periodTo: hari(-1) }), /saldo awal/)
    const r = await buatRekonsiliasi(db, k(owner), owner, { bankAccountId: String(rekening), periodFrom: hari(-3), periodTo: hari(-1), stmtOpening: '10.000.000' })
    rk = r.id
    const d = await db.bankReconcile.findUniqueOrThrow({ where: { id: rk } })
    assert.match(d.no, /^RK-/)
    assert.equal(d.stmtClosing, 14_136_000n, 'saldo akhir bawaan dari baris mutasi terakhir')
    assert.equal(await db.bankStatementLine.count({ where: { bankReconcileId: rk } }), 4)
    await galat(() => buatRekonsiliasi(db, k(owner), owner, { bankAccountId: String(rekening), periodFrom: hari(-3), periodTo: hari(-1), stmtOpening: '0' }), /Draft/)
  })

  test('saran: referensi nomor dokumen dan nominal sama dalam 3 hari; yang lebih jauh tidak disarankan', async () => {
    const s = await saranCocok(db, rk)
    const mutasi = new Map((await db.bankStatementLine.findMany({ where: { bankReconcileId: rk } })).map((m) => [m.id, m]))
    const per = new Map(s.map((x) => [mutasi.get(x.mutasiId)!.description, x]))
    assert.equal(s.length, 2)
    assert.equal(per.get('SETORAN DARI KAS BESAR')?.alasan, 'referensi')
    assert.equal(per.get('TRSF E-BANKING DB PLN')?.alasan, 'nominal')
    assert.ok(!per.has('TRSF DB TOKO LAMA'), 'pembayaran 8 hari sebelumnya tidak disarankan')
  })

  test('posting ditolak selama ada mutasi belum cocok atau selisih bukan 0', async () => {
    await galat(() => postingRekonsiliasi(db, k(owner), owner, rk), /belum dicocokkan/)
    assert.equal(await terapkanSaran(db, k(owner), owner, rk), 2)
    // Pembayaran lama dicocokkan manual; jumlah yang salah ditolak.
    const lama = await db.bankStatementLine.findFirstOrThrow({ where: { bankReconcileId: rk, description: 'TRSF DB TOKO LAMA' } })
    const jl = await db.journalLine.findFirstOrThrow({ where: { journal: { sourceType: 'cash_transaction', sourceId: kasLama }, bankAccountId: rekening } })
    const pln = await db.journalLine.findFirstOrThrow({ where: { journal: { sourceType: 'cash_transaction', sourceId: kasPln }, bankAccountId: rekening } })
    await galat(() => cocokkan(db, k(owner), owner, rk, lama.id, [pln.id]), /tidak lagi tersedia|tidak sama/)
    await cocokkan(db, k(owner), owner, rk, lama.id, [jl.id])
    assert.equal((await db.journalLine.findUniqueOrThrow({ where: { id: jl.id } })).clearedAt?.toISOString().slice(0, 10), hari(-1))
    // Biaya admin belum ada di buku: dibuat transaksi kas dari baris mutasi, lalu otomatis cocok.
    const adm = await db.bankStatementLine.findFirstOrThrow({ where: { bankReconcileId: rk, description: 'BIAYA ADM' } })
    await ditolak(() => kasDariBarisMutasi(db, k(admin), admin, rk, adm.id, { accountId: String(akun['6-1300']) }))
    const kas = await kasDariBarisMutasi(db, k(owner), owner, rk, adm.id, { accountId: String(akun['6-1300']), memo: 'Biaya administrasi bulanan' })
    assert.equal((await db.cashTransaction.findUniqueOrThrow({ where: { id: kas.id } })).status, 'Diposting')
    assert.equal((await db.bankStatementLine.findUniqueOrThrow({ where: { id: adm.id } })).matchStatus, 'Cocok')
    // Semua cocok, tetapi saldo akhir rekening koran yang diketik salah membuat selisih.
    await ubahKepalaRekonsiliasi(db, k(owner), owner, rk, { periodTo: hari(-1), stmtClosing: '14.100.000' })
    const h = await hitungRekonsiliasi(db, rk)
    assert.equal(h.belumCocok, 0)
    assert.notEqual(h.diff, 0n)
    await galat(() => postingRekonsiliasi(db, k(owner), owner, rk), /tidak sama dengan saldo akhir|Selisih/)
    await ubahKepalaRekonsiliasi(db, k(owner), owner, rk, { periodTo: hari(-1), stmtClosing: '14.136.000' })
    const ok = await hitungRekonsiliasi(db, rk)
    assert.equal(ok.diff, 0n)
    assert.equal(ok.saldoBuku, 14_136_000n)
    assert.equal(ok.outstanding, 0n)
  })

  test('baris jurnal yang sudah dicocokkan terkunci dari pembatalan dokumen sumbernya', async () => {
    await galat(() => ubahStatusKas(db, k(owner), owner, kasPln, 'batal', { alasan: 'Uji kunci rekonsiliasi' }), /dicocokkan/)
    const m = await db.bankStatementLine.findFirstOrThrow({ where: { bankReconcileId: rk, description: 'TRSF E-BANKING DB PLN' } })
    await lepasCocok(db, k(owner), owner, rk, m.id)
    const jl = await db.journalLine.findFirstOrThrow({ where: { journal: { sourceType: 'cash_transaction', sourceId: kasPln }, bankAccountId: rekening } })
    assert.equal(jl.clearedAt, null)
    await cocokkan(db, k(owner), owner, rk, m.id, [jl.id])
  })

  test('selisih 0 boleh Diposting; masih terkunci; rekonsiliasi berikutnya bersambung', async () => {
    await ditolak(() => postingRekonsiliasi(db, k(admin), admin, rk))
    await postingRekonsiliasi(db, k(owner), owner, rk)
    const d = await db.bankReconcile.findUniqueOrThrow({ where: { id: rk } })
    assert.equal(d.status, 'Diposting')
    assert.equal(d.diff, 0n)
    await galat(() => ubahStatusKas(db, k(owner), owner, kasPln, 'batal', { alasan: 'Uji kunci rekonsiliasi' }), /dicocokkan/)
    // Impor ulang baris di periode yang sudah direkonsiliasi tidak menambah apa pun.
    const lagi = await imporMutasi(db, k(owner), owner, rekening, csvUmum(), CONTOH_FORMAT.umum.pemetaan)
    assert.equal(lagi.baru, 0)
    await galat(() => buatRekonsiliasi(db, k(owner), owner, { bankAccountId: String(rekening), periodFrom: hari(-1), periodTo: hari(0) }), /harus dimulai/)
    await galat(() => buatRekonsiliasi(db, k(owner), owner, { bankAccountId: String(rekening), periodFrom: hari(0), periodTo: hari(0), stmtOpening: '1' }), /Saldo awal harus sama/)
    const dua = await buatRekonsiliasi(db, k(owner), owner, { bankAccountId: String(rekening), periodFrom: hari(0), periodTo: hari(0) })
    assert.equal((await db.bankReconcile.findUniqueOrThrow({ where: { id: dua.id } })).stmtOpening, 14_136_000n)
    await galat(() => batalRekonsiliasi(db, k(owner), owner, rk, 'Uji batal berurutan'), /sesudahnya/)
    await batalRekonsiliasi(db, k(owner), owner, dua.id, '')
  })

  test('C-7: jurnal bank baru bertanggal di periode yang sudah Diposting tidak mengubah angka rekonsiliasi itu', async () => {
    const d = await db.bankReconcile.findUniqueOrThrow({ where: { id: rk } })
    const sebelum = (await rincianRekonsiliasi(db, rk))!.h
    const telat = await kasPosting('keluar', tanggalIso(d.periodTo), akun['6-1300'], '7.000', 'Biaya telat')
    const h = (await rincianRekonsiliasi(db, rk))!.h
    assert.equal(h.saldoBuku, d.bookClosing, 'saldo buku = angka saat posting')
    assert.equal(h.outstanding, d.outstanding)
    assert.equal(h.diff, 0n)
    assert.equal(h.belumCair.length, sebelum.belumCair.length, 'daftar belum cair tidak bertambah')
    assert.equal(h.sesudahPosting.length, 1)
    assert.equal(h.nilaiSesudahPosting, -7_000n)
    // Jurnal itu menjadi belum cair di hitungan rekonsiliasi yang masih Draft (rekonsiliasi berikutnya).
    const dua = await buatRekonsiliasi(db, k(owner), owner, { bankAccountId: String(rekening), periodFrom: hari(0), periodTo: hari(0) })
    const h2 = await hitungRekonsiliasi(db, dua.id, false)
    assert.ok(h2.belumCair.some((l) => l.docNo === telat.no), 'kas telat belum cair di rekonsiliasi berikutnya')
    await batalRekonsiliasi(db, k(owner), owner, dua.id, '')
    await ubahStatusKas(db, k(owner), owner, telat.id, 'batal', { alasan: 'Uji jurnal telat' })
  })

  test('batal rekonsiliasi Diposting membuka kunci baris jurnal', async () => {
    await galat(() => batalRekonsiliasi(db, k(owner), owner, rk, ''), /alasan/)
    await batalRekonsiliasi(db, k(owner), owner, rk, 'Rekening koran salah unduh')
    assert.equal(await db.bankReconcileMatch.count(), 0)
    assert.equal(await db.bankStatementLine.count({ where: { matchStatus: 'Cocok' } }), 0)
    await ubahStatusKas(db, k(owner), owner, kasPln, 'batal', { alasan: 'Sekarang boleh dibatalkan' })
    const aksi = new Set((await db.auditLog.findMany({ where: { docType: 'bank_reconcile' } })).map((a) => a.action))
    for (const a of ['rekonsiliasi.tambah', 'rekonsiliasi.cocok', 'rekonsiliasi.lepas', 'rekonsiliasi.ubah', 'rekonsiliasi.posting', 'rekonsiliasi.batal']) assert.ok(aksi.has(a), a)
  })
})
